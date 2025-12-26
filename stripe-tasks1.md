## Task 1 \- STRIPE ACCOUNT SETUP (User Action)

### 1.1. Create Stripe Account

* Go to [stripe.com](https://stripe.com/) and create an account  
* Complete business verification

### 1.2. Create Products in Stripe Dashboard

* Create "BookMine Basic" product with $5.99/month recurring price  
* Create "BookMine Annual" product with $50/year recurring price  
* Note down each Price ID (starts with price\_)

### 1.3. Configure Trial Settings

* Enable 14-day trial on Basic plan with card required upfront  
* Set trial to auto-convert to Basic billing

### 1.4. Get API Keys

* Go to Developers → API Keys  
* Copy the Secret Key (starts with sk\_)  
* Provide the Secret Key to me for edge function configuration

### 1.5. Set Up Webhook

* Go to Developers → Webhooks → Add endpoint  
* URL will be: https://hisqrjhsefbdlhnhzxdk.supabase.co/functions/v1/stripe-webhook  
* Select events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment\_failed  
* Copy the Webhook Signing Secret (starts with whsec\_)

---

## Task 2 \- DATABASE UPDATES (Lovable Action)

### 2.1. Add Subscription Columns to Profiles Table

* Add subscription\_tier column (enum: 'free', 'trial', 'basic', 'annual')  
* Add subscription\_status column (enum: 'active', 'canceled', 'past\_due', 'expired')  
* Add subscription\_end\_date column (timestamp)  
* Add stripe\_subscription\_id column (text)

---

## Task 3 \- SECRETS CONFIGURATION (Collaborative)

### 3.1. Add Stripe Secrets

* STRIPE\_SECRET\_KEY \- from Stripe Dashboard  
* STRIPE\_WEBHOOK\_SECRET \- from webhook endpoint setup  
* STRIPE\_PRICE\_BASIC \- Price ID for Basic plan  
* STRIPE\_PRICE\_ANNUAL \- Price ID for Annual plan

---

## Task 4 \- EDGE FUNCTIONS (Lovable Action)

### 4.1. Create create-checkout Edge Function

* Accepts plan type (basic/annual)  
* Creates Stripe customer if not exists  
* Creates checkout session with 14-day trial  
* Returns checkout URL

### 4.2. Create stripe-webhook Edge Function

* Verifies webhook signature  
* Handles checkout.session.completed → activates subscription  
* Handles customer.subscription.updated → updates tier/status  
* Handles customer.subscription.deleted → marks as canceled  
* Handles invoice.payment\_failed → updates status to past\_due

### 4.3. Create create-portal-session Edge Function

* Creates Stripe Customer Portal session for managing subscription  
* Allows plan switching (Basic ↔ Annual)  
* Allows cancellation

### 4.4. Create send-subscription-email Edge Function

* Sends email notifications for payment failures, renewals, cancellations  
* Uses Resend integration

---

## Task 5 \- FRONTEND UI UPDATES (Lovable Action)

### 5.1. Update Pricing Page

* Connect plan buttons to checkout flow  
* Show loading state during checkout creation  
* Redirect to Stripe Checkout

### 5.2. Create Subscription Management UI

* Add "Manage Subscription" button in header/profile  
* Link to Stripe Customer Portal  
* Display current plan status

### 5.3. Implement Feature Gating

* Check subscription status before audio playback  
* Show upgrade prompt for free/expired users on voice playback  
* Keep public book discovery accessible to all

### 5.4. Create Success/Cancel Pages

* /payment/success \- confirmation after successful payment  
* /payment/cancel \- return page if user cancels checkout

---

## Task 6 \- EMAIL NOTIFICATIONS (Collaborative)

### 6.1. Set Up Resend

* Create account at [resend.com](https://resend.com/)  
* Verify email domain  
* Create API key  
* Provide RESEND\_API\_KEY secret

---

## Task 7 \- TESTING (Collaborative)

### 7.1. Test in Stripe Test Mode

* Use test card 4242 4242 4242 4242  
* Verify trial activation  
* Test plan switching  
* Test cancellation flow  
* Verify webhook events 

