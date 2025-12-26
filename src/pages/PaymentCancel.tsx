import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, ArrowLeft, CreditCard } from "lucide-react";
import { motion } from "framer-motion";

const PaymentCancel = () => {
  const navigate = useNavigate();

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
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 10 }}
                className="mx-auto mb-4"
              >
                <XCircle className="h-16 w-16 text-muted-foreground" />
              </motion.div>
              
              <CardTitle className="font-serif text-2xl">
                Payment Cancelled
              </CardTitle>
              <CardDescription className="text-base">
                No worries! Your payment was not processed. You can try again whenever you're ready.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="bg-accent/30 rounded-lg p-4 text-sm text-foreground/80">
                <p>
                  If you experienced any issues during checkout, please contact our support team.
                </p>
              </div>
              
              <div className="flex flex-col gap-2">
                <Button 
                  onClick={() => navigate("/pricing")}
                  className="w-full"
                  size="lg"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  View Plans Again
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="w-full"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default PaymentCancel;
