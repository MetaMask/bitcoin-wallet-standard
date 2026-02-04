import bs58 from 'bs58';
import { vi } from 'vitest';
import { CaipScope } from '../src/types/common';

export const mockAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const mockAddress2 = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
export const mockPublicKey = bs58.decode(mockAddress);
export const mockPublicKey2 = bs58.decode(mockAddress2);
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
export const mockGetSession = (mockClient: ReturnType<typeof createMockClient>, addresses?: string[]) => {
  mockClient.getSession.mockResolvedValue({
    sessionScopes: addresses
      ? {
          [mockScope]: {
            accounts: addresses.map((address) => `${mockScope}:${address}`),
          },
        }
      : {},
  });
};

export const mockCreateSession = (mockClient: ReturnType<typeof createMockClient>, addresses?: string[]) => {
  mockClient.createSession.mockResolvedValue({
    sessionScopes: addresses
      ? {
          [mockScope]: {
            accounts: addresses.map((address) => `${mockScope}:${address}`),
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
