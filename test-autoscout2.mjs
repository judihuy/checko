import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

// Intercept network requests to find the API
const apiCalls = [];
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('api') || url.includes('search') || url.includes('listing') || url.includes('graphql')) {
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('json')) {
      try {
        const body = await response.text();
        apiCalls.push({ url: url.substring(0, 150), status: response.status(), size: body.length, sample: body.substring(0, 200) });
      } catch(e) {}
    }
  }
});

try {
  await page.goto('https://www.autoscout24.ch/de/autos/alle-marken?vehtyp=10&cy=CH&atype=C&q=bmw+m3', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('API calls found:', apiCalls.length);
  for (const call of apiCalls.slice(0, 10)) {
    console.log('---');
    console.log('URL:', call.url);
    console.log('Status:', call.status, 'Size:', call.size);
    console.log('Sample:', call.sample);
  }
} catch(e) {
  console.error('Error:', e.message);
}
await browser.close();
