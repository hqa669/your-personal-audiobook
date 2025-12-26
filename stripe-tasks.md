# Stripe Integration Plan for Photo Under a Minute

## Task 1 \- Database Setup

### 1.1. Update Profiles Table

* Add credits column (INTEGER) with default value 0 to track purchased credits  
* Add free\_credit\_used column (BOOLEAN) with default value FALSE to track if the free generation was used  
* Add stripe\_customer\_id column (TEXT) to store the Stripe customer ID for future purchases

### 1.2. Create Transactions Table

* Create a new table to track all purchase transactions  
* Include columns: id (UUID), profile\_id (UUID), stripe\_session\_id (TEXT), amount (INTEGER), credits\_purchased (INTEGER), status (TEXT), created\_at (TIMESTAMPTZ)  
* Add appropriate Row Level Security (RLS) policies

## Task 2 \- Stripe Environment Setup

### 2.1. Create Stripe Products

* Create "Base Pack" product ($4.99 for 10 image transformations)  
* Create "Ultimate Pack" product ($19.99 for 50 image transformations)  
* Save the Price IDs for both products

### 2.2. Configure Environment Variables

* Add STRIPE\_SECRET\_KEY to Supabase Edge Function secrets  
* Add STRIPE\_PRICE\_ID\_BASE for the Base Pack price ID  
* Add STRIPE\_PRICE\_ID\_ULTIMATE for the Ultimate Pack price ID

## Task 3 \- Edge Functions Implementation

### 3.1. Create Checkout Edge Function

* Create create-checkout function to initiate Stripe payment sessions  
* Handle one-time payments with product selection (base/ultimate)  
* Include metadata for tracking the purchase type and credits  
* Set up success and cancel URLs

### 3.2. Create Payment Verification Edge Function

* Create verify-payment function to check payment status  
* Update user credits in the profiles table upon successful payment  
* Record transaction details in the transactions table

## Task 4 \- Frontend Integration

### 4.1. Update PricingCards Component

* Connect the "Get Base Pack" and "Get Ultimate Pack" buttons to the checkout flow  
* Handle authentication status (prompt login if needed)  
* Add loading states during checkout creation

### 4.2. Create Payment Success/Cancel Pages

* Create a success page to show after successful purchase  
* Create a cancel page for abandoned checkout  
* Include credit balance display on success page

### 4.3. Add Credits Display Component

* Create a component to show current credit balance  
* Add to navigation/header for visibility across the app  
* Update AuthContext to include credits information

## Task 5 \- Credit Management System

### 5.1. Implement Free Credit Logic

* Check and use the free credit for new users  
* Update the free\_credit\_used flag after first generation

### 5.2. Implement Credit Consumption Logic

* Update transformation process to check for available credits  
* Deduct credits when generating images  
* Show appropriate messaging when credits are low/depleted

### 5.3. Handle Credit Purchase Flow

* Redirect to pricing page when credits are depleted  
* Show clear messaging about pricing options  
* Provide a seamless return to transformation after purchase

This plan outlines all the necessary steps to integrate Stripe payments into your application based on your specific pricing model: one free generation, followed by paid options of 10 images for $4.99 or 50 images for $19.99.

The plan uses Stripe Checkout for secure, compliant payment processing and leverages Supabase Edge Functions to handle the backend logic. This approach minimizes security risks by ensuring payment details are handled entirely by Stripe.

The implementation follows best practices from the stripe-steps.md document while focusing specifically on the one-time payment model you requested instead of subscriptions.  
