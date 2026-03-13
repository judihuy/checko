// Stripe Configuration + Volume Discount Logic
// Discount tiers:
//   1-2 modules: full price
//   3-4 modules: 15% discount
//   5-7 modules: 25% discount
//   8+ modules:  30% discount

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

// Volume discount tiers
export interface DiscountTier {
  minModules: number;
  maxModules: number | null;
  discountPercent: number;
  label: string;
}

export const DISCOUNT_TIERS: DiscountTier[] = [
  { minModules: 1, maxModules: 2, discountPercent: 0, label: "Kein Rabatt" },
  { minModules: 3, maxModules: 4, discountPercent: 15, label: "15% Mengenrabatt" },
  { minModules: 5, maxModules: 7, discountPercent: 25, label: "25% Mengenrabatt" },
  { minModules: 8, maxModules: null, discountPercent: 30, label: "30% Mengenrabatt" },
];

/**
 * Get the discount percentage for a given number of modules
 */
export function getDiscountPercent(moduleCount: number): number {
  for (const tier of DISCOUNT_TIERS) {
    if (
      moduleCount >= tier.minModules &&
      (tier.maxModules === null || moduleCount <= tier.maxModules)
    ) {
      return tier.discountPercent;
    }
  }
  return 0;
}

/**
 * Get the current discount tier for a given number of modules
 */
export function getDiscountTier(moduleCount: number): DiscountTier {
  for (const tier of DISCOUNT_TIERS) {
    if (
      moduleCount >= tier.minModules &&
      (tier.maxModules === null || moduleCount <= tier.maxModules)
    ) {
      return tier;
    }
  }
  return DISCOUNT_TIERS[0];
}

/**
 * Calculate the discounted price in Rappen (cents)
 */
export function calculateDiscountedPrice(
  priceInRappen: number,
  moduleCount: number
): number {
  const discountPercent = getDiscountPercent(moduleCount);
  const discounted = Math.round(priceInRappen * (1 - discountPercent / 100));
  return discounted;
}

/**
 * Format price from Rappen to CHF string
 */
export function formatPrice(rappen: number): string {
  return `CHF ${(rappen / 100).toFixed(2)}`;
}
