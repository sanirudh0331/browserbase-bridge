import puppeteer from 'puppeteer-core';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing URL");

  // --- HARDCODED KEYS (Paste yours here again) ---
  const BROWSERBASE_API_KEY = 'PASTE_YOUR_BB_KEY_HERE';
  const BROWSERBASE_PROJECT_ID = 'PASTE_YOUR_PROJECT_ID_HERE';
  // -----------------------------------------------

  let browser;
  try {
    console.log(`[Bridge] Connecting... Target: ${url}`);
    
    const connectUrl = `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`;
    browser = await puppeteer.connect({ 
      browserWSEndpoint: connectUrl,
    });
    
    const page = await browser.newPage();
    
    // 1. Set a real screen size so buttons are visible
    await page.setViewport({ width: 1920, height: 1080 });

    // 2. Go to URL and wait for Network Idle (safer than domcontentloaded)
    // We assume the URL is already unwrapped by Google Sheets
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // 3. AGGRESSIVE DISCLAIMER BUSTER
    try {
      // Common BlueMatrix / Portal selectors
      const selectors = [
        "input[value='I Agree']", 
        "input[value='Accept']", 
        "input[name='btnAgree']",
        "button#accept", 
        "a[href*='accept']",
        ".disclaimer-accept"
      ];
      
      // Wait up to 5s to see if a button exists
      const foundSelector = await Promise.any(
        selectors.map(s => page.waitForSelector(s, { timeout: 5000 }).then(() => s))
      );

      if (foundSelector) {
        console.log(`[Bridge] Clicker: Found ${foundSelector}`);
        
        // Click and wait for the page to actually change
        await Promise.all([
          page.click(foundSelector),
          // Wait for navigation OR just wait 5 seconds if it's a single-page-app
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      }
    } catch (e) {
      console.log("[Bridge] No disclaimer button found (or timed out). Assuming direct access.");
    }

    // 4. FINAL SAFETY WAIT
    // BlueMatrix reports are heavy. Give them 6 seconds to render the text.
    await new Promise(r => setTimeout(r, 6000));

    // 5. Generate PDF
    const pdfBuffer = await page.pdf({ 
      format: 'A4',
      printBackground: true 
    });

    console.log(`[Bridge] Success. PDF Size: ${pdfBuffer.length}`);
    res.setHeader('Content-Type', 'application/pdf');
    res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error("[Bridge Error]", error);
    res.status(500).send(`ERROR: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }
}
