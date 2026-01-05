import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, BookOpen, Loader2, Eye, EyeOff, KeyRound, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';

const authSchema = z.object({
  email: z.string().trim().email({ message: 'Please enter a valid email' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

const passwordChangeSchema = z.object({
  newPassword: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  confirmPassword: z.string().min(6, { message: 'Password must be at least 6 characters' }),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function Auth() {
  const [searchParams] = useSearchParams();
  const isChangePassword = searchParams.get('mode') === 'change-password';
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [errors, setErrors] = useState<{ email?: string; password?: string; newPassword?: string; confirmPassword?: string }>({});
  
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, signUp } = useAuth();

  // Redirect if already logged in (but not for change password mode)
  useEffect(() => {
    if (user && !isChangePassword) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/library';
      navigate(from, { replace: true });
    }
    // Redirect to auth if not logged in and trying to change password
    if (!user && isChangePassword) {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate, location, isChangePassword]);

  const validateForm = () => {
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
        if (err.path[0] === 'password') fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const validatePasswordChange = () => {
    const result = passwordChangeSchema.safeParse({ newPassword, confirmPassword });
    if (!result.success) {
      const fieldErrors: { newPassword?: string; confirmPassword?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'newPassword') fieldErrors.newPassword = err.message;
        if (err.path[0] === 'confirmPassword') fieldErrors.confirmPassword = err.message;
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validatePasswordChange()) return;

    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password updated successfully!');
        navigate('/library');
      }
    } catch (error) {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsLoading(true);
    
    try {
      if (mode === 'signup') {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('This email is already registered. Please sign in instead.');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Welcome to BookMine! Your account has been created.');
          navigate('/library');
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Invalid email or password. Please try again.');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Welcome back to BookMine!');
          const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/library';
          navigate(from, { replace: true });
        }
      }
    } catch (error) {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Change Password Mode
  if (isChangePassword && user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center justify-center gap-2 mb-8">
            <BookOpen className="w-8 h-8 text-primary" />
            <span className="font-serif text-2xl text-foreground">BookMine</span>
          </Link>

          {/* Card */}
          <div className="bg-card rounded-3xl p-8 shadow-card border border-border/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/library')}
              className="mb-4 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Library
            </Button>

            <h1 className="font-serif text-2xl text-center text-foreground mb-2">
              Change Password
            </h1>
            <p className="text-muted-foreground text-center mb-8">
              Enter your new password below
            </p>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-warm pr-10"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {errors.newPassword && (
                  <p className="text-sm text-destructive mt-1">{errors.newPassword}</p>
                )}
              </div>

              <div className="relative">
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-warm pr-10"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive mt-1">{errors.confirmPassword}</p>
                )}
              </div>

              <Button
                type="submit"
                variant="warm"
                size="lg"
                className="w-full gap-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <KeyRound className="w-4 h-4" />
                )}
                Update Password
              </Button>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <BookOpen className="w-8 h-8 text-primary" />
          <span className="font-serif text-2xl text-foreground">BookMine</span>
        </Link>

        {/* Card */}
        <div className="bg-card rounded-3xl p-8 shadow-card border border-border/50">
          <h1 className="font-serif text-2xl text-center text-foreground mb-2">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-muted-foreground text-center mb-8">
            {mode === 'signin' 
              ? 'Sign in to continue to your library' 
              : 'Start your audiobook journey today'}
          </p>

          {/* Email form */}
          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            <div>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-warm"
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-sm text-destructive mt-1">{errors.email}</p>
              )}
            </div>
            
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-warm pr-10"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              {errors.password && (
                <p className="text-sm text-destructive mt-1">{errors.password}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="warm"
              size="lg"
              className="w-full gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          {/* Toggle mode */}
          <p className="text-sm text-center text-muted-foreground">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button 
                  onClick={() => setMode('signup')}
                  className="text-primary hover:underline font-medium"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button 
                  onClick={() => setMode('signin')}
                  className="text-primary hover:underline font-medium"
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          {/* Terms */}
          <p className="text-xs text-muted-foreground text-center mt-6">
            By signing in you agree to our{' '}
            <a href="#" className="text-primary hover:underline">Terms of Use</a>
            {' '}and{' '}
            <a href="#" className="text-primary hover:underline">Privacy Policy</a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
