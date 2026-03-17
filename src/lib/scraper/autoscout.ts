// AutoScout24.ch Scraper — Puppeteer-basiert
// Nutzt headless Chromium um die React-RSC-Seite zu rendern
// URL-Format mit echten Filtern:
// - Make/Model: /de/s/mo-{model}/mk-{make}
// - Year: ?yearFrom=X&yearTo=Y (legacy) ODER ?fregfrom=X&fregto=Y
// - KM: ?kmto=X (Kilometer bis)
// - Preis: ?pricefrom=X&priceto=Y
// - Treibstoff: ?fst=p (benzin), d (diesel), e (elektro), h (hybrid)
// - Getriebe: ?atype=M (manuell), A (automatik)

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

// Fuel type mapping: internal → AutoScout24 URL code
const FUEL_TYPE_MAP: Record<string, string> = {
  benzin: "B",
  diesel: "D",
  elektro: "E",
  hybrid: "H",
  "plug-in-hybrid": "H",
  gas: "L", // LPG
};

// Transmission mapping: internal → AutoScout24 URL code
// Robust: alle gängigen Varianten abfangen (UI zeigt "Automatik", intern evtl. "automat" etc.)
const TRANSMISSION_MAP: Record<string, string> = {
  manuell: "M",
  manual: "M",
  schaltgetriebe: "M",
  automat: "A",
  automatik: "A",
  automatisch: "A",
  automatic: "A",
};

export class AutoScoutScraper extends BaseScraper {
  readonly platform = "autoscout";
  readonly displayName = "AutoScout24.ch";
  readonly baseUrl = "https://www.autoscout24.ch";
  isWorking = true;

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      // Build search URL — use mk-/mo- path format for precise make/model filtering
      let searchUrl: string;
      if (options?.vehicleMake) {
        const make = options.vehicleMake.toLowerCase().replace(/\s+/g, "-");
        if (options.vehicleModel) {
          const model = options.vehicleModel.toLowerCase().replace(/\s+/g, "-");
          searchUrl = `${this.baseUrl}/de/s/mo-${encodeURIComponent(model)}/mk-${encodeURIComponent(make)}`;
        } else {
          searchUrl = `${this.baseUrl}/de/s/mk-${encodeURIComponent(make)}`;
        }
      } else {
        searchUrl = `${this.baseUrl}/de/s?q=${encodeURIComponent(query)}`;
      }

      // Echte AutoScout24 URL-Parameter für Filter
      // Verifizierte Parameter (autoscout24.ch/lst + autoscout24.ch/de/s):
      // - Baujahr: fregfrom / fregto (first registration)
      // - KM: kmfrom / kmto
      // - Preis: pricefrom / priceto (in CHF)
      // - Treibstoff: fuel (B=Benzin, D=Diesel, E=Elektro, H=Hybrid, L=Gas)
      // - Getriebe: gear (M=Manuell, A=Automatik)
      // - Zustand: ustate (N=Neu, U=Occasion)
      // - Sortierung: sort (standard)
      const urlParams = new URLSearchParams();

      // Baujahr-Filter (fregfrom/fregto = first registration year)
      if (options?.yearFrom) urlParams.set("fregfrom", String(options.yearFrom));
      if (options?.yearTo) urlParams.set("fregto", String(options.yearTo));

      // KM-Filter — JETZT mit echten Parameternamen!
      if (options?.kmFrom) urlParams.set("kmfrom", String(options.kmFrom));
      if (options?.kmTo) urlParams.set("kmto", String(options.kmTo));

      // Preis-Filter (in CHF — Preise kommen als Rappen rein)
      if (options?.minPrice) urlParams.set("pricefrom", String(Math.round(options.minPrice / 100)));
      if (options?.maxPrice) urlParams.set("priceto", String(Math.round(options.maxPrice / 100)));

      // Treibstoff-Filter (case-insensitive lookup)
      if (options?.fuelType) {
        const fuelCode = FUEL_TYPE_MAP[options.fuelType.toLowerCase()];
        if (fuelCode) urlParams.set("fuel", fuelCode);
      }

      // Getriebe-Filter (case-insensitive lookup)
      if (options?.transmission) {
        const gearCode = TRANSMISSION_MAP[options.transmission.toLowerCase()];
        if (gearCode) urlParams.set("gear", gearCode);
      }

      // Zielland Schweiz
      urlParams.set("cy", "CH");

      const paramStr = urlParams.toString();
      if (paramStr) {
        searchUrl += (searchUrl.includes("?") ? "&" : "?") + paramStr;
      }

      console.log(`[AutoScout] Search URL: ${searchUrl}`);

      // Use Puppeteer to render the page (RSC requires full browser)
      let puppeteer;
      try {
        puppeteer = (await import("puppeteer")).default;
      } catch {
        console.error("[AutoScout] Puppeteer not available");
        return results;
      }

      const browser = await puppeteer.launch({
        headless: true,
        executablePath: "/usr/bin/chromium",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
        ],
      });

      try {
        const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, "webdriver", { get: () => false });
        });
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        );

        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
        await new Promise((r) => setTimeout(r, 3000));

        // Accept cookies if present
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const accept = btns.find((b) => b.textContent?.includes("Akzeptieren"));
          if (accept) (accept as HTMLButtonElement).click();
        });
        await new Promise((r) => setTimeout(r, 3000));

        // Extract listings from rendered page (including description snippets)
        const scraped = await page.evaluate(() => {
          const items: Array<{
            title: string;
            price: number;
            url: string;
            imageUrl: string | null;
            description: string | null;
          }> = [];
          const links = document.querySelectorAll('a[href*="/de/d/"]');
          const seen = new Set<string>();

          for (const link of links) {
            const href = (link as HTMLAnchorElement).href;
            if (seen.has(href)) continue;
            seen.add(href);

            const card =
              link.closest("article") ||
              link.parentElement?.parentElement?.parentElement;
            if (!card) continue;

            const cardText = (card as HTMLElement).innerText || "";
            const lines = cardText.split("\n").filter((l) => l.trim().length > 5);
            const title = lines[0] || "";

            // Skip non-listing titles
            if (title.startsWith("1 / ") || title.includes("Auktion erstellen")) continue;

            // Price: CHF XX'XXX.–
            const priceMatch = cardText.match(/CHF\s*([\d''.,-]+)/);
            let price = 0;
            if (priceMatch) {
              price = Math.round(
                parseFloat(
                  priceMatch[1].replace(/['']/g, "").replace(".–", "").replace(",", ".")
                ) * 100
              ); // Rappen
            }

            // Image
            const img = card.querySelector("img[src*='http']") as HTMLImageElement | null;
            const imageUrl = img ? img.src : null;

            // Description: collect remaining lines as description snippet
            const descriptionLines = lines.slice(1).filter(l => 
              !l.match(/^CHF/) && !l.match(/^\d+\s*km/) && l.length > 10
            );
            const description = descriptionLines.length > 0 
              ? descriptionLines.join(" ").substring(0, 500) 
              : null;

            if (title && price > 0) {
              items.push({ title: title.substring(0, 200), price, url: href, imageUrl, description });
            }

            if (items.length >= 20) break;
          }
          return items;
        });

        console.log(`[AutoScout] ${scraped.length} listings found`);

        for (const item of scraped) {
          // Price filter (Doppelt-Check — URL-Parameter sollten schon filtern)
          if (options?.minPrice && item.price < options.minPrice) continue;
          if (options?.maxPrice && item.price > options.maxPrice) continue;

          results.push({
            title: item.title,
            price: item.price,
            url: item.url,
            imageUrl: item.imageUrl,
            description: item.description || undefined,
            platform: this.platform,
            scrapedAt: new Date(),
          });

          if (options?.limit && results.length >= options.limit) break;
        }

        await page.close();
      } finally {
        await browser.close();
      }
    } catch (error) {
      const reason =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      console.error(`[AutoScout] Scraper error: ${reason}`);
    }

    return results;
  }
}
