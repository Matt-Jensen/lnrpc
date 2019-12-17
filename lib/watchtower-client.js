const {promisify} = require('util');

const DEFAULTS = {
  subscriptionMethods: [

  ],
};

/**
 * Factory for a WatchtowerClient GRPC service proxy
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
module.exports = function createWatchtowerClientProxy(
  lnrpcDescriptor,
  server,
  credentials,
  config = {}
) {
  // Configuration options
  const {subscriptionMethods} = Object.assign({}, DEFAULTS, config);

  /**
   * GRPC WatchtowerClient Service
   * @type {lnrpc.WatchtowerClient}
   */
  let watchtowerClient;

  try {
    watchtowerClient = new lnrpcDescriptor.wtclientrpc.WatchtowerClient(server, credentials);
  } catch (e) {
    if (!e.code) e.code = 'GRPC_WATCHTOWER_CLIENT_SERVICE_ERR';
    throw e;
  }

  return new Proxy(watchtowerClient, {
    /**
     * Promisify any requested (non-subscription) watchtowerClient RPC method
     * @param  {lnrpc.WatchtowerClient} target
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
