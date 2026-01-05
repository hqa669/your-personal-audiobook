-- Drop and recreate the view with explicit SECURITY INVOKER (the secure option)
-- SECURITY INVOKER means the view respects the querying user's permissions
DROP VIEW IF EXISTS public.profiles_safe;

CREATE VIEW public.profiles_safe 
WITH (security_invoker = true) AS
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

-- Grant access to authenticated users only
GRANT SELECT ON public.profiles_safe TO authenticated;

-- Ensure no anonymous or public access
REVOKE ALL ON public.profiles_safe FROM anon;
REVOKE ALL ON public.profiles_safe FROM public;

COMMENT ON VIEW public.profiles_safe IS 'Secure view that excludes sensitive Stripe customer/subscription IDs. Uses SECURITY INVOKER to respect RLS policies of the querying user.';