import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export type SubscriptionTier = "free" | "trial" | "basic" | "annual";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "expired";

interface SubscriptionInfo {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  endDate: string | null;
  isActive: boolean;
  canPlayAudio: boolean;
}

export function useSubscription() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<SubscriptionInfo>({
    tier: "free",
    status: "active",
    endDate: null,
    isActive: false,
    canPlayAudio: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setSubscription({
        tier: "free",
        status: "active",
        endDate: null,
        isActive: false,
        canPlayAudio: false,
      });
      setIsLoading(false);
      return;
    }

    fetchSubscription();
  }, [user]);

  const fetchSubscription = async () => {
    if (!user) return;

    try {
      // Use the secure view that excludes sensitive Stripe data
      const { data, error } = await supabase
        .from("profiles_safe" as any)
        .select("subscription_tier, subscription_status, subscription_end_date")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      const profileData = data as unknown as {
        subscription_tier: string | null;
        subscription_status: string | null;
        subscription_end_date: string | null;
      } | null;

      const tier = (profileData?.subscription_tier || "free") as SubscriptionTier;
      const status = (profileData?.subscription_status || "active") as SubscriptionStatus;
      const endDate = profileData?.subscription_end_date || null;
      
      // Check if subscription is active
      const isActive = status === "active" && (tier === "trial" || tier === "basic" || tier === "annual");
      
      // Can play audio if paid (trial, basic, or annual) and not expired
      const canPlayAudio = isActive;

      setSubscription({ tier, status, endDate, isActive, canPlayAudio });
    } catch (error) {
      console.error("Error fetching subscription:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const startCheckout = async (plan: "free" | "basic" | "annual") => {
    if (!user) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to subscribe.",
        variant: "destructive",
      });
      return null;
    }

    setIsCheckoutLoading(true);

    try {
      console.log("[checkout] start", {
        plan,
        origin: window.location.origin,
      });
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          plan,
          successUrl: `${window.location.origin}/payment/success`,
          cancelUrl: `${window.location.origin}/payment/cancel`,
        },
      });

      console.log("[checkout] response", { data, error });

      if (error) throw error;

      if (plan === "free") {
        // Free plan updated directly, refresh subscription
        await fetchSubscription();
        setIsCheckoutLoading(false);
        toast({
          title: "Welcome to BookMine!",
          description: "Your free account is ready.",
        });
        return { success: true };
      }

      // For paid plans, redirect to Stripe
      const checkoutUrl = data?.url;

      console.log("[checkout] checkoutUrl", checkoutUrl);
      
      if (checkoutUrl) {
        // IMPORTANT: Do not call any state setters after this point
        // The page is about to navigate away - any React state updates 
        // could cause a re-render that interrupts the navigation
        
        // Use setTimeout to ensure the redirect happens after the current
        // JavaScript execution context completes
        setTimeout(() => {
          window.location.assign(checkoutUrl);
        }, 0);
        
        // Return immediately without updating any state
        return { url: checkoutUrl };
      }

      setIsCheckoutLoading(false);
      throw new Error("No checkout URL returned from server");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Something went wrong";
      console.error("Checkout error:", error);
      setIsCheckoutLoading(false);
      toast({
        title: "Checkout failed",
        description: errorMessage + ". Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const openPortal = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: { returnUrl: window.location.href },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error("Portal error:", error);
      toast({
        title: "Could not open subscription manager",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    }
  };

  return {
    subscription,
    isLoading,
    isCheckoutLoading,
    startCheckout,
    openPortal,
    refetch: fetchSubscription,
  };
}
