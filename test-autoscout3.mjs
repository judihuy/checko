import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
  headless: "new",
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

try {
  await page.goto("https://www.autoscout24.ch/de/autos/alle-marken?vehtyp=10&cy=CH&atype=C&q=bmw+m3", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 8000));
  
  const allText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log("Body text:", allText);
  
  const html = await page.content();
  const prices = html.match(/CHF[\s\d\x27.,-]+/g);
  console.log("Prices:", prices ? prices.slice(0, 5) : "none");
  
  const bmw = html.match(/BMW[^<]{0,60}/gi);
  console.log("BMW:", bmw ? bmw.slice(0, 5) : "none");
} catch(e) {
  console.error("Error:", e.message);
}
await browser.close();
