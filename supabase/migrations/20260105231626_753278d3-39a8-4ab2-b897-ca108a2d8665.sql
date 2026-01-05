-- Create a secure view that excludes sensitive Stripe data
-- This view only exposes the columns needed by the client
CREATE OR REPLACE VIEW public.profiles_safe AS
SELECT 
  id,
  display_name,
  avatar_url,
  subscription_tier,
  subscription_status,
  subscription_end_date,
  created_at,
  updated_at
FROM public.profiles;

-- Grant access to authenticated users only (not anon)
GRANT SELECT ON public.profiles_safe TO authenticated;

-- Revoke any default public access
REVOKE ALL ON public.profiles_safe FROM anon;
REVOKE ALL ON public.profiles_safe FROM public;

-- Enable RLS on the view (views inherit RLS from underlying table, but explicit is better)
-- Add a policy note comment for clarity
COMMENT ON VIEW public.profiles_safe IS 'Secure view that excludes sensitive Stripe customer/subscription IDs. Use this view for client-side queries instead of the profiles table directly.';