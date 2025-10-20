import { registerWallet } from '@wallet-standard/wallet';
import type { WalletOptions } from '../types';
import { SatsConnectWallet } from './satsConnectWallet';

export function getSatsConnectWalletStandard(options: WalletOptions) {
  return new SatsConnectWallet(options);
}

export async function registerBitcoinSatsConnectWalletStandard(options: WalletOptions) {
  const wallet = getSatsConnectWalletStandard(options);

  registerWallet(wallet);
}
