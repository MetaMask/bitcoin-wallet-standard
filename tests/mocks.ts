import { vi } from 'vitest';
import { CaipScope } from '../src/types/common';

export const mockAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
export const mockAddress2 = 'bc1qrp33g0q5b5698ahp5jnf0y5ems7c3mfjntv5lg';
export const mockPublicKey = new TextEncoder().encode(mockAddress);
export const mockPublicKey2 = new TextEncoder().encode(mockAddress2);
export const mockScope = CaipScope.MAINNET;

// Create mock for MultichainApiClient
export const createMockClient = () => {
  return {
    onNotification: vi.fn(),
    getSession: vi.fn(),
    createSession: vi.fn(),
    invokeMethod: vi.fn(),
    revokeSession: vi.fn(),
    extendsRpcApi: vi.fn(),
  };
};

// Helper to setup a session with an account
export const mockGetSession = (
  mockClient: ReturnType<typeof createMockClient>,
  addresses?: string[],
  scope: CaipScope = mockScope,
) => {
  mockClient.getSession.mockResolvedValue({
    sessionScopes: addresses
      ? {
          [scope]: {
            accounts: addresses.map((address) => `${scope}:${address}`),
          },
        }
      : {},
  });
};

export const mockCreateSession = (
  mockClient: ReturnType<typeof createMockClient>,
  addresses?: string[],
  scope: CaipScope = mockScope,
) => {
  mockClient.createSession.mockResolvedValue({
    sessionScopes: addresses
      ? {
          [scope]: {
            accounts: addresses.map((address) => `${scope}:${address}`),
          },
        }
      : {},
  });
};

export const mockChain = 'bitcoin:mainnet';

// Mock window object for tests
// @ts-ignore - Mocking window
global.window = {
  location: {
    host: 'example.com',
  } as Location,
};
