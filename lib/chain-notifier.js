const {promisify} = require('util');

const DEFAULTS = {
  subscriptionMethods: [
    'registerConfirmationsNtfn',
    'registerSpendNtfn',
    'registerBlockEpochNtfn'
  ],
};

/**
 * Factory for a ChainNotifier GRPC service proxy
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
module.exports = function createChainNotifierProxy(
  lnrpcDescriptor,
  server,
  credentials,
  config = {}
) {
  // Configuration options
  const {subscriptionMethods} = Object.assign({}, DEFAULTS, config);

  /**
   * GRPC ChainNotifier Service
   * @type {lnrpc.ChainNotifier}
   */
  let chainNotifier;

  try {
    chainNotifier = new lnrpcDescriptor.chainrpc.ChainNotifier(server, credentials);
  } catch (e) {
    if (!e.code) e.code = 'GRPC_CHAIN_NOTIFIER_SERVICE_ERR';
    throw e;
  }

  return new Proxy(chainNotifier, {
    /**
     * Promisify any requested (non-subscription) chainNotifier RPC method
     * @param  {lnrpc.ChainNotifier} target
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
