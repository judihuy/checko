// Stripe Configuration — Einmalzahlung für Checko-Pakete
// KEIN Abo-Modell mehr!

import Stripe from "stripe";

// Lazy-initialized Stripe client — avoids crash during `next build`
// when STRIPE_SECRET_KEY is not yet set in the environment.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
    }
    _stripe = new Stripe(key, {
      typescript: true,
    });
  }
  return _stripe;
}

/**
 * Format price from Rappen to CHF string
 */
export function formatPrice(rappen: number): string {
  return `CHF ${(rappen / 100).toFixed(2)}`;
}
