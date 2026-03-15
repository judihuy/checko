// KI-Preisbewertung mit Anthropic API (DIREKT, nicht OpenRouter!)
// Modell je nach Qualitätsstufe:
// - Standard → claude-haiku-4-5-20251001 (schnell, günstig)
// - Premium  → claude-sonnet-4-5-20250514 (ausführlicher)
// - Pro      → claude-opus-4-20250514 (beste Qualität)

export interface PriceAnalysis {
  priceScore: number;       // 1-10 (1=überteuert, 10=sehr günstig)
  bewertung: "sehr günstig" | "günstig" | "fair" | "teuer" | "überteuert" | "unbekannt";
  warnung: string | null;
  isScam: boolean;
  details: string | null;   // Kurze Erklärung zur Bewertung
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Modelle pro Qualitätsstufe
const TIER_MODELS: Record<string, string> = {
  standard: "claude-haiku-4-5-20251001",
  premium: "claude-sonnet-4-5-20250514",
  pro: "claude-opus-4-20250514",
};

// Max Tokens pro Stufe (höhere Stufen = ausführlichere Antworten)
const TIER_MAX_TOKENS: Record<string, number> = {
  standard: 400,
  premium: 800,
  pro: 1200,
};

/**
 * Standard-Prompt für Preisanalyse
 */
function getStandardPrompt(title: string, priceCHF: string, platform: string, category?: string, description?: string): string {
  return `Du bist ein Schweizer Secondhand-Markt-Experte. Bewerte dieses Inserat.

WICHTIG:
- Berücksichtige das ALTER des Produkts anhand des Titels (z.B. "E53" = 2000-2006, "iPhone 12" = 2020)
- Bei Autos: Ältere Modelle (10+ Jahre) können SEHR günstig sein — das ist KEIN Scam
- Bei Elektronik: Ältere Generationen sind deutlich günstiger
- "Scam" NUR wenn der Preis UNMÖGLICH tief ist (z.B. neues iPhone für 50 CHF)
- "überteuert" und "isScam=true" dürfen NIEMALS gleichzeitig vorkommen!
- Wenn etwas teuer ist, ist es per Definition kein Scam

Inserat:
- Titel: ${title}
- Preis: CHF ${priceCHF}
- Plattform: ${platform}
- Kategorie: ${category || "Allgemein"}${description ? `\n- Beschreibung: ${description}` : ""}

Antworte NUR mit JSON:
{
  "priceScore": <1-10, 10=sehr günstig, 1=überteuert>,
  "bewertung": "<sehr günstig|günstig|fair|teuer|überteuert>",
  "warnung": "<string oder null — NUR bei echten Problemen>",
  "isScam": <true/false — NUR bei unmöglich tiefen Preisen oder bekannten Scam-Mustern>,
  "details": "<kurze Erklärung warum dieser Preis so bewertet wird, max 2 Sätze>"
}`;
}

/**
 * Premium/Pro-Prompt: Ausführlicher, mehr Details
 */
function getPremiumPrompt(title: string, priceCHF: string, platform: string, tier: string, category?: string, description?: string): string {
  const tierLabel = tier === "pro" ? "Pro (maximale Tiefe)" : "Premium (erweiterte Analyse)";

  return `Du bist ein erfahrener Schweizer Secondhand-Markt-Experte mit tiefem Wissen über Preise, Marken und Markttrends. Erstelle eine ${tierLabel} Bewertung.

ANALYSE-REGELN:
- Berücksichtige das ALTER des Produkts anhand des Titels (z.B. "E53" = 2000-2006, "iPhone 12" = 2020)
- Bei Autos: Ältere Modelle (10+ Jahre) können SEHR günstig sein — das ist KEIN Scam
- Bei Elektronik: Ältere Generationen sind deutlich günstiger
- "Scam" NUR wenn der Preis UNMÖGLICH tief ist (z.B. neues iPhone für 50 CHF)
- "überteuert" und "isScam=true" dürfen NIEMALS gleichzeitig vorkommen!
- Wenn etwas teuer ist, ist es per Definition kein Scam

ZUSÄTZLICHE ANFORDERUNGEN (${tierLabel}):
- Schätze den Neupreis und aktuellen Marktwert
- Vergleiche mit typischen Preisen auf ${platform}
- Bewerte den Zustand anhand der verfügbaren Informationen
- Gib Verhandlungstipps wenn sinnvoll
${tier === "pro" ? `- Erkenne mögliche versteckte Mängel aus dem Titel
- Bewerte die Wertstabilität des Produkts
- Gib eine Kauf-Empfehlung (kaufen/abwarten/meiden)` : ""}

Inserat:
- Titel: ${title}
- Preis: CHF ${priceCHF}
- Plattform: ${platform}
- Kategorie: ${category || "Allgemein"}${description ? `\n- Beschreibung: ${description}` : ""}

Antworte NUR mit JSON:
{
  "priceScore": <1-10, 10=sehr günstig, 1=überteuert>,
  "bewertung": "<sehr günstig|günstig|fair|teuer|überteuert>",
  "warnung": "<string oder null — NUR bei echten Problemen>",
  "isScam": <true/false — NUR bei unmöglich tiefen Preisen oder bekannten Scam-Mustern>,
  "details": "<ausführliche Erklärung: Neupreis-Schätzung, Marktvergleich, Zustandsbewertung, Verhandlungstipps${tier === "pro" ? ", Wertstabilität, Kauf-Empfehlung" : ""}. 3-5 Sätze.>"
}`;
}

/**
 * Analysiere den Preis eines Inserats mit KI
 * @param qualityTier - "standard" | "premium" | "pro" — bestimmt Modell und Prompt-Tiefe
 */
export async function analyzePrice(
  title: string,
  price: number,          // in Rappen
  platform: string,
  category?: string,
  description?: string,
  qualityTier: string = "standard"
): Promise<PriceAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY nicht gesetzt — Fallback-Bewertung");
    return getFallbackAnalysis();
  }

  const priceCHF = (price / 100).toFixed(2);
  const model = TIER_MODELS[qualityTier] || TIER_MODELS["standard"];
  const maxTokens = TIER_MAX_TOKENS[qualityTier] || TIER_MAX_TOKENS["standard"];

  // Standard-Prompt oder Premium/Pro-Prompt
  const prompt = qualityTier === "standard"
    ? getStandardPrompt(title, priceCHF, platform, category, description)
    : getPremiumPrompt(title, priceCHF, platform, qualityTier, category, description);

  try {
    console.log(`[PriceAnalyzer] Modell: ${model} (Tier: ${qualityTier})`);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Anthropic API Error (${response.status}):`, errorText);
      return getFallbackAnalysis();
    }

    const data = await response.json();

    // Anthropic API Response: content[0].text enthält die Antwort
    const textContent = data?.content?.[0]?.text;

    if (!textContent) {
      console.error("Anthropic API: Keine Text-Antwort erhalten");
      return getFallbackAnalysis();
    }

    // JSON aus der Antwort extrahieren
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Anthropic API: Kein JSON in Antwort gefunden:", textContent);
      return getFallbackAnalysis();
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validierung: priceScore zwischen 1-10 clampen
    const priceScore = Math.max(1, Math.min(10, Math.round(parsed.priceScore || 5)));

    const validBewertungen = ["sehr günstig", "günstig", "fair", "teuer", "überteuert"];
    const bewertung = validBewertungen.includes(parsed.bewertung)
      ? (parsed.bewertung as PriceAnalysis["bewertung"])
      : scoreToBewertung(priceScore);

    let isScam = Boolean(parsed.isScam);

    // KRITISCH: Wenn bewertung "teuer" oder "überteuert" → isScam IMMER false
    if (bewertung === "teuer" || bewertung === "überteuert") {
      isScam = false;
    }

    return {
      priceScore,
      bewertung,
      warnung: parsed.warnung || null,
      isScam,
      details: parsed.details || null,
    };
  } catch (error) {
    console.error("KI-Preisanalyse fehlgeschlagen:", error);
    return getFallbackAnalysis();
  }
}

/**
 * Batch-Analyse für mehrere Inserate
 * Verarbeitet sequentiell um API-Limits einzuhalten
 */
export async function analyzePriceBatch(
  items: Array<{
    title: string;
    price: number;
    platform: string;
    category?: string;
    description?: string;
  }>,
  qualityTier: string = "standard"
): Promise<PriceAnalysis[]> {
  const results: PriceAnalysis[] = [];

  for (const item of items) {
    const analysis = await analyzePrice(item.title, item.price, item.platform, item.category, item.description, qualityTier);
    results.push(analysis);

    // Kleine Pause zwischen Anfragen (Rate-Limiting)
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * Fallback-Bewertung wenn API nicht verfügbar
 */
function getFallbackAnalysis(): PriceAnalysis {
  return {
    priceScore: 5,
    bewertung: "unbekannt",
    warnung: null,
    isScam: false,
    details: null,
  };
}

/**
 * Score → Bewertungs-Text Mapping
 */
function scoreToBewertung(score: number): PriceAnalysis["bewertung"] {
  if (score >= 9) return "sehr günstig";
  if (score >= 7) return "günstig";
  if (score >= 5) return "fair";
  if (score >= 3) return "teuer";
  return "überteuert";
}
