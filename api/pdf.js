import puppeteer from 'puppeteer-core';

// Allow this function to run for up to 60 seconds
export const config = {
  maxDuration: 60, 
};

export default async function handler(req, res) {
  // 1. Get the URL from the request
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing URL parameter");

  // 2. Get Keys from Environment Variables
  const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
  const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;

  if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
    return res.status(500).send("Server Config Error: Missing Browserbase keys");
  }

  let browser;
  try {
    console.log(`[Bridge] Connecting to Browserbase for: ${url}`);

    // 3. Connect to Browserbase
    const connectUrl = `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`;
    browser = await puppeteer.connect({ browserWSEndpoint: connectUrl });

    const page = await browser.newPage();

    // 4. Navigate to the URL
    // We set a long timeout (30s) and wait for content to load
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 5. "BlueMatrix" Disclaimer Buster
    // We look for common "I Agree" buttons and click them if found
    try {
      const disclaimerSelectors = [
        "input[value='I Agree']", "input[value='Accept']", 
        "button#accept", "a[href*='accept']"
      ];

      const foundSelector = await Promise.any(
        disclaimerSelectors.map(sel => page.waitForSelector(sel, { timeout: 3000 }).then(() => sel))
      );

      if (foundSelector) {
        console.log('[Bridge] Disclaimer found. Clicking...');
        await Promise.all([
           page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
           page.click(foundSelector)
        ]);
      }
    } catch (e) {
      console.log('[Bridge] No disclaimer detected. Proceeding...');
    }

    // 6. Pause to let the PDF viewer render
    await new Promise(r => setTimeout(r, 4000));

    // 7. Generate the PDF
    const pdfBuffer = await page.pdf({ 
      format: 'A4',
      printBackground: true 
    });

    // 8. Send PDF back to Google Sheets
    res.setHeader('Content-Type', 'application/pdf');
    res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error("[Bridge Error]", error);
    res.status(500).send(`ERROR: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }
}
