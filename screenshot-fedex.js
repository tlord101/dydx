const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Helper function to wait
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Script to visit FedEx website and take screenshots for all clickable links and buttons
 */

async function captureScreenshots() {
  const screenshotsDir = path.join(__dirname, 'screenshots');
  
  // Create screenshots directory if it doesn't exist
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    console.log('Navigating to FedEx website...');
    let url = 'https://www.fedex.com/en-gb/home.html';
    let useMock = false;
    
    // Try to load the real website first
    try {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      console.log('Page loaded successfully from real website!');
    } catch (error) {
      // If real website fails, use local mock
      console.log('Could not reach real website, using local mock...');
      const mockPath = path.join(__dirname, 'fedex-mock.html');
      url = `file://${mockPath}`;
      await page.goto(url, {
        waitUntil: 'load',
        timeout: 10000
      });
      useMock = true;
      console.log('Mock page loaded successfully!');
    }

    // Wait for page to be fully loaded
    await delay(3000);

    // Take initial screenshot of the homepage
    const initialScreenshot = path.join(screenshotsDir, '00-homepage.png');
    await page.screenshot({ path: initialScreenshot, fullPage: true });
    console.log(`Screenshot saved: ${initialScreenshot}`);

    // Find all clickable elements (links and buttons)
    console.log('Finding all clickable elements...');
    const clickableElements = await page.evaluate(() => {
      const elements = [];
      
      // Find all links
      const links = document.querySelectorAll('a[href]');
      links.forEach((link, index) => {
        const text = link.innerText?.trim() || link.getAttribute('aria-label') || link.getAttribute('title') || `link-${index}`;
        const href = link.getAttribute('href');
        if (href && !href.startsWith('javascript:') && text) {
          elements.push({
            type: 'link',
            text: text.substring(0, 50), // Limit text length
            selector: `a[href="${href}"]`,
            index: index
          });
        }
      });

      // Find all buttons
      const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
      buttons.forEach((button, index) => {
        const text = button.innerText?.trim() || button.getAttribute('aria-label') || button.getAttribute('value') || `button-${index}`;
        if (text) {
          elements.push({
            type: 'button',
            text: text.substring(0, 50), // Limit text length
            selector: `button:nth-of-type(${index + 1})`,
            index: index
          });
        }
      });

      return elements;
    });

    console.log(`Found ${clickableElements.length} clickable elements`);

    // Create a summary file
    const summaryPath = path.join(screenshotsDir, 'summary.txt');
    let summary = `FedEx Website Screenshot Summary\n`;
    summary += `URL: ${url}${useMock ? ' (MOCK - Local File)' : ''}\n`;
    summary += `Date: ${new Date().toISOString()}\n`;
    summary += `Total clickable elements found: ${clickableElements.length}\n\n`;

    // Take screenshots for each element (limit to prevent too many screenshots)
    const maxScreenshots = 50; // Reasonable limit
    const elementsToCapture = clickableElements.slice(0, maxScreenshots);

    for (let i = 0; i < elementsToCapture.length; i++) {
      const element = elementsToCapture[i];
      try {
        console.log(`Processing ${i + 1}/${elementsToCapture.length}: ${element.type} - ${element.text}`);
        
        // Scroll element into view and highlight it
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.outline = '3px solid red';
            el.style.outlineOffset = '2px';
          }
        }, element.selector);

        await delay(500);

        // Take screenshot
        const filename = `${String(i + 1).padStart(3, '0')}-${element.type}-${element.text.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        const screenshotPath = path.join(screenshotsDir, filename);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        // Remove highlight
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) {
            el.style.outline = '';
            el.style.outlineOffset = '';
          }
        }, element.selector);

        summary += `${i + 1}. [${element.type}] ${element.text} - ${filename}\n`;
        
      } catch (error) {
        console.error(`Error processing element ${i + 1}:`, error.message);
        summary += `${i + 1}. [${element.type}] ${element.text} - ERROR: ${error.message}\n`;
      }
    }

    // Write summary file
    fs.writeFileSync(summaryPath, summary);
    console.log(`\nSummary saved to: ${summaryPath}`);

    if (clickableElements.length > maxScreenshots) {
      console.log(`\nNote: Limited to ${maxScreenshots} screenshots out of ${clickableElements.length} total elements.`);
    }

  } catch (error) {
    console.error('Error during execution:', error);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

// Run the script
captureScreenshots()
  .then(() => {
    console.log('\n=== Screenshot capture completed successfully! ===');
    console.log('Check the "screenshots" directory for all captured images.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
