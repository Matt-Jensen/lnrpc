const {promisify} = require('util');

const DEFAULTS = {
  subscriptionMethods: [

  ],
};

/**
 * Factory for a WalletKit GRPC service proxy
 *
 * Proxy serves two purposes:
 *  - Wrap non-subscription methods in promises
 *  - Immediately return subscription methods and properties
 *
 * @param  {grpc.PackageDefinition}   lnrpcDescriptor
 * @param  {String}                   server
 * @param  {Object}                   credentials
 * @param  {Object}                   config
 * @return {Proxy}
 */
module.exports = function createWalletKitProxy(
  lnrpcDescriptor,
  server,
  credentials,
  config = {}
) {
  // Configuration options
  const {subscriptionMethods} = Object.assign({}, DEFAULTS, config);

  /**
   * GRPC WalletKit Service
   * @type {lnrpc.WalletKit}
   */
  let walletKit;

  try {
    walletKit = new lnrpcDescriptor.walletrpc.WalletKit(server, credentials);
  } catch (e) {
    if (!e.code) e.code = 'GRPC_WALLET_KIT_SERVICE_ERR';
    throw e;
  }

  return new Proxy(walletKit, {
    /**
     * Promisify any requested (non-subscription) walletKit RPC method
     * @param  {lnrpc.WalletKit} target
     * @param  {String}          key
     * @return {Any}
     */
    get(target, key) {
      const method = target[key];

      if (typeof method !== 'function' || subscriptionMethods.includes(key)) {
        return target[key]; // forward
      } else {
        return promisify(method);
      }
    },
  });
};
