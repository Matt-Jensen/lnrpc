const {promisify} = require('util');

const DEFAULTS = {
  subscriptionMethods: [

  ],
};

/**
 * Factory for a Autopilot GRPC service proxy
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
module.exports = function createAutopilotProxy(
  lnrpcDescriptor,
  server,
  credentials,
  config = {}
) {
  // Configuration options
  const {subscriptionMethods} = Object.assign({}, DEFAULTS, config);

  /**
   * GRPC Autopilot Service
   * @type {lnrpc.Autopilot}
   */
  let autopilot;

  try {
    autopilot = new lnrpcDescriptor.autopilotrpc.Autopilot(server, credentials);
  } catch (e) {
    if (!e.code) e.code = 'GRPC_AUTOPILOT_SERVICE_ERR';
    throw e;
  }

  return new Proxy(autopilot, {
    /**
     * Promisify any requested (non-subscription) autopilot RPC method
     * @param  {lnrpc.Autopilot} target
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
