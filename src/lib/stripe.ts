// Stripe Configuration — Einmalzahlung für Checko-Pakete
// KEIN Abo-Modell mehr!
// Preis-Staffelung: 1-49=1.00CHF, 50-99=0.90, 100-249=0.85, 250+=0.80

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

// ==================== PREIS-STAFFELUNG ====================

export interface PriceTier {
  min: number;
  max: number;
  pricePerChecko: number; // CHF
  discountPercent: number;
}

export const PRICE_TIERS: PriceTier[] = [
  { min: 1, max: 49, pricePerChecko: 1.0, discountPercent: 0 },
  { min: 50, max: 99, pricePerChecko: 0.9, discountPercent: 10 },
  { min: 100, max: 249, pricePerChecko: 0.85, discountPercent: 15 },
  { min: 250, max: Infinity, pricePerChecko: 0.8, discountPercent: 20 },
];

export function getPriceTier(amount: number): PriceTier {
  return PRICE_TIERS.find((t) => amount >= t.min && amount <= t.max) || PRICE_TIERS[0];
}

export function calculatePrice(amount: number): {
  totalCHF: number;
  totalRappen: number;
  pricePerChecko: number;
  discountPercent: number;
  savingsCHF: number;
  unitAmountRappen: number; // Preis pro Stück in Rappen für Stripe
} {
  const tier = getPriceTier(amount);
  const totalCHF = parseFloat((amount * tier.pricePerChecko).toFixed(2));
  const totalRappen = Math.round(totalCHF * 100);
  const fullPrice = amount * 1.0;
  const savingsCHF = parseFloat((fullPrice - totalCHF).toFixed(2));
  const unitAmountRappen = Math.round(tier.pricePerChecko * 100);
  return {
    totalCHF,
    totalRappen,
    pricePerChecko: tier.pricePerChecko,
    discountPercent: tier.discountPercent,
    savingsCHF,
    unitAmountRappen,
  };
}

// ==================== FESTE PAKETE (Stripe Price-IDs) ====================

export const STRIPE_PRODUCT_ID = "prod_U9SwOkmZhpztOP";

export interface FixedPackage {
  checkos: number;
  priceId: string;
  totalCHF: number;
  pricePerChecko: number;
  discountPercent: number;
  savingsCHF: number;
  popular: boolean;
}

export const FIXED_PACKAGES: FixedPackage[] = [
  {
    checkos: 20,
    priceId: "price_1TBA0mDu7PSxvnovrngeJBlq",
    totalCHF: 20.0,
    pricePerChecko: 1.0,
    discountPercent: 0,
    savingsCHF: 0,
    popular: false,
  },
  {
    checkos: 50,
    priceId: "price_1TBA19Du7PSxvnovj3OaduIm",
    totalCHF: 45.0,
    pricePerChecko: 0.9,
    discountPercent: 10,
    savingsCHF: 5.0,
    popular: true,
  },
  {
    checkos: 100,
    priceId: "price_1TBA1IDu7PSxvnovyfotwnT5",
    totalCHF: 85.0,
    pricePerChecko: 0.85,
    discountPercent: 15,
    savingsCHF: 15.0,
    popular: false,
  },
  {
    checkos: 250,
    priceId: "price_1TBA1JDu7PSxvnovEKMNnI4R",
    totalCHF: 200.0,
    pricePerChecko: 0.8,
    discountPercent: 20,
    savingsCHF: 50.0,
    popular: false,
  },
];

/**
 * Finde ein festes Paket anhand der priceId
 */
export function getFixedPackageByPriceId(priceId: string): FixedPackage | undefined {
  return FIXED_PACKAGES.find((p) => p.priceId === priceId);
}

/**
 * Format price from Rappen to CHF string
 */
export function formatPrice(rappen: number): string {
  return `CHF ${(rappen / 100).toFixed(2)}`;
}
