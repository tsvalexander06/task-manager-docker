-- Grant yourself access without going through Stripe.
--
-- The journal gates writing on an active subscription, which applies to you as
-- much as to anyone else. While you are testing, or if you ever need to comp an
-- account, this sets the status by hand.
--
-- Replace the email, then run it in the Supabase SQL editor.

update public.profiles
set    subscription_status = 'active',
       current_period_end  = now() + interval '10 years',
       updated_at          = now()
where  email = 'you@example.com';

-- Check it took. Expect one row reading 'active'.
select email, subscription_status, current_period_end
from   public.profiles
where  email = 'you@example.com';

-- ---------------------------------------------------------------------------
-- Notes
--
-- If it updates 0 rows, the account has not signed in yet. Sign in once, then
-- run this again — the profile row is created on sign-up.
--
-- A row set by hand is not connected to Stripe. Once real billing is live, a
-- Stripe event for that customer will overwrite this. That is correct: Stripe
-- should be the source of truth for anyone actually paying.
--
-- To take access away again:
--   update public.profiles set subscription_status = 'none'
--   where email = 'you@example.com';
-- ---------------------------------------------------------------------------
