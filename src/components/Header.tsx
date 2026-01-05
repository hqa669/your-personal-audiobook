import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User, LogOut, BookOpen, Loader2, CreditCard, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { toast } from 'sonner';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading, signOut } = useAuth();
  const { subscription, openPortal } = useSubscription();

  const handleLogout = async () => {
    await signOut();
    toast.success('You have been signed out');
    navigate('/auth');
  };

  const getTierBadge = () => {
    if (!user || !subscription.tier) return null;
    
    const tierConfig = {
      free: { label: 'Free', className: 'bg-muted text-muted-foreground' },
      trial: { label: 'Trial', className: 'bg-sage/20 text-sage-dark' },
      basic: { label: 'Basic', className: 'bg-primary/20 text-primary' },
      annual: { label: 'Annual', className: 'bg-primary text-primary-foreground' },
    };
    
    const config = tierConfig[subscription.tier];
    return (
      <Badge variant="secondary" className={cn('text-xs', config.className)}>
        {config.label}
      </Badge>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <BookOpen className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
          <span className="font-serif text-xl text-foreground">BookMine</span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {user && (
            <>
              <Link
                to="/library"
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  location.pathname === '/library' ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                My Library
              </Link>
              <Link
                to="/discover"
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  location.pathname === '/discover' ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                Discover
              </Link>
            </>
          )}
        </nav>

        {/* Auth buttons */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          ) : user ? (
            <>
              {getTierBadge()}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <User className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to="/library" className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      My Library
                    </Link>
                  </DropdownMenuItem>
                  {subscription.tier !== 'free' && (
                    <DropdownMenuItem onClick={openPortal} className="flex items-center gap-2 cursor-pointer">
                      <CreditCard className="w-4 h-4" />
                      Manage Subscription
                    </DropdownMenuItem>
                  )}
                  {subscription.tier === 'free' && (
                    <DropdownMenuItem asChild>
                      <Link to="/pricing" className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Upgrade Plan
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/auth?mode=change-password" className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4" />
                      Change Password
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 cursor-pointer">
                    <LogOut className="w-4 h-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button variant="warm" size="sm" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
