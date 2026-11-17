/*
  Hooksy settings. Everything in this file is PUBLIC (anyone can read it in the browser),
  so only put public values here. Never put a Stripe secret key or Supabase service key here.
*/
window.HOOKSY_CONFIG = {
  GAME_NAME: 'Hooksy',

  // Your live site address, used in the Share text and sign-in links. Include the trailing slash.
  // Example: 'https://yourname.github.io/hooksy/'
  SITE_URL: 'https://hooksy.io/',

  // Day #1 of the daily game. The word list is played in order from this date.
  // Keep it fixed after launch, or everyone's words will shift.
  DAILY_START_DATE: '2026-11-17',

  ROUND_SECONDS: 60,

  // ---- Premium (optional). Leave these empty and the site runs as a free daily game only. ----
  // Supabase > Project Settings > API: "Project URL" and the "anon" / "publishable" key (both public).
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  // Stripe > Payment Links > your $4.99/month link (starts with https://buy.stripe.com/...)
  STRIPE_PAYMENT_LINK: '',

  PREMIUM_PRICE_LABEL: '$4.99/month',
  PREMIUM_GAMES_PER_DAY: 5, // display only; the server enforces its own limit
};
