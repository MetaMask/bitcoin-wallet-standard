/**
 * This file is used to re-export types from the 'sats-connect' package.
 * We want to avoid direct dependencies on 'sats-connect' in other parts of our codebase.
 *
 * And be sure we only import types at build time, but there is no runtime code included !!!
 */
import type { BitcoinProvider } from 'sats-connect';
export type {
  BitcoinProvider,
  GetAddressResponse,
  SignMessageOptions,
  SignTransactionOptions,
  SignTransactionResponse,
  SignMultipleTransactionsResponse,
  GetCapabilitiesResponse,
  SendBtcTransactionOptions,
  SendBtcTransactionResponse,
  CreateInscriptionResponse,
  CreateRepeatInscriptionsResponse,
  AddListener,
  ListenerInfo,
  Requests,
  RpcResponse,
  Params,
  Address,
  // V4 RPC method param types
  SignMessageParams,
  SendTransferParams,
  SignPsbtParams,
} from 'sats-connect';

/**
 * Bitcoin network types used in V4 RPC responses.
 */
export enum BitcoinNetworkType {
  Mainnet = 'Mainnet',
  Testnet = 'Testnet',
  Testnet4 = 'Testnet4',
  Signet = 'Signet',
  Regtest = 'Regtest',
}

/**
 * Stacks network types used in V4 RPC responses.
 */
export enum StacksNetworkType {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
}

/**
 * Spark network types used in V4 RPC responses.
 */
export enum SparkNetworkType {
  Mainnet = 'mainnet',
  Regtest = 'regtest',
}

/**
 * Message signing protocols supported by SatsConnect V4.
 */
export enum MessageSigningProtocols {
  ECDSA = 'ECDSA',
  BIP322 = 'BIP322',
}

/**
 * JSON-RPC error codes used in V4 RPC error responses.
 * @see {@link https://www.jsonrpc.org/specification#error_object}
 */
export enum RpcErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  USER_REJECTION = -32000,
  METHOD_NOT_SUPPORTED = -32001,
  ACCESS_DENIED = -32002,
}

/**
 * SatsConnect account change event name.
 * @see {@link https://github.com/secretkeylabs/sats-connect-core/blob/main/src/provider/types.ts#L22 | accountChangeEventName}
 */
export const AccountChangeEventName = 'accountChange';

/**
 * SatsConnect disconnect event name.
 * @see {@link https://github.com/secretkeylabs/sats-connect-core/blob/main/src/provider/types.ts#L44 | accountChangeEventName}
 */
export const DisconnectEventName = 'disconnect';

/**
 * Address purposes supported by SatsConnect.
 * We should keep the same casing as in 'sats-connect' package.
 */
export enum AddressPurpose {
  Ordinals = 'ordinals',
  Payment = 'payment',
  Stacks = 'stacks',
  Starknet = 'starknet',
  Spark = 'spark',
}

/**
 * Wallet types supported by SatsConnect.
 */
export enum WalletType {
  SOFTWARE = 'software',
  LEDGER = 'ledger',
  KEYSTONE = 'keystone',
}

/**
 * Address types supported by SatsConnect.
 * We should keep the same casing as in 'sats-connect' package.
 */
export enum AddressType {
  p2pkh = 'p2pkh',
  p2sh = 'p2sh',
  p2wpkh = 'p2wpkh',
  p2wsh = 'p2wsh',
  p2tr = 'p2tr',
  stacks = 'stacks',
  starknet = 'starknet',
  spark = 'spark',
}

/**
 * The namespace used to identify the SatsConnect feature.
 */
export const SatsConnectFeatureName = 'sats-connect:';

/**
 * The SatsConnect feature interface.
 */
export type SatsConnectFeature = {
  [SatsConnectFeatureName]: {
    provider: BitcoinProvider;
  };
};

/**
 * SatsConnect address
 */
export interface SatsConnectAccount {
  purpose: AddressPurpose;
  publicKey: Uint8Array;
  address: string;
}
