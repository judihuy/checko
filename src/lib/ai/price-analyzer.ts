// KI-Preisbewertung mit Anthropic API (DIREKT, nicht OpenRouter!)
// Modell: claude-haiku-4-5-20251001
// Analysiert Preise und erkennt Scam-Angebote

export interface PriceAnalysis {
  priceScore: number;       // 1-10 (1=überteuert, 10=sehr günstig)
  bewertung: "sehr günstig" | "günstig" | "fair" | "teuer" | "überteuert" | "unbekannt";
  warnung: string | null;
  isScam: boolean;
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

/**
 * Analysiere den Preis eines Inserats mit KI
 */
export async function analyzePrice(
  title: string,
  price: number,          // in Rappen
  platform: string,
  category?: string
): Promise<PriceAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY nicht gesetzt — Fallback-Bewertung");
    return getFallbackAnalysis();
  }

  const priceCHF = (price / 100).toFixed(2);

  const prompt = `Du bist ein Schweizer Preisexperte. Analysiere dieses Inserat und bewerte den Preis.

Inserat:
- Titel: ${title}
- Preis: CHF ${priceCHF}
- Plattform: ${platform}
${category ? `- Kategorie: ${category}` : ""}

Antworte NUR mit einem JSON-Objekt (kein anderer Text):
{
  "priceScore": <1-10, wobei 10=sehr günstig, 1=überteuert>,
  "bewertung": "<sehr günstig|günstig|fair|teuer|überteuert>",
  "warnung": "<string oder null, z.B. Scam-Verdacht, unrealistischer Preis etc.>",
  "isScam": <true/false, true wenn Preis unrealistisch tief oder typische Scam-Muster>
}

Achte besonders auf:
- Ist der Preis realistisch für den Artikel?
- Schweizer Marktniveau (CHF)
- Scam-Muster: Extrem tiefer Preis, generische Titel, verdächtige Formulierungen
- Marktübliche Preise für ähnliche Artikel`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
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

    // Validierung
    const priceScore = Math.max(1, Math.min(10, Math.round(parsed.priceScore || 5)));
    const validBewertungen = ["sehr günstig", "günstig", "fair", "teuer", "überteuert"];
    const bewertung = validBewertungen.includes(parsed.bewertung)
      ? (parsed.bewertung as PriceAnalysis["bewertung"])
      : scoreToBewertung(priceScore);

    return {
      priceScore,
      bewertung,
      warnung: parsed.warnung || null,
      isScam: Boolean(parsed.isScam),
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
  }>
): Promise<PriceAnalysis[]> {
  const results: PriceAnalysis[] = [];

  for (const item of items) {
    const analysis = await analyzePrice(item.title, item.price, item.platform, item.category);
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
