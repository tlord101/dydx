# FedEx Website Screenshot Tool

This tool automatically visits the FedEx UK website and captures screenshots highlighting all clickable links and buttons.

## Features

- Navigates to https://www.fedex.com/en-gb/home.html
- Identifies all clickable elements (links and buttons)
- Takes a screenshot highlighting each element
- Generates a summary report of all captured elements
- Stores all screenshots in a dedicated directory

## Prerequisites

- Node.js (v14 or higher)
- Puppeteer (already installed in this project)
- Chrome/Chromium browser (available on the system)

## Usage

### Run the screenshot tool:

```bash
npm run screenshot-fedex
```

Or directly:

```bash
node screenshot-fedex.js
```

## Output

The script creates a `screenshots` directory (git-ignored) containing:

1. **00-homepage.png** - Full-page screenshot of the FedEx homepage
2. **001-[type]-[description].png** through **050-[type]-[description].png** - Screenshots of each clickable element highlighted in red
3. **summary.txt** - A text file listing all captured elements with their descriptions and filenames

## How It Works

1. Launches a headless Chrome browser
2. Navigates to the FedEx UK homepage
3. Waits for the page to fully load
4. Captures initial homepage screenshot
5. Identifies all `<a>` tags and `<button>` elements
6. For each element:
   - Scrolls it into view
   - Highlights it with a red outline
   - Takes a screenshot
   - Removes the highlight
7. Generates a summary report
8. Closes the browser

## Configuration

The script is configured to:
- Capture up to 50 screenshots (to prevent excessive file generation)
- Use 1920x1080 viewport size
- Run in headless mode
- Wait for network idle before capturing

You can modify these settings in the `screenshot-fedex.js` file:

```javascript
const maxScreenshots = 50; // Change this to capture more/fewer screenshots
await page.setViewport({ width: 1920, height: 1080 }); // Change viewport size
```

## Troubleshooting

### Browser not found
If you get an error about Chrome not being found, set the `PUPPETEER_EXECUTABLE_PATH` environment variable:

```bash
export PUPPETEER_EXECUTABLE_PATH=/path/to/your/chrome
npm run screenshot-fedex
```

Or update the default path in the script (line 22):

```javascript
executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
```

### Timeout errors
If the page takes too long to load, increase the timeout:

```javascript
await page.goto('https://www.fedex.com/en-gb/home.html', {
  waitUntil: 'networkidle2',
  timeout: 90000 // Increase from 60000 to 90000
});
```

### Network issues
The script includes flags to handle potential network and security issues:
- `--no-sandbox`
- `--disable-setuid-sandbox`
- `--disable-web-security`

## Notes

- Screenshots are NOT committed to the repository (excluded via .gitignore)
- The script limits screenshots to 50 elements to keep file sizes manageable
- Elements are highlighted in red for easy identification
- The summary file provides a complete list of all found elements

## License

This tool is part of the permit2-dapp project.
