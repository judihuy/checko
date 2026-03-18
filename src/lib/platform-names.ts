// Plattform-Anzeigenamen — zentrale Mapping-Datei
// NIEMALS Slugs direkt im Frontend anzeigen!

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  "ebay-ka": "Kleinanzeigen.de",
  "tutti": "Tutti.ch",
  "ricardo": "Ricardo.ch",
  "autoscout": "AutoScout24.ch",
  "comparis": "Comparis.ch",
  "willhaben": "Willhaben.at",
  "anibis": "Anibis.ch",
  "google-shopping": "Google Shopping",
  "amazon": "Amazon.de",
  "autolina": "Autolina.ch",
};

export function getPlatformDisplayName(slug: string): string {
  return PLATFORM_DISPLAY_NAMES[slug] || slug;
}

// Länder-Gruppen für die Suche
export type CountryCode = "ch" | "de" | "at" | "all";

interface CountryConfig {
  label: string;
  flag: string;
  platforms: string[];
  enabled: boolean;
}

export const COUNTRY_PLATFORMS: Record<CountryCode, CountryConfig> = {
  ch: {
    label: "Schweiz",
    flag: "🇨🇭",
    platforms: ["tutti", "ricardo", "autoscout", "anibis", "autolina"],
    enabled: true,
  },
  de: {
    label: "Deutschland",
    flag: "🇩🇪",
    platforms: ["ebay-ka"],
    enabled: true,
  },
  at: {
    label: "Österreich",
    flag: "🇦🇹",
    platforms: ["willhaben"],
    enabled: false, // Vorerst deaktiviert — Schweizer Fokus
  },
  all: {
    label: "Alle",
    flag: "🌍",
    platforms: [], // Dynamisch: alle aktiven Plattformen
    enabled: true,
  },
};

/**
 * Plattformen für ein Land zurückgeben.
 * Bei "all" werden alle Plattformen aller aktivierten Länder kombiniert.
 */
export function getPlatformsForCountry(country: CountryCode): string[] {
  if (country === "all") {
    const all = new Set<string>();
    for (const [code, config] of Object.entries(COUNTRY_PLATFORMS)) {
      if (code === "all") continue;
      // Auch deaktivierte Länder einbeziehen für "all",
      // da der Scraper selbst isWorking=false hat
      for (const p of config.platforms) {
        all.add(p);
      }
    }
    return Array.from(all);
  }
  return COUNTRY_PLATFORMS[country]?.platforms || [];
}

/**
 * Prüft ob eine Plattform zum gewählten Land passt.
 */
export function isPlatformForCountry(platform: string, country: CountryCode): boolean {
  if (country === "all") return true;
  return COUNTRY_PLATFORMS[country]?.platforms.includes(platform) ?? false;
}
