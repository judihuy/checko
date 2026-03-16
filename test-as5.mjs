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
  await page.goto("https://www.autoscout24.ch/de/autos/alle-marken?vehtyp=10&cy=CH&atype=C&desc=0", { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // Accept cookies
  const accepted = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const accept = btns.find(b => b.textContent.includes("Akzeptieren"));
    if (accept) { accept.click(); return true; }
    return false;
  });
  console.log("Cookie accepted:", accepted);
  await new Promise(r => setTimeout(r, 5000));
  
  const url = page.url();
  console.log("Current URL:", url);
  
  const text = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log("TEXT:", text);
  
  const html = await page.content();
  console.log("HTML size:", html.length);
  
  // Search for CHF prices
  const priceRegex = /CHF[\s\d'.,]+/g;
  const prices = [...html.matchAll(priceRegex)].map(m => m[0]).slice(0, 8);
  console.log("Prices found:", prices);
} catch(e) { console.error("ERR:", e.message); }
await browser.close();
