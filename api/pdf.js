import puppeteer from 'puppeteer-core';

export const config = {
  maxDuration: 60, // Maximum allowed time
};

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing URL");

  // --- HARDCODED KEYS (Paste yours here again) ---
  const BROWSERBASE_API_KEY = 'bb_live_s1lMcjQNpDfm2EueNfwHRU7trZ0';
  const BROWSERBASE_PROJECT_ID = 'c63fb2f1-ff9c-4846-96a3-8274af5245d3';
  // -----------------------------------------------

  let browser;
  try {
    console.log(`[Bridge] Starting... Target: ${url}`);
    
    const connectUrl = `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`;
    browser = await puppeteer.connect({ 
      browserWSEndpoint: connectUrl,
    });
    
    const page = await browser.newPage();
    
    // 1. MASQUERADE AS A REAL USER (Crucial for StreetContxt/BlueMatrix)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // 2. NAVIGATE & FOLLOW REDIRECTS
    // We bump the timeout to 40s because redirect chains can be slow
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });

    // DEBUG: Print where we actually landed
    const finalUrl = page.url();
    const pageTitle = await page.title();
    console.log(`[Bridge] Landed on: "${pageTitle}" | URL: ${finalUrl}`);

    // 3. SMART DISCLAIMER CLICKER
    // We look for specific BlueMatrix "Agree" buttons
    const buttonsToClick = [
      "input[value='I Agree']", 
      "input[value='Accept']",
      "a#btnAgree",
      "button#agree-button",
      "form[name='disclaimer'] input[type='submit']"
    ];

    try {
      // Race to find any of these buttons within 5 seconds
      const foundSelector = await Promise.any(
        buttonsToClick.map(sel => page.waitForSelector(sel, { timeout: 5000 }).then(() => sel))
      );

      if (foundSelector) {
        console.log(`[Bridge] FOUND DISCLAIMER BUTTON: ${foundSelector}. Clicking...`);
        await Promise.all([
           // Wait for navigation after clicking (or 5s timeout if it's JS only)
           new Promise(r => setTimeout(r, 5000)),
           page.click(foundSelector)
        ]);
        console.log("[Bridge] Click processed. Waiting for PDF render...");
      }
    } catch (e) {
      console.log("[Bridge] No disclaimer button found. Assuming direct access or PDF viewer.");
    }

    // 4. WAIT FOR PDF CONTENT
    // Sometimes the PDF is inside an <embed> or specific viewer div.
    // We wait 5 seconds just to be safe.
    await new Promise(r => setTimeout(r, 5000));

    // 5. CAPTURE
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    const sizeKB = Math.round(pdfBuffer.length / 1024);

    console.log(`[Bridge] Capture Complete. Size: ${sizeKB} KB`);

    if (sizeKB < 20) {
      console.warn("[Bridge WARNING] PDF is suspiciously small. Likely failed to bypass gateway.");
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error("[Bridge Error]", error);
    res.status(500).send(`ERROR: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }
}
