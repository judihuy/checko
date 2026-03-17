// ==================== PRICING — Single Source of Truth ====================
// Alle Preise für Checkos: Dauer-Basiskosten + Qualitäts-Multiplikatoren
// UI und Server importieren dieses Modul — keine doppelten Definitionen!

/**
 * Basiskosten pro Dauer (Standard-Stufe)
 * 1 Tag = 2 Checkos, 1 Woche = 8 Checkos, 1 Monat = 20 Checkos
 */
export const DURATION_BASE_COSTS: Record<string, number> = {
  "1d": 2,   // 1 Tag = 2 Checkos (Standard)
  "1w": 8,   // 1 Woche = 8 Checkos (Standard)
  "1m": 20,  // 1 Monat = 20 Checkos (Standard)
};

/**
 * Qualitäts-Multiplikatoren
 * Standard = 1x, Premium = 2x, Pro = 4x
 */
export const QUALITY_MULTIPLIERS: Record<string, number> = {
  standard: 1,  // 1x Basispreis
  premium: 2,   // 2x Basispreis
  pro: 4,       // 4x Basispreis
};

/**
 * Verfügbare Dauern
 */
export const DURATIONS = [
  { id: "1d", name: "1 Tag" },
  { id: "1w", name: "1 Woche" },
  { id: "1m", name: "1 Monat" },
] as const;

/**
 * Dauer → Millisekunden
 */
export const DURATION_MS: Record<string, number> = {
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
};

/**
 * Gesamtkosten für eine Suche berechnen (Dauer × Qualität)
 */
export function getSearchCost(duration: string, qualityTier: string = "standard"): number {
  const baseCost = DURATION_BASE_COSTS[duration] || 2;
  const multiplier = QUALITY_MULTIPLIERS[qualityTier] || 1;
  return baseCost * multiplier;
}

/**
 * Basiskosten für eine Dauer abfragen (ohne Qualitäts-Multiplikator)
 */
export function getDurationCost(duration: string): number {
  return DURATION_BASE_COSTS[duration] || 2;
}
