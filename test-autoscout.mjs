import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

try {
  await page.goto('https://www.autoscout24.ch/de/autos/alle-marken?vehtyp=10&cy=CH&atype=C&q=bmw+m3', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  
  const html = await page.content();
  console.log('HTML length:', html.length);
  
  const nd = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    return el ? el.textContent.substring(0, 500) : 'NO_NEXT_DATA';
  });
  console.log('NextData:', nd);
  
  const items = await page.evaluate(() => {
    const results = [];
    const sels = ['article', '[data-testid]', 'a[href*="/de/autos/"]', '[class*=listing]', '[class*=vehicle]', '[class*=result]'];
    for (const sel of sels) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) results.push({ sel, count: els.length, sample: els[0].textContent?.substring(0, 100) });
    }
    return results;
  });
  console.log('Elements:', JSON.stringify(items));
} catch(e) {
  console.error('Error:', e.message);
}
await browser.close();
