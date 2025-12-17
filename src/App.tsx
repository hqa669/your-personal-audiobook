import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Library from "./pages/Library";
import Discover from "./pages/Discover";
import Reader from "./pages/Reader";
import PublicReader from "./pages/PublicReader";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route 
                path="/library" 
                element={
                  <ProtectedRoute>
                    <Library />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/discover" 
                element={
                  <ProtectedRoute>
                    <Discover />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/reader/:id" 
                element={
                  <ProtectedRoute>
                    <Reader />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/reader/public/:id" 
                element={
                  <ProtectedRoute>
                    <PublicReader />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute>
                    <Admin />
                  </ProtectedRoute>
                } 
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
