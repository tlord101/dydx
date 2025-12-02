# @tlord101/permit2-widget

Lightweight client SDK to open a Permit2 signing popup and return the saved permit signature. Designed to let other sites integrate your hosted signing flow with a single script or npm install.

Features
- Popup-based signing flow that opens your hosted app and returns a `{ type: 'permit2_result', ... }` object.
- `open()` to programmatically open the popup and await the result.
- `attach()` to bind the flow to DOM buttons or selectors.
- Auto-attach: elements with `data-permit2-app` will be wired automatically.

Install

From npm (when published):

```bash
npm install @tlord101/permit2-widget
```

CDN / UMD

After publishing, a UMD build will be available via jsDelivr or unpkg. Example:

```html
<script src="https://cdn.jsdelivr.net/npm/@tlord101/permit2-widget/dist/index.umd.js"></script>
<script>
  // global: Permit2Widget
</script>
```

Quick usage

Programmatic:

```js
import Permit2Widget from '@tlord101/permit2-widget';

const result = await Permit2Widget.open('https://your-app.example.com', { timeout: 300000 });
console.log(result);
```

Attach to buttons:

```html
<button id="signBtn">Sign Permit</button>
<script>
  import Permit2Widget from '@tlord101/permit2-widget';
  Permit2Widget.attach('#signBtn', 'https://your-app.example.com', {
    onResult(result) { console.log('signed', result); },
    onError(err) { console.error(err); }
  });
</script>
```

Auto-attach via data-attribute:

```html
<button data-permit2-app="https://your-app.example.com">Sign Permit</button>
<script src="https://your-app.example.com/dist/your-widget-umd.js"></script>
```

Security notes
- Consumers should validate `event.origin` when listening for `postMessage` on the page.
- Popup-based flows are recommended: many wallets block or limit embedded iframes.

Publishing & CI
- This package includes an `esbuild`-based build script (`scripts/build.js`).
- A recommended GitHub Actions workflow (added in the repo root) will publish the package to npm when a git tag is pushed and `NPM_TOKEN` secret is configured.

License: MIT
