import { Link, useLocation } from 'react-router-dom';
import { User, LogOut, BookOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function Header() {
  const location = useLocation();
  const { user, isLoading, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    toast.success('You have been signed out');
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
              <Button variant="ghost" size="icon" asChild>
                <Link to="/library">
                  <User className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">Log out</span>
              </Button>
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
