/**
 * wallet-button
 * Attach a click handler to a button that attempts to open Reown AppKit (if available)
 * or otherwise dispatches a `wallet-connect-request` event so host sites can handle the flow.
 *
 * Usage:
 * import { attachConnectButton } from '@dydx/wallet-button'
 * attachConnectButton({ buttonId: 'connect-wallet-btn', projectId: 'YOUR_PROJECT_ID', onConnected })
 */

export async function attachConnectButton({ buttonId = 'connect-wallet-btn', projectId, onConnected } = {}) {
  const btn = typeof buttonId === 'string' ? document.getElementById(buttonId) : buttonId;
  if (!btn) throw new Error('Button not found: ' + buttonId);

  btn.addEventListener('click', async (e) => {
    // Try to use Reown AppKit automatically if the host has it installed
    try {
      const { createAppKit } = await import('@reown/appkit');
      const { EthersAdapter } = await import('@reown/appkit-adapter-ethers');
      const { mainnet } = await import('@reown/appkit/networks');

      const appKit = createAppKit({
        adapters: [new EthersAdapter()],
        networks: [mainnet],
        projectId: projectId || (window?.REOWN_PROJECT_ID)
      });

      // Subscribe to account changes
      const unsub = appKit.subscribeAccount((acct) => {
        if (acct?.isConnected) {
          if (typeof onConnected === 'function') onConnected(acct);
          unsub?.();
        }
      });

      // Try to open modal - AppKit implementations may differ
      if (typeof appKit.open === 'function') {
        appKit.open();
      } else if (typeof appKit.openModal === 'function') {
        appKit.openModal();
      } else {
        // fallback: ask host app to handle request
        document.dispatchEvent(new CustomEvent('wallet-connect-request', { detail: { source: 'wallet-button' } }));
      }
      return;
    } catch (err) {
      // If AppKit isn't available or failed to load, dispatch a fallback event
      document.dispatchEvent(new CustomEvent('wallet-connect-request', { detail: { source: 'wallet-button', error: String(err) } }));
    }
  });
}

export default attachConnectButton;
