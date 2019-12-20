const {promisify} = require('util');

const DEFAULTS = {
  subscriptionMethods: [

  ],
};

/**
 * Factory for a Signer GRPC service proxy
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
module.exports = function createSignerProxy(
  lnrpcDescriptor,
  server,
  credentials,
  config = {}
) {
  // Configuration options
  const {subscriptionMethods} = Object.assign({}, DEFAULTS, config);

  /**
   * GRPC Signer Service
   * @type {lnrpc.Signer}
   */
  let signer;

  try {
    signer = new lnrpcDescriptor.signrpc.Signer(server, credentials);
  } catch (e) {
    if (!e.code) e.code = 'GRPC_SIGNER_SERVICE_ERR';
    throw e;
  }

  return new Proxy(signer, {
    /**
     * Promisify any requested (non-subscription) signer RPC method
     * @param  {lnrpc.Signer} target
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
