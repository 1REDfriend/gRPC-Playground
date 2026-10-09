import { readFileSync } from 'node:fs';

const ca = readFileSync('ca.crt');

// ---- Server (mTLS): third argument = require client certificate
const serverCreds = grpc.ServerCredentials.createSsl(
  ca,
  [{ private_key: readFileSync('orders.key'), cert_chain: readFileSync('orders.crt') }],
  true, // checkClientCertificate; false for plain TLS
);
server.bindAsync('0.0.0.0:443', serverCreds, () => {});

// ---- Client (mTLS)
const clientCreds = grpc.credentials.createSsl(
  ca,
  readFileSync('checkout.key'), // omit key + cert for plain TLS
  readFileSync('checkout.crt'),
);
const client = new shop.OrderService('orders.internal:443', clientCreds);

// Add a per-call token on top of TLS:
const withToken = grpc.credentials.combineChannelCredentials(
  clientCreds,
  grpc.credentials.createFromMetadataGenerator((_params, cb) => {
    const md = new grpc.Metadata();
    md.set('authorization', `Bearer ${getToken()}`);
    cb(null, md);
  }),
);
