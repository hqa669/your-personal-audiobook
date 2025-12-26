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
      const { data, error } = await supabase
        .from("profiles")
        .select("subscription_tier, subscription_status, subscription_end_date")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      const tier = (data?.subscription_tier || "free") as SubscriptionTier;
      const status = (data?.subscription_status || "active") as SubscriptionStatus;
      const endDate = data?.subscription_end_date || null;
      
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
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          plan,
          successUrl: `${window.location.origin}/payment/success`,
          cancelUrl: `${window.location.origin}/payment/cancel`,
        },
      });

      if (error) throw error;

      if (plan === "free") {
        // Free plan updated directly, refresh subscription
        await fetchSubscription();
        toast({
          title: "Welcome to BookMine!",
          description: "Your free account is ready.",
        });
        return { success: true };
      }

      // For paid plans, redirect to Stripe
      if (data?.url) {
        window.location.href = data.url;
        return { url: data.url };
      }

      throw new Error("No checkout URL returned");
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast({
        title: "Checkout failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsCheckoutLoading(false);
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
