import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("No stripe-signature header");
    return new Response("No signature", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", errMessage);
    return new Response(`Webhook Error: ${errMessage}`, { status: 400 });
  }

  console.log("Received webhook event:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("Checkout session completed:", session.id);

        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;

        if (!userId) {
          console.error("No user_id in session metadata");
          break;
        }

        // Get subscription details
        const subscriptionId = session.subscription as string;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        const tier = plan === "annual" ? "annual" : "basic";
        const status = subscription.status === "trialing" ? "active" : "active";
        const endDate = new Date(subscription.current_period_end * 1000).toISOString();

        console.log("Updating profile:", { userId, tier, status, endDate, subscriptionId });

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            subscription_tier: subscription.status === "trialing" ? "trial" : tier,
            subscription_status: status,
            subscription_end_date: endDate,
            stripe_subscription_id: subscriptionId,
          })
          .eq("id", userId);

        if (error) {
          console.error("Error updating profile:", error);
        } else {
          console.log("Profile updated successfully");
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("Subscription updated:", subscription.id);

        // Find user by stripe_subscription_id
        const { data: profile, error: findError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (findError || !profile) {
          console.error("Could not find profile for subscription:", subscription.id);
          break;
        }

        // Determine tier based on price
        const priceId = subscription.items.data[0]?.price.id;
        let tier: "trial" | "basic" | "annual" = "basic";

        if (subscription.status === "trialing") {
          tier = "trial";
        } else if (priceId === Deno.env.get("STRIPE_PRICE_ANNUAL")) {
          tier = "annual";
        }

        // Map Stripe status to our status
        let status: "active" | "canceled" | "past_due" | "expired" = "active";
        if (subscription.status === "past_due") {
          status = "past_due";
        } else if (subscription.status === "canceled" || subscription.cancel_at_period_end) {
          status = subscription.cancel_at_period_end ? "active" : "canceled"; // Keep active until period ends
        }

        const endDate = new Date(subscription.current_period_end * 1000).toISOString();

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            subscription_tier: tier,
            subscription_status: status,
            subscription_end_date: endDate,
          })
          .eq("id", profile.id);

        if (error) {
          console.error("Error updating profile:", error);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("Subscription deleted:", subscription.id);

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (profile) {
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({
              subscription_tier: "free",
              subscription_status: "expired",
              subscription_end_date: new Date().toISOString(),
              stripe_subscription_id: null,
            })
            .eq("id", profile.id);

          if (error) {
            console.error("Error updating profile:", error);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("Invoice payment failed:", invoice.id);

        const subscriptionId = invoice.subscription as string;
        if (!subscriptionId) break;

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", subscriptionId)
          .single();

        if (profile) {
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ subscription_status: "past_due" })
            .eq("id", profile.id);

          if (error) {
            console.error("Error updating profile:", error);
          }
        }
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing webhook:", error);
    return new Response(`Webhook Error: ${errorMessage}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
