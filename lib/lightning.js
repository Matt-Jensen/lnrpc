const {promisify} = require('util');

const DEFAULTS = {
  subscriptionMethods: [
    'subscribeInvoices',
    'subscribeTransactions',
    'subscribeChannelGraph',
    'sendPayment',
    'openChannel',
    'closeChannel',
  ],
};

/**
 * Factory for a Lightning GRPC service proxy
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
module.exports = function createLightningProxy(
  lnrpcDescriptor,
  server,
  credentials,
  config = {}
) {
  // Configuration options
  const {subscriptionMethods} = Object.assign({}, DEFAULTS, config);

  /**
   * GRPC Lightning Service
   * @type {lnrpc.Lightning}
   */
  let lightning;

  try {
    lightning = new lnrpcDescriptor.lnrpc.Lightning(server, credentials);
  } catch (e) {
    if (!e.code) e.code = 'GRPC_LIGHTNING_SERVICE_ERR';
    throw e;
  }

  return new Proxy(lightning, {
    /**
     * Promisify any requested (non-subscription) lightning RPC method
     * @param  {lnrpc.Lightning} target
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
