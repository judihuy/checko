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
await page.setExtraHTTPHeaders({ "Accept-Language": "de-CH,de;q=0.9" });

try {
  // Go to homepage first
  await page.goto("https://www.autoscout24.ch", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  
  // Accept cookies
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const accept = btns.find(b => b.textContent.includes("Akzeptieren"));
    if (accept) accept.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  
  // Get all links to understand URL structure
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a[href]"))
      .map(a => a.href)
      .filter(h => h.includes("autoscout") && (h.includes("suche") || h.includes("search") || h.includes("autos") || h.includes("listing")))
      .slice(0, 15);
  });
  console.log("Search-related links:", JSON.stringify(links, null, 2));
  
  // Find search input
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("input, select"))
      .map(el => ({ tag: el.tagName, name: el.name, id: el.id, placeholder: el.placeholder, type: el.type }))
      .slice(0, 20);
  });
  console.log("Inputs:", JSON.stringify(inputs, null, 2));
  
  // Get body text to understand page
  const text = await page.evaluate(() => document.body.innerText.substring(0, 1500));
  console.log("Homepage text:", text);

} catch(e) { console.error("ERR:", e.message); }
await browser.close();
