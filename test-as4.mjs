import puppeteer from "puppeteer";
const browser = await puppeteer.launch({
  headless: "new", executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
try {
  // Correct AutoScout24 search URL format
  await page.goto("https://www.autoscout24.ch/de/autos/bmw--m3", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 8000));
  const text = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log("TEXT:", text);
} catch(e) { console.error("ERR:", e.message); }
await browser.close();
