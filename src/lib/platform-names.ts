// Platform display names and country groupings

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  "ebay-ka": "Kleinanzeigen.de",
  "tutti": "Tutti.ch",
  "ricardo": "Ricardo.ch",
  "autoscout": "AutoScout24.ch",
  "comparis": "Comparis.ch",
};

export function getPlatformDisplayName(slug: string): string {
  return PLATFORM_DISPLAY_NAMES[slug] || slug;
}

// Country → platform slugs (used for country-level checkboxes in search form)
export const COUNTRY_PLATFORMS: Record<string, readonly string[]> = {
  "🇨🇭 Schweiz": ["tutti", "ricardo", "autoscout", "comparis"],
  "🇩🇪 Deutschland": ["ebay-ka"],
  "🇦🇹 Österreich (bald)": [],
} as const;

export const ALL_PLATFORMS = Object.values(COUNTRY_PLATFORMS).flat();
