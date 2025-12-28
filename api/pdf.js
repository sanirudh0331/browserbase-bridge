import puppeteer from 'puppeteer-core';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing URL");

  // --- PASTE YOUR KEYS HERE ---
  const BROWSERBASE_API_KEY = 'bb_live_s1lMcjQNpDfm2EueNfwHRU7trZ0';
  const BROWSERBASE_PROJECT_ID = 'c63fb2f1-ff9c-4846-96a3-8274af5245d3';
  // ----------------------------

  let browser;
  try {
    console.log(`[Bridge] Connecting to: ${url}`);
    const connectUrl = `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`;
    
    browser = await puppeteer.connect({ browserWSEndpoint: connectUrl });
    const page = await browser.newPage();
    
    // 1. STEALTH & SIZE
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // 2. NAVIGATE (Wait longer for initial load)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait 5 seconds just to let the "Iframe" structure load
    await new Promise(r => setTimeout(r, 5000));

    // 3. THE "NUCLEAR" FRAME HUNTER
    // We look at the main page AND every iframe (window-within-window)
    const frames = page.frames();
    console.log(`[Bridge] Hunting through ${frames.length} frames for 'Agree' buttons...`);

    let clicked = false;
    
    // Loop through every frame to find the button
    for (const frame of frames) {
      try {
        // Look for common BlueMatrix buttons using generic text matching
        const button = await frame.$("input[value='I Agree'], input[value='Accept'], button, a.btn");
        
        if (button) {
          // Check text content to be sure
          const text = await frame.evaluate(el => el.value || el.innerText, button);
          if (text && (text.includes('Agree') || text.includes('Accept'))) {
            console.log(`[Bridge] FOUND BUTTON in frame! Text: "${text}". Clicking...`);
            await button.click();
            clicked = true;
            break; // Stop after clicking one
          }
        }
      } catch (e) {
        // Ignore errors in protected frames
      }
    }

    if (!clicked) {
      console.log("[Bridge] No obvious button found. Checking for 'Direct Access'...");
    } else {
      // If we clicked, wait 10 seconds for the redirect/reload
      console.log("[Bridge] Click successful. Waiting 10s for report to load...");
      await new Promise(r => setTimeout(r, 10000));
    }

    // 4. GENERATE PDF
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    
    console.log(`[Bridge] Final PDF Size: ${Math.round(pdfBuffer.length / 1024)} KB`);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error("[Bridge Error]", error);
    res.status(500).send(`ERROR: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }
}
