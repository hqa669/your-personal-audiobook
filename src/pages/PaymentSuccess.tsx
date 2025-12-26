import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Loader2, BookOpen } from "lucide-react";
import { motion } from "framer-motion";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isVerifying, setIsVerifying] = useState(true);
  
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    // Give webhook time to process
    const timer = setTimeout(() => {
      setIsVerifying(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-16 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="max-w-md w-full text-center">
            <CardHeader className="pb-4">
              {isVerifying ? (
                <div className="mx-auto mb-4">
                  <Loader2 className="h-16 w-16 text-primary animate-spin" />
                </div>
              ) : (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 10 }}
                  className="mx-auto mb-4"
                >
                  <CheckCircle className="h-16 w-16 text-sage" />
                </motion.div>
              )}
              
              <CardTitle className="font-serif text-2xl">
                {isVerifying ? "Setting up your account..." : "Welcome to BookMine!"}
              </CardTitle>
              <CardDescription className="text-base">
                {isVerifying 
                  ? "Please wait while we activate your subscription."
                  : "Your subscription is now active. You have a 14-day free trial to explore all features."
                }
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {!isVerifying && (
                <>
                  <div className="bg-accent/50 rounded-lg p-4 text-sm text-foreground/80">
                    <p className="font-medium mb-2">What's included:</p>
                    <ul className="text-left space-y-1">
                      <li>✓ Unlimited book uploads</li>
                      <li>✓ AI voice generation</li>
                      <li>✓ Speed controls & auto-scroll</li>
                      <li>✓ Resume playback across devices</li>
                    </ul>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <Button 
                      onClick={() => navigate("/library")}
                      className="w-full"
                      size="lg"
                    >
                      <BookOpen className="mr-2 h-4 w-4" />
                      Go to My Library
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => navigate("/discover")}
                      className="w-full"
                    >
                      Explore Free Books
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default PaymentSuccess;
