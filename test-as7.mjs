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
  // New search URL format
  await page.goto("https://www.autoscout24.ch/de/s/bmw-m3", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // Accept cookies
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const accept = btns.find(b => b.textContent.includes("Akzeptieren"));
    if (accept) accept.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  
  const text = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log("TEXT:", text);
  
  // Look for listing links
  const listings = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a[href*='/de/d/']"))
      .slice(0, 5)
      .map(a => ({ href: a.href, text: a.textContent.substring(0, 80).trim() }));
  });
  console.log("Listings:", JSON.stringify(listings, null, 2));

} catch(e) { console.error("ERR:", e.message); }
await browser.close();
