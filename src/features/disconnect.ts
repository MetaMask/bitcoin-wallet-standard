/** Name of the feature. */
export const BitcoinDisconnect = 'bitcoin:disconnect';

/**
 * `standard:disconnect` is a {@link "@wallet-standard/base".Wallet.features | feature} that may be implemented by a
 * {@link "@wallet-standard/base".Wallet} to allow the app to perform any cleanup work.
 *
 * This feature may or may not be used by the app and the Wallet should not depend on it being used.
 * If this feature is used by the app, the Wallet should perform any cleanup work, but should not revoke authorization
 * to use accounts previously granted through the {@link ConnectFeature}.
 *
 * @group Disconnect
 */
export type BitcoinDisconnectFeature = {
  /** Name of the feature. */
  readonly [BitcoinDisconnect]: {
    /** Version of the feature implemented by the Wallet. */
    readonly version: BitcoinDisconnectVersion;
    /** Method to call to use the feature. */
    readonly disconnect: BitcoinDisconnectMethod;
  };
};

/**
 * Version of the {@link StandardDisconnectFeature} implemented by a Wallet.
 *
 * @group Disconnect
 */
export type BitcoinDisconnectVersion = '1.0.0';

/**
 * Method to call to use the {@link StandardDisconnectFeature}.
 *
 * @group Disconnect
 */
export type BitcoinDisconnectMethod = () => Promise<void>;
