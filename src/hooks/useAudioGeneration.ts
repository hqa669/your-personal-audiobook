import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useAudioGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateAudio = useCallback(async (bookId: string) => {
    if (isGenerating) return;

    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-audio', {
        body: { bookId },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success('Voice generation started! This may take a few minutes.', {
        description: 'We\'ll update the book status when it\'s ready.',
      });

      return true;
    } catch (err) {
      console.error('Failed to start audio generation:', err);
      toast.error('Failed to start voice generation', {
        description: err instanceof Error ? err.message : 'Please try again later.',
      });
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating]);

  return {
    generateAudio,
    isGenerating,
  };
}
