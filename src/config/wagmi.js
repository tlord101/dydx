import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, arbitrum } from '@reown/appkit/networks';
import { QueryClient } from '@tanstack/react-query';

// 1. Get projectId from https://cloud.reown.com
export const projectId = process.env.REACT_APP_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID';

// 2. Create wagmiConfig
const metadata = {
  name: 'dYdX Clone',
  description: 'dYdX Trading Platform',
  url: 'https://dydx.exchange',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

export const networks = [mainnet, arbitrum];

// 3. Create Wagmi Adapter
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false
});

// 4. Create query client
export const queryClient = new QueryClient();

// 5. Create AppKit instance
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: false,
    email: false,
    socials: [],
    emailShowWallets: false
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#6669FF',
    '--w3m-color-mix': '#101014',
    '--w3m-color-mix-strength': 20,
    '--w3m-border-radius-master': '8px'
  }
});

export const config = wagmiAdapter.wagmiConfig;
