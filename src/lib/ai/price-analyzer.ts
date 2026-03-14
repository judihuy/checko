// KI-Preisbewertung mit Anthropic API (DIREKT, nicht OpenRouter!)
// Modell: claude-haiku-4-5-20251001
// Analysiert Preise und erkennt Scam-Angebote

export interface PriceAnalysis {
  priceScore: number;       // 1-10 (1=überteuert, 10=sehr günstig)
  bewertung: "sehr günstig" | "günstig" | "fair" | "teuer" | "überteuert" | "unbekannt";
  warnung: string | null;
  isScam: boolean;
  details: string | null;   // Kurze Erklärung zur Bewertung
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
  category?: string,
  description?: string
): Promise<PriceAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY nicht gesetzt — Fallback-Bewertung");
    return getFallbackAnalysis();
  }

  const priceCHF = (price / 100).toFixed(2);

  const prompt = `Du bist ein Schweizer Secondhand-Markt-Experte. Bewerte dieses Inserat.

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
        max_tokens: 400,
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
  }>
): Promise<PriceAnalysis[]> {
  const results: PriceAnalysis[] = [];

  for (const item of items) {
    const analysis = await analyzePrice(item.title, item.price, item.platform, item.category, item.description);
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
