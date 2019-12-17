const {promisify} = require('util');

const DEFAULTS = {
  subscriptionMethods: [
    'sendPayment',
    'trackPayment',
  ],
};

/**
 * Factory for a Router GRPC service proxy
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
module.exports = function createRouterProxy(
  lnrpcDescriptor,
  server,
  credentials,
  config = {}
) {
  // Configuration options
  const {subscriptionMethods} = Object.assign({}, DEFAULTS, config);

  /**
   * GRPC Router Service
   * @type {lnrpc.Router}
   */
  let router;

  try {
    router = new lnrpcDescriptor.routerrpc.Router(server, credentials);
  } catch (e) {
    if (!e.code) e.code = 'GRPC_ROUTER_SERVICE_ERR';
    throw e;
  }

  return new Proxy(router, {
    /**
     * Promisify any requested (non-subscription) router RPC method
     * @param  {lnrpc.Router} target
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
