import { useNavigate } from "react-router-dom";
import { Sparkles, Crown, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onClose();
    navigate("/pricing");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Crown className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="font-serif text-2xl">
            Unlock Audio Books
          </DialogTitle>
          <DialogDescription className="text-base">
            AI-generated voice is a premium feature. Start your 14-day free trial to listen to your books.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-audio-ready/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-audio-ready" />
              </div>
              <span>AI-powered natural voice narration</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-audio-ready/10 flex items-center justify-center">
                <Zap className="w-4 h-4 text-audio-ready" />
              </div>
              <span>Generate audio for unlimited chapters</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-audio-ready/10 flex items-center justify-center">
                <Crown className="w-4 h-4 text-audio-ready" />
              </div>
              <span>14-day free trial, cancel anytime</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            variant="warm"
            size="lg"
            className="w-full"
            onClick={handleUpgrade}
          >
            Start Free Trial
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={onClose}
          >
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
