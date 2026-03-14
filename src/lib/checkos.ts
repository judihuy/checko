// Checkos — Coin-System für Checko
// Pakete, Qualitätsstufen, Balance-Management, dynamische Preisberechnung
// User sieht KEINE Modellnamen, nur Standard/Premium/Pro

import { prisma } from "@/lib/prisma";

// ==================== MENGENRABATT ====================

export interface DiscountTier {
  min: number;
  max: number;
  discount: number;         // Rabatt in Prozent
  pricePerChecko: number;   // CHF pro Checko
}

const DISCOUNT_TIERS: DiscountTier[] = [
  { min: 5, max: 19, discount: 0, pricePerChecko: 1.0 },
  { min: 20, max: 49, discount: 5, pricePerChecko: 0.95 },
  { min: 50, max: 99, discount: 10, pricePerChecko: 0.9 },
  { min: 100, max: Infinity, discount: 15, pricePerChecko: 0.85 },
];

/**
 * Rabattstufe für eine bestimmte Menge berechnen
 */
export function getDiscountTier(amount: number): DiscountTier {
  return DISCOUNT_TIERS.find((t) => amount >= t.min && amount <= t.max) || DISCOUNT_TIERS[0];
}

/**
 * Dynamische Preisberechnung für eine beliebige Menge Checkos
 */
export function calculateCheckoPrice(amount: number): {
  totalCHF: number;          // Gesamtpreis in CHF
  totalRappen: number;       // Gesamtpreis in Rappen (für Stripe)
  pricePerChecko: number;    // CHF pro Checko
  discountPercent: number;   // Rabatt in %
  savingsCHF: number;        // Ersparnis in CHF
} {
  const tier = getDiscountTier(amount);
  const totalCHF = parseFloat((amount * tier.pricePerChecko).toFixed(2));
  const totalRappen = Math.round(totalCHF * 100);
  const fullPrice = amount * 1.0; // Ohne Rabatt
  const savingsCHF = parseFloat((fullPrice - totalCHF).toFixed(2));
  return {
    totalCHF,
    totalRappen,
    pricePerChecko: tier.pricePerChecko,
    discountPercent: tier.discount,
    savingsCHF,
  };
}

/**
 * Alle Rabattstufen zurückgeben (für UI-Anzeige)
 */
export function getDiscountTiers(): DiscountTier[] {
  return DISCOUNT_TIERS;
}

// ==================== PAKETE (Schnellwahl) ====================

export interface CheckoPackage {
  id: string;
  amount: number;       // Anzahl Checkos
  priceCHF: number;     // Preis in Rappen (Cent)
  priceDisplay: string; // Anzeige-Preis
  savings: string;      // Ersparnis-Text
  popular: boolean;     // Beliebtestes Paket
}

/**
 * Vordefinierte Pakete — Schnellwahl mit dynamischer Preisberechnung
 */
export function getPackages(): CheckoPackage[] {
  const amounts = [20, 50, 100];
  return amounts.map((amount) => {
    const pricing = calculateCheckoPrice(amount);
    return {
      id: `checkos-${amount}`,
      amount,
      priceCHF: pricing.totalRappen,
      priceDisplay: `CHF ${pricing.totalCHF.toFixed(2)}`,
      savings: pricing.discountPercent > 0 ? `Spare ${pricing.discountPercent}%` : "",
      popular: amount === 50,
    };
  });
}

/**
 * Finde ein Paket anhand seiner ID
 */
export function getPackageById(packageId: string): CheckoPackage | undefined {
  return getPackages().find((p) => p.id === packageId);
}

/**
 * Erstelle ein dynamisches "Paket" für einen beliebigen Betrag (für Stripe)
 */
export function createDynamicPackage(amount: number): CheckoPackage | null {
  if (amount < 5 || amount > 500) return null;
  const pricing = calculateCheckoPrice(amount);
  return {
    id: `checkos-custom-${amount}`,
    amount,
    priceCHF: pricing.totalRappen,
    priceDisplay: `CHF ${pricing.totalCHF.toFixed(2)}`,
    savings: pricing.discountPercent > 0 ? `Spare ${pricing.discountPercent}%` : "",
    popular: false,
  };
}

// ==================== QUALITÄTSSTUFEN ====================

export interface QualityTier {
  id: string;
  name: string;        // Anzeigename für User
  multiplier: number;  // Preismultiplikator (intern für Berechnungen)
  checkos: number;     // Konkrete Checko-Kosten pro Nutzung
  description: string;
}

export function getQualityTiers(): QualityTier[] {
  return [
    {
      id: "standard",
      name: "Standard",
      multiplier: 1,
      checkos: 2,
      description: "Schnell und zuverlässig",
    },
    {
      id: "premium",
      name: "Premium",
      multiplier: 2,
      checkos: 4,
      description: "Bessere Qualität",
    },
    {
      id: "pro",
      name: "Pro",
      multiplier: 4,
      checkos: 7,
      description: "Maximale Qualität",
    },
  ];
}

/**
 * Finde eine Qualitätsstufe anhand der ID
 */
export function getQualityTierById(tierId: string): QualityTier | undefined {
  return getQualityTiers().find((t) => t.id === tierId);
}

// ==================== BALANCE-MANAGEMENT ====================

/**
 * Checkos-Kontostand eines Users abfragen
 */
export async function getBalance(userId: string): Promise<number> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { checkosBalance: true },
  });
  return user?.checkosBalance ?? 0;
}

/**
 * Checkos nach einem Kauf gutschreiben
 * Erstellt CheckoPurchase + CheckoTransaction + aktualisiert Balance
 */
export async function purchaseCheckos(
  userId: string,
  packageId: string,
  stripePaymentId?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const pkg = getPackageById(packageId);
  if (!pkg) {
    return { success: false, newBalance: 0, error: "Ungültiges Paket" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // CheckoPurchase erstellen
      await tx.checkoPurchase.create({
        data: {
          userId,
          amount: pkg.amount,
          priceCHF: pkg.priceCHF,
          stripePaymentId: stripePaymentId || null,
          status: "completed",
        },
      });

      // CheckoTransaction erstellen (Gutschrift)
      await tx.checkoTransaction.create({
        data: {
          userId,
          amount: pkg.amount,
          type: "purchase",
          description: `${pkg.amount} Checkos gekauft (${pkg.priceDisplay})`,
        },
      });

      // Balance aktualisieren
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { checkosBalance: { increment: pkg.amount } },
        select: { checkosBalance: true },
      });

      return updatedUser.checkosBalance;
    });

    return { success: true, newBalance: result };
  } catch (error) {
    console.error("purchaseCheckos error:", error);
    return { success: false, newBalance: 0, error: "Fehler beim Gutschreiben" };
  }
}

/**
 * Checkos für dynamischen Betrag gutschreiben (wenn Stripe custom amounts unterstützt)
 */
export async function purchaseCustomCheckos(
  userId: string,
  amount: number,
  stripePaymentId?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (amount < 5 || amount > 500) {
    return { success: false, newBalance: 0, error: "Ungültige Menge (5-500)" };
  }

  const pricing = calculateCheckoPrice(amount);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.checkoPurchase.create({
        data: {
          userId,
          amount,
          priceCHF: pricing.totalRappen,
          stripePaymentId: stripePaymentId || null,
          status: "completed",
        },
      });

      await tx.checkoTransaction.create({
        data: {
          userId,
          amount,
          type: "purchase",
          description: `${amount} Checkos gekauft (CHF ${pricing.totalCHF.toFixed(2)})`,
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { checkosBalance: { increment: amount } },
        select: { checkosBalance: true },
      });

      return updatedUser.checkosBalance;
    });

    return { success: true, newBalance: result };
  } catch (error) {
    console.error("purchaseCustomCheckos error:", error);
    return { success: false, newBalance: 0, error: "Fehler beim Gutschreiben" };
  }
}

/**
 * Checkos abziehen (bei Modulnutzung)
 * Prüft ob genug Balance vorhanden
 */
export async function deductCheckos(
  userId: string,
  amount: number,
  moduleSlug?: string,
  qualityTier?: string,
  description?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (amount <= 0) {
    return { success: false, newBalance: 0, error: "Ungültiger Betrag" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Aktuelle Balance prüfen
      const user = await tx.user.findFirst({
        where: { id: userId },
        select: { checkosBalance: true },
      });

      if (!user || user.checkosBalance < amount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // CheckoTransaction erstellen (Verbrauch = negativer Betrag)
      await tx.checkoTransaction.create({
        data: {
          userId,
          amount: -amount,
          type: "usage",
          description: description || `${amount} Checkos verbraucht`,
          moduleSlug: moduleSlug || null,
          qualityTier: qualityTier || null,
        },
      });

      // Balance aktualisieren
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { checkosBalance: { decrement: amount } },
        select: { checkosBalance: true },
      });

      return updatedUser.checkosBalance;
    });

    return { success: true, newBalance: result };
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
      return { success: false, newBalance: 0, error: "Nicht genügend Checkos" };
    }
    console.error("deductCheckos error:", error);
    return { success: false, newBalance: 0, error: "Fehler beim Abziehen" };
  }
}

/**
 * Checkos verschenken (Admin-Funktion)
 */
export async function giftCheckos(
  userId: string,
  amount: number,
  adminId: string,
  description?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (amount <= 0) {
    return { success: false, newBalance: 0, error: "Ungültiger Betrag" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // CheckoTransaction erstellen (Geschenk vom Admin)
      await tx.checkoTransaction.create({
        data: {
          userId,
          amount: amount,
          type: "admin_gift",
          description: description || `${amount} Checkos vom Admin geschenkt`,
        },
      });

      // Balance aktualisieren
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { checkosBalance: { increment: amount } },
        select: { checkosBalance: true },
      });

      return updatedUser.checkosBalance;
    });

    return { success: true, newBalance: result };
  } catch (error) {
    console.error("giftCheckos error:", error);
    return { success: false, newBalance: 0, error: "Fehler beim Verschenken" };
  }
}

/**
 * Letzte Transaktionen eines Users laden
 */
export async function getTransactions(
  userId: string,
  limit: number = 20
): Promise<{
  id: string;
  amount: number;
  type: string;
  description: string | null;
  moduleSlug: string | null;
  qualityTier: string | null;
  createdAt: Date;
}[]> {
  return prisma.checkoTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      amount: true,
      type: true,
      description: true,
      moduleSlug: true,
      qualityTier: true,
      createdAt: true,
    },
  });
}
