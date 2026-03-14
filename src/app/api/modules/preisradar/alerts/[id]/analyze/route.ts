// Detail-Analyse API
// POST: Besucht die Original-URL via Puppeteer, extrahiert Inhalte,
// analysiert detailliert mit Claude Haiku. Kostet 1 Checko.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deductCheckos } from "@/lib/checkos";
import puppeteer from "puppeteer";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

// Proxy-Pool (gleiche wie in base.ts)
const PROXY_POOL = [
  { username: "kfxavtnr-de-1", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-2", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-3", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-4", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-5", password: "4f55trvs9n0y" },
];

const PROXY_HOST = "p.webshare.io";
const PROXY_PORT = 80;

function getRandomProxy(): { username: string; password: string } {
  const idx = Math.floor(Math.random() * PROXY_POOL.length);
  return PROXY_POOL[idx];
}

/**
 * Seiteninhalte via Puppeteer extrahieren
 */
async function extractPageContent(url: string): Promise<{
  title: string;
  description: string;
  sellerInfo: string;
  additionalInfo: string;
}> {
  const proxy = getRandomProxy();
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
      `--proxy-server=http://${PROXY_HOST}:${PROXY_PORT}`,
    ],
  });

  try {
    const page = await browser.newPage();

    await page.authenticate({
      username: proxy.username,
      password: proxy.password,
    });

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
    });

    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    // Inhalte extrahieren
    const content = await page.evaluate(() => {
      // Titel
      const titleEl = document.querySelector("h1") || document.querySelector("title");
      const title = titleEl?.textContent?.trim() || "";

      // Beschreibung — verschiedene Selektoren für verschiedene Plattformen
      const descSelectors = [
        "[data-testid='description']",
        ".description",
        ".item-description",
        "#description",
        ".product-description",
        "[itemprop='description']",
        ".detail-description",
        ".listing-description",
      ];
      let description = "";
      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          description = el.textContent.trim();
          break;
        }
      }
      // Fallback: body text (gekürzt)
      if (!description) {
        const body = document.body?.innerText || "";
        description = body.substring(0, 2000);
      }

      // Verkäufer-Info
      const sellerSelectors = [
        ".seller-info",
        ".user-info",
        ".vendor-info",
        "[data-testid='seller']",
        ".advertiser",
        ".profile-info",
      ];
      let sellerInfo = "";
      for (const sel of sellerSelectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          sellerInfo = el.textContent.trim();
          break;
        }
      }

      // Zusätzliche Infos (Zustand, Versand etc.)
      const additionalSelectors = [
        ".item-attributes",
        ".product-attributes",
        ".details-list",
        ".specifications",
        "[data-testid='attributes']",
      ];
      let additionalInfo = "";
      for (const sel of additionalSelectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          additionalInfo = el.textContent.trim();
          break;
        }
      }

      return { title, description, sellerInfo, additionalInfo };
    });

    return content;
  } finally {
    await browser.close();
  }
}

/**
 * Detail-Analyse mit Claude Haiku
 */
async function analyzeWithAI(
  alertTitle: string,
  alertPrice: number,
  alertPlatform: string,
  pageContent: {
    title: string;
    description: string;
    sellerInfo: string;
    additionalInfo: string;
  }
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");
  }

  const priceCHF = (alertPrice / 100).toFixed(2);

  const prompt = `Analysiere dieses Inserat im Detail:
- Titel: ${alertTitle}
- Beschreibung: ${pageContent.description.substring(0, 3000)}
- Preis: CHF ${priceCHF}
- Verkäufer: ${pageContent.sellerInfo || "Keine Info verfügbar"}
- Plattform: ${alertPlatform}
${pageContent.additionalInfo ? `- Zusätzliche Infos: ${pageContent.additionalInfo.substring(0, 1000)}` : ""}

Gib eine detaillierte Analyse als JSON:
{
  "preisbewertung": "<Ist der Preis fair für diesen spezifischen Artikel? Ausführliche Begründung>",
  "besonderheiten": "<Besondere Merkmale/Extras die den Preis beeinflussen?>",
  "kaeuferhinweise": "<Worauf sollte der Käufer achten?>",
  "verhandlungspotenzial": "<Verhandlungspotenzial? Vorschlag für Gebot>",
  "scamRisiko": <0-100>,
  "empfehlung": "<Kaufen|Verhandeln|Finger weg>",
  "zusammenfassung": "<Kurze Zusammenfassung in 2-3 Sätzen>"
}`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const textContent = data?.content?.[0]?.text;

  if (!textContent) {
    throw new Error("Keine Antwort von der KI erhalten");
  }

  // JSON extrahieren
  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Fallback: gesamten Text als Zusammenfassung nehmen
    return JSON.stringify({
      preisbewertung: textContent,
      besonderheiten: "",
      kaeuferhinweise: "",
      verhandlungspotenzial: "",
      scamRisiko: 0,
      empfehlung: "Verhandeln",
      zusammenfassung: textContent.substring(0, 200),
    });
  }

  // JSON validieren
  const parsed = JSON.parse(jsonMatch[0]);
  return JSON.stringify(parsed);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Alert laden mit Owner-Check
    const alert = await prisma.preisradarAlert.findFirst({
      where: { id },
      include: {
        search: {
          select: { userId: true },
        },
      },
    });

    if (!alert) {
      return NextResponse.json({ error: "Alert nicht gefunden" }, { status: 404 });
    }

    if (alert.search.userId !== session.user.id) {
      return NextResponse.json({ error: "Zugriff verweigert" }, { status: 403 });
    }

    // Bereits analysiert? Direkt zurückgeben
    if (alert.detailAnalysis) {
      return NextResponse.json({
        success: true,
        analysis: JSON.parse(alert.detailAnalysis),
        cached: true,
      });
    }

    // 1 Checko abziehen
    const deductResult = await deductCheckos(
      session.user.id,
      1,
      "preisradar",
      undefined,
      "Preisradar Detail-Analyse"
    );

    if (!deductResult.success) {
      return NextResponse.json(
        { error: deductResult.error || "Nicht genügend Checkos" },
        { status: 402 }
      );
    }

    // Seiteninhalte via Puppeteer extrahieren
    let pageContent: {
      title: string;
      description: string;
      sellerInfo: string;
      additionalInfo: string;
    };

    try {
      pageContent = await extractPageContent(alert.url);
    } catch (scrapeError) {
      console.error("Page extraction failed:", scrapeError);
      // Fallback: Analyse nur mit Alert-Daten
      pageContent = {
        title: alert.title,
        description: "",
        sellerInfo: "",
        additionalInfo: "",
      };
    }

    // KI-Analyse
    const analysisJson = await analyzeWithAI(
      alert.title,
      alert.price,
      alert.platform,
      pageContent
    );

    // In DB speichern
    await prisma.preisradarAlert.update({
      where: { id },
      data: { detailAnalysis: analysisJson },
    });

    return NextResponse.json({
      success: true,
      analysis: JSON.parse(analysisJson),
      cached: false,
      newBalance: deductResult.newBalance,
    });
  } catch (error) {
    console.error("Detail-Analyse error:", error);
    return NextResponse.json(
      { error: "Analyse fehlgeschlagen. Bitte versuche es erneut." },
      { status: 500 }
    );
  }
}
