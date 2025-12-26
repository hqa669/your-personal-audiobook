-- Create enum for subscription tier
CREATE TYPE public.subscription_tier AS ENUM ('free', 'trial', 'basic', 'annual');

-- Create enum for subscription status
CREATE TYPE public.subscription_status AS ENUM ('active', 'canceled', 'past_due', 'expired');

-- Add subscription columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN subscription_tier subscription_tier NOT NULL DEFAULT 'free',
ADD COLUMN subscription_status subscription_status NOT NULL DEFAULT 'active',
ADD COLUMN subscription_end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN stripe_subscription_id TEXT;