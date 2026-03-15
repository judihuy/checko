// Plattform-Anzeigenamen — zentrale Mapping-Datei
// NIEMALS Slugs direkt im Frontend anzeigen!

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  "ebay-ka": "Kleinanzeigen.de",
  "tutti": "Tutti.ch",
  "ricardo": "Ricardo.ch",
  "autoscout": "AutoScout24.ch",
  "comparis": "Comparis.ch",
  "willhaben": "Willhaben.at",
};

export function getPlatformDisplayName(slug: string): string {
  return PLATFORM_DISPLAY_NAMES[slug] || slug;
}

// Länder-Gruppen für die Suche
export type CountryCode = "ch" | "de" | "at";

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
    platforms: ["tutti", "ricardo", "autoscout", "comparis"],
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
    enabled: false, // Coming soon
  },
};
