-- Add stripe_customer_id to profiles table for Stripe integration
ALTER TABLE public.profiles
ADD COLUMN stripe_customer_id TEXT;