import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid plan types
const VALID_PLANS = ["free", "basic", "annual"] as const;
type PlanType = typeof VALID_PLANS[number];

function validateInputs(plan: unknown, successUrl: unknown, cancelUrl: unknown): { plan: PlanType; successUrl: string | undefined; cancelUrl: string | undefined } {
  // Validate plan
  if (!plan || typeof plan !== "string" || !VALID_PLANS.includes(plan as PlanType)) {
    throw new Error("Invalid plan type. Must be 'free', 'basic', or 'annual'");
  }
  
  // Validate URLs if provided
  const validatedSuccessUrl = validateUrl(successUrl, "successUrl");
  const validatedCancelUrl = validateUrl(cancelUrl, "cancelUrl");
  
  return { plan: plan as PlanType, successUrl: validatedSuccessUrl, cancelUrl: validatedCancelUrl };
}

function validateUrl(url: unknown, fieldName: string): string | undefined {
  if (url === undefined || url === null || url === "") {
    return undefined;
  }
  
  if (typeof url !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  
  try {
    const parsedUrl = new URL(url);
    // Only allow https in production (allow http for localhost development)
    if (parsedUrl.protocol !== "https:" && !parsedUrl.hostname.includes("localhost")) {
      throw new Error(`${fieldName} must use HTTPS`);
    }
    return url;
  } catch {
    throw new Error(`Invalid ${fieldName} format`);
  }
}

/**
 * Map errors to safe client messages - prevents information leakage
 */
function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid plan")) return "Invalid subscription plan selected";
    if (msg.includes("url")) return "Invalid redirect URL provided";
    if (msg.includes("authorization") || msg.includes("authenticated")) return "Authentication required";
    if (msg.includes("stripe") || msg.includes("customer") || msg.includes("checkout")) return "Payment processing error. Please try again.";
    if (msg.includes("price id")) return "Subscription configuration error. Please contact support.";
    if (msg.includes("profile")) return "Unable to update account. Please try again.";
  }
  return "An unexpected error occurred. Please try again later.";
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawInput = await req.json();
    
    // Validate inputs
    const { plan, successUrl, cancelUrl } = validateInputs(
      rawInput.plan,
      rawInput.successUrl,
      rawInput.cancelUrl
    );
    
    console.log("Create checkout request:", {
      plan,
      hasSuccessUrl: !!successUrl,
      hasCancelUrl: !!cancelUrl,
      origin: req.headers.get("origin"),
    });

    // Get the user from the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    console.log("User authenticated:", user.id);

    // Handle FREE plan - no Stripe needed
    if (plan === "free") {
      console.log("Free plan selected, updating profile directly");
      
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          subscription_tier: "free",
          subscription_status: "active",
          subscription_end_date: null,
          stripe_subscription_id: null,
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        throw new Error("Failed to update profile");
      }

      return new Response(
        JSON.stringify({ success: true, plan: "free" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For paid plans, create Stripe checkout
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2023-10-16",
    });

    // Get the price ID based on plan
    let priceId: string;
    if (plan === "basic") {
      priceId = Deno.env.get("STRIPE_PRICE_BASIC") ?? "";
    } else if (plan === "annual") {
      priceId = Deno.env.get("STRIPE_PRICE_ANNUAL") ?? "";
    } else {
      throw new Error("Invalid plan type");
    }

    if (!priceId) {
      throw new Error(`Price ID not configured for plan: ${plan}`);
    }

    console.log("Using price ID for plan:", plan);

    // Check if customer already exists
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    // Create or retrieve Stripe customer
    if (!customerId) {
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { user_id: user.id },
        });
        customerId = customer.id;
      }

      // Save customer ID to profile
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);

      console.log("Created/retrieved Stripe customer");
    }

    // Create checkout session with 14-day trial
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      subscription_data: {
        trial_period_days: 14,
        metadata: { user_id: user.id, plan },
      },
      success_url: successUrl || `${req.headers.get("origin")}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.get("origin")}/payment/cancel`,
      metadata: { user_id: user.id, plan },
    });

    console.log("Created checkout session:", session.id);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in create-checkout (full):", error);
    return new Response(
      JSON.stringify({ error: getSafeErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
