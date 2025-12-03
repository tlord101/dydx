# @dydx/wallet-button

Small helper to attach a wallet-connect action to a DOM button. It will try to use `@reown/appkit` when available, otherwise it dispatches a `wallet-connect-request` event.

Install (when published):

```
npm install @dydx/wallet-button
```

Usage (ES module):

```js
import { attachConnectButton } from '@dydx/wallet-button';

attachConnectButton({
  buttonId: 'connect-wallet-btn',
  projectId: 'your-reown-project-id',
  onConnected: (acct) => console.log('connected', acct)
});

// Or listen for fallback event:
document.addEventListener('wallet-connect-request', (e) => {
  // open your own wallet modal
  console.log('connect requested', e.detail);
});
```

Button id suggestion: `connect-wallet-btn`
