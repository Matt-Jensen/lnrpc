const {promisify} = require('util');

const DEFAULTS = {
  subscriptionMethods: [

  ],
};

/**
 * Factory for a Watchtower GRPC service proxy
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
module.exports = function createWatchtowerProxy(
  lnrpcDescriptor,
  server,
  credentials,
  config = {}
) {
  // Configuration options
  const {subscriptionMethods} = Object.assign({}, DEFAULTS, config);

  /**
   * GRPC Watchtower Service
   * @type {lnrpc.Watchtower}
   */
  let watchtower;

  try {
    watchtower = new lnrpcDescriptor.watchtowerrpc.Watchtower(server, credentials);
  } catch (e) {
    if (!e.code) e.code = 'GRPC_WATCHTOWER_SERVICE_ERR';
    throw e;
  }

  return new Proxy(watchtower, {
    /**
     * Promisify any requested (non-subscription) watchtower RPC method
     * @param  {lnrpc.Watchtower} target
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
