const fs = require('fs');
const pkgDir = require('pkg-dir');
const {join} = require('path');
const {promisify} = require('util');
const protoLoader = require('@grpc/proto-loader');
const GRPC = require('grpc');
const createLightning = require('./lightning');
const createWalletUnlocker = require('./wallet-unlocker');
const createAutopilot = require('./autopilot');
const createSigner = require('./signer');
const createChainNotifier = require('./chain-notifier');
const createInvoices = require('./invoices');
const createRouter = require('./router');
const createWalletKit = require('./wallet-kit');
const createWatchtower = require('./watchtower');
const createWatchtowerClient = require('./watchtower-client');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);

const HOME_DIR = require('os').homedir();
const DEFAULTS = {
  grpc: GRPC,
  grpcLoader: protoLoader,
  server: 'localhost:10001',
  macaroonPath: '',
  certEncoding: 'utf8',
  services: ['lightning', 'walletUnlocker'],
  tls: /^darwin/.test(process.platform) // is macOS?
    ? `${HOME_DIR}/Library/Application Support/Lnd/tls.cert`
    : `${HOME_DIR}/.lnd/tls.cert`,
};

const SERVICES = {
  lightning: {dir: null, filename: 'rpc.proto', create: createLightning},
  walletUnlocker: {dir: null, filename: 'rpc.proto', create: createWalletUnlocker},
  autopilot: {dir: 'autopilotrpc', filename: 'autopilot.proto', create: createAutopilot},
  signer: {dir: 'signrpc', filename: 'signer.proto', create: createSigner},
  chainNotifier: {dir: 'chainrpc', filename: 'chainnotifier.proto', create: createChainNotifier},
  invoices: {dir: 'invoicesrpc', filename: 'invoices.proto', create: createInvoices},
  router: {dir: 'routerrpc', filename: 'router.proto', create: createRouter},
  walletKit: {dir: 'walletrpc', filename: 'walletkit.proto', create: createWalletKit},
  watchtower: {dir: 'watchtowerrpc', filename: 'watchtower.proto', create: createWatchtower},
  watchtowerClient: {dir: 'wtclientrpc', filename: 'wtclient.proto', create: createWatchtowerClient},
};

const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};

/**
 * Factory for a lnrpc instance & proxy responsible for:
 *  - Generating a GRPC Descriptor from user's config
 *  - Instantiating/exposing all GRPC Services
 *  - Resolving a proxy that:
 *    1)  Invokes all top-level method calls to the lightning
 *        proxy for user convience
 *    2)  Allow basic user property requests to all GRPC Services
 *
 * @param  {Object} config
 * @return {Promise} - Returns proxy to lnrpc instance
 */
module.exports = async function createLnprc(config = {}) {
  const rootPath = await pkgDir(__dirname);
  const lnrpcPath = 'node_modules/lnd/lnrpc';

  /*
   Configuration options
   */
  const {
    grpc,
    grpcLoader,
    server,
    tls: tlsPath,
    lightning,
    walletUnlocker,
    macaroonPath,
    autopilot,
    signer,
    chainNotifier,
    invoices,
    router,
    walletKit,
    watchtower,
    watchtowerClient
  } = Object.assign({}, DEFAULTS, config);

  // Generate grpc SSL credentials
  let credentials;

  try {
    // Use any SSL cert
    let cert = config.cert;

    // Fallback optional .tls file path
    if (!cert && tlsPath) {
      cert = await readFile(tlsPath);
    }

    // Convert `cert` string to Buffer
    if (cert && !Buffer.isBuffer(cert)) {
      cert = Buffer.from(cert, config.certEncoding);
    }

    /*
     Required for lnd SSL handshake: (SSL_ERROR_SSL: error:14094410)
     More about GRPC environment variables here:
     https://grpc.io/grpc/core/md_doc_environment_variables.html
    */
    if (!process.env.GRPC_SSL_CIPHER_SUITES) {
      process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';
    }

    // NOTE: cert may be undefined at this point
    // which is desirable for when certificate pinning
    // is not necessary (i.e. BTCPayServer connection)
    credentials = grpc.credentials.createSsl(cert);
  } catch (e) {
    if (!e.code) e.code = 'INVALID_SSL_CERT';
    throw e;
  }

  /*
   Combine SSL and Macaroon credentials
   */
  if (config.macaroon || macaroonPath) {
    const metadata = new grpc.Metadata();
    const macaroon = config.macaroon || (await readFile(macaroonPath));

    // Add hex encoded macaroon
    // to gRPC metadata
    metadata.add(
      'macaroon',
      Buffer.isBuffer(macaroon) ? macaroon.toString('hex') : macaroon
    );

    // Create macaroon credentials
    const macaroonCredentials = grpc.credentials.createFromMetadataGenerator(
      (_, callback) => {
        callback(null, metadata);
      }
    );

    // Update existing cert credentials by combining macaroon auth
    // credentials such that every call is properly encrypted and
    // authenticated
    credentials = grpc.credentials.combineChannelCredentials(
      credentials,
      macaroonCredentials
    );
  }

  const lnrpcSkeleton = {};

  await asyncForEach(config.services, async (serviceName) => {
    const service = SERVICES[serviceName];
    let protoDir = lnrpcPath;
    if (service.dir) {
      protoDir += `/${service.dir}`;
    }
    const protoSrc = join(rootPath, `${protoDir}/${service.filename}`);
    const protoDest = join(rootPath, service.filename);

    try {
      await stat(protoDest);
    } catch (e) {
      let grpcSrc = await readFile(protoSrc, 'utf8');

      grpcSrc = grpcSrc.replace('import "google/api/annotations.proto";', '');
      await writeFile(protoDest, grpcSrc);
    }

    let grpcPkgObj;

    try {
      const packageDefinition = await grpcLoader.load(protoDest, {
        keepCase: true, // prevent conversion to camel case
      });
      grpcPkgObj = grpc.loadPackageDefinition(packageDefinition);
    } catch (e) {
      if (!e.code) e.code = 'GRPC_LOAD_ERR';
      throw e;
    }

    lnrpcSkeleton[serviceName] = {
      value: this[serviceName] || service.create(grpcPkgObj, server, credentials, config),
    };

    if (serviceName === 'lightning') {
      lnrpcSkeleton.description = {value: grpcPkgObj};
    }
  });

  /**
   * Lnrpc instance
   * @type {lnrpc}
   */
  const lnrpc = Object.create(null, lnrpcSkeleton);

  return new Proxy(lnrpc, {
    /**
     * Provide lop-level access to any lightning/walletUnlocker
     * methods, otherwise provide user with fallback value
     * @param  {lnrpc.Lightning} target
     * @param  {String}          key
     * @return {Any}
     */
    get(target, key) {
      if (typeof target.lightning[key] === 'function') {
        return target.lightning[key].bind(target.lightning);
      } else if (typeof target.walletUnlocker[key] === 'function') {
        return target.walletUnlocker[key].bind(target.walletUnlocker);
      } else {
        return target[key]; // forward
      }
    },
  });
};
