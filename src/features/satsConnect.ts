import type { BitcoinProvider } from '../types/satsConnect';

export const BitcoinSatsConnect = 'sats-connect:';

export type BitcoinSatsConnectFeature = {
  [BitcoinSatsConnect]: {
    provider: BitcoinProvider;
  };
};
