const {promisify} = require('util');

const DEFAULTS = {
  subscriptionMethods: [
    'subscribeSingleInvoice',
  ],
};

/**
 * Factory for a Invoices GRPC service proxy
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
module.exports = function createInvoicesProxy(
  lnrpcDescriptor,
  server,
  credentials,
  config = {}
) {
  // Configuration options
  const {subscriptionMethods} = Object.assign({}, DEFAULTS, config);

  /**
   * GRPC Invoices Service
   * @type {lnrpc.Invoices}
   */
  let invoices;

  try {
    invoices = new lnrpcDescriptor.invoicesrpc.Invoices(server, credentials);
  } catch (e) {
    if (!e.code) e.code = 'GRPC_INVOICES_SERVICE_ERR';
    throw e;
  }

  return new Proxy(invoices, {
    /**
     * Promisify any requested (non-subscription) invoices RPC method
     * @param  {lnrpc.Invoices} target
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
