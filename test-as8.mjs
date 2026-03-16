import puppeteer from "puppeteer";
const browser = await puppeteer.launch({
  headless: "new", executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-blink-features=AutomationControlled"]
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => false });
});
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

try {
  // Test keyword search URL format
  const query = "bmw m3";
  const url = `https://www.autoscout24.ch/de/s?q=${encodeURIComponent(query)}`;
  console.log("Testing:", url);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // Accept cookies  
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const accept = btns.find(b => b.textContent.includes("Akzeptieren"));
    if (accept) accept.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  
  // Extract listings
  const results = await page.evaluate(() => {
    const items = [];
    // Get all listing links
    const links = document.querySelectorAll('a[href*="/de/d/"]');
    const seen = new Set();
    
    for (const link of links) {
      const href = link.href;
      if (seen.has(href)) continue;
      seen.add(href);
      
      // Find the parent article/card
      const card = link.closest("article") || link.closest("[class*='listing']") || link.parentElement?.parentElement?.parentElement;
      if (!card) continue;
      
      const cardText = card.innerText || "";
      
      // Extract title from first meaningful text
      const lines = cardText.split("\n").filter(l => l.trim().length > 5);
      const title = lines[0] || "";
      
      // Extract price (CHF pattern)
      const priceMatch = cardText.match(/CHF\s*([\d''.,]+)/);
      let price = 0;
      if (priceMatch) {
        price = parseInt(priceMatch[1].replace(/[''.]/g, "").replace(",", ""));
      }
      
      // Extract image
      const img = card.querySelector("img[src*='http']");
      const imageUrl = img ? img.src : null;
      
      // Extract km + year
      const kmMatch = cardText.match(/([\d''.,]+)\s*km/);
      const yearMatch = cardText.match(/\b(20\d{2})\b/);
      
      items.push({
        title: title.substring(0, 100),
        price,
        url: href,
        imageUrl,
        km: kmMatch ? kmMatch[1] : null,
        year: yearMatch ? yearMatch[1] : null,
      });
      
      if (items.length >= 15) break;
    }
    return items;
  });
  
  console.log("Results:", results.length);
  for (const r of results.slice(0, 5)) {
    console.log(`  ${r.title}`);
    console.log(`  CHF ${r.price} | ${r.year || "?"} | ${r.km || "?"} km | Img: ${r.imageUrl ? "YES" : "NO"}`);
    console.log(`  ${r.url}`);
    console.log("---");
  }

} catch(e) { console.error("ERR:", e.message); }
await browser.close();
