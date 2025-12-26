import { Check, Headphones, BookOpen, Library, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/Header";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";

const features = [
  { icon: BookOpen, text: "Upload & convert your EPUBs to audio" },
  { icon: Headphones, text: "AI-narrated audiobooks with natural voices" },
  { icon: Library, text: "Beautiful library with cover art & status" },
  { icon: Sparkles, text: "Dual mode: read text + listen with sync" },
];

const plans = [
  {
    name: "Free",
    planId: "free" as const,
    description: "Explore BookMine",
    price: "FREE",
    period: "forever",
    features: [
      "Access to free public classics",
      "Upload up to 3 books",
      "Basic text reading",
      "No audio playback",
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Basic Plan",
    planId: "basic" as const,
    description: "For casual listeners",
    price: "$5.99",
    period: "per month",
    features: [
      "14-day free trial",
      "Unlimited book uploads",
      "Unlimited AI voice generation",
      "Speed controls & auto-scroll",
      "Resume playback across devices",
      "Full library management",
      "Priority voice processing",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Annual Plan",
    planId: "annual" as const,
    description: "Best value for book lovers",
    price: "$50",
    period: "per year",
    savings: "Save 30%",
    features: [
      "14-day free trial",
      "Everything in Basic",
      "Unlimited book uploads",
      "Unlimited AI voice generation",
      "Speed controls & auto-scroll",
      "Resume playback across devices",
      "Full library management",
      "Priority voice processing",
      "Early access to new features",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, isCheckoutLoading, startCheckout } = useSubscription();

  const handleSelectPlan = async (planId: "free" | "basic" | "annual") => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const result = await startCheckout(planId);
    
    // For free plan, redirect to library after success
    if (planId === "free" && result?.success) {
      navigate("/library");
    }
    // For paid plans, Stripe redirect happens in startCheckout
  };

  const isCurrentPlan = (planId: string) => {
    if (!user) return false;
    return subscription.tier === planId;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground mb-4">
            Choose Your Listening Experience
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Transform your EPUB books into immersive audiobooks. No subscriptions to big platforms, no gatekeeping—just your books, your way.
          </p>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16 max-w-4xl mx-auto">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="flex flex-col items-center text-center p-4 rounded-xl bg-accent/30"
            >
              <feature.icon className="h-8 w-8 text-primary mb-2" />
              <span className="text-sm text-foreground/80">{feature.text}</span>
            </div>
          ))}
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index}
              className={`relative overflow-hidden transition-all duration-300 hover:shadow-elegant ${
                plan.popular 
                  ? "border-primary border-2 shadow-lg scale-105" 
                  : "border-border hover:border-primary/50"
              }`}
            >
              {plan.popular && (
                <Badge 
                  className="absolute top-4 right-4 bg-primary text-primary-foreground"
                >
                  Most Popular
                </Badge>
              )}
              
              {isCurrentPlan(plan.planId) && (
                <Badge 
                  className="absolute top-4 left-4 bg-sage text-sage-foreground"
                >
                  Current Plan
                </Badge>
              )}
              
              <CardHeader className="pb-4">
                <CardTitle className="font-serif text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {/* Price */}
                <div className="space-y-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-muted-foreground">/{plan.period}</span>
                  </div>
                  {plan.savings && (
                    <Badge variant="secondary" className="bg-sage/20 text-sage-dark">
                      {plan.savings}
                    </Badge>
                  )}
                </div>

                {/* Features List */}
                <ul className="space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-sage shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground/80">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button 
                  className={`w-full ${
                    plan.popular 
                      ? "bg-primary hover:bg-primary/90" 
                      : "bg-secondary hover:bg-secondary/90"
                  }`}
                  size="lg"
                  onClick={() => handleSelectPlan(plan.planId)}
                  disabled={isCheckoutLoading || isCurrentPlan(plan.planId)}
                >
                  {isCheckoutLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : isCurrentPlan(plan.planId) ? (
                    "Current Plan"
                  ) : (
                    plan.cta
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Trust Section */}
        <div className="text-center mt-16 space-y-4">
          <p className="text-muted-foreground">
            ✨ Cancel anytime • 🔒 Secure payments • 📚 Your books stay private
          </p>
          <p className="text-sm text-muted-foreground/70">
            All plans include access to our growing library of free public domain classics.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Pricing;
