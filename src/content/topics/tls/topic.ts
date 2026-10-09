import type { SimEvent, TopicModule } from '../../../lib/types';
import { CLIENT, l, requestHeaders } from '../../shared';

const topic: TopicModule = {
  slug: 'tls',
  sim: {
    controls: [
      {
        kind: 'select',
        id: 'mode',
        label: l('รูปแบบ', 'Mode'),
        default: 'mtls',
        options: [
          { value: 'tls', label: l('TLS (ตรวจ server อย่างเดียว)', 'TLS (server verified)') },
          { value: 'mtls', label: l('mTLS (ตรวจทั้งสองฝั่ง)', 'mTLS (both verified)') },
        ],
      },
    ],
    build: (p) => {
      const mtls = p.mode === 'mtls';
      const events: SimEvent[] = [
        { at: 0, from: 'client', to: 'client', kind: 'note', label: 'TCP connect orders.internal:443' },
        {
          at: 300,
          from: 'client',
          to: 'server',
          kind: 'tls',
          label: 'ClientHello (ALPN: h2)',
          detail: 'TLS 1.3 ClientHello\n  supported_versions: TLS 1.3\n  key_share: x25519\n  server_name: orders.internal\n  alpn: ["h2"]',
          note: l('client บอกว่าจะคุย HTTP/2 ผ่าน ALPN ซึ่ง gRPC บังคับใช้', 'The client asks for HTTP/2 via ALPN, which gRPC requires.'),
        },
        {
          at: 1050,
          from: 'server',
          to: 'client',
          kind: 'tls',
          label: mtls ? 'ServerHello, Certificate, CertificateRequest, Finished' : 'ServerHello, Certificate, Finished',
          detail:
            'ServerHello (alpn: h2)\n{EncryptedExtensions}\n' +
            (mtls ? '{CertificateRequest}   ← "show me yours too"\n' : '') +
            '{Certificate: CN=orders.internal, issuer=Shop Internal CA}\n{CertificateVerify}\n{Finished}',
          note: mtls
            ? l('server ส่งใบรับรองของตัวเอง และขอใบรับรองจาก client ด้วย', 'The server sends its certificate and asks the client for one too.')
            : l('server ส่งใบรับรองมาให้ client ตรวจ', 'The server sends its certificate for the client to check.'),
        },
        {
          at: 1750,
          from: 'client',
          to: 'client',
          kind: 'note',
          label: 'verify server cert against CA ✓',
          note: l('client เช็กว่าใบรับรองออกโดย CA ที่เชื่อถือ และชื่อตรงกับ orders.internal', 'The client checks the CA signature and that the name matches orders.internal.'),
        },
      ];
      if (mtls) {
        events.push(
          {
            at: 2050,
            from: 'client',
            to: 'server',
            kind: 'tls',
            label: 'Certificate, CertificateVerify, Finished',
            detail: '{Certificate: CN=checkout-service, issuer=Shop Internal CA}\n{CertificateVerify}\n{Finished}',
            note: l('client ส่งใบรับรองของตัวเองกลับไป', 'The client sends its own certificate.'),
          },
          {
            at: 2800,
            from: 'server',
            to: 'server',
            kind: 'note',
            label: 'peer = checkout-service ✓',
            note: l('server รู้แน่ชัดว่าใครเป็นคนเรียก ใช้ตัดสินสิทธิ์ต่อได้', 'The server now knows exactly who is calling and can authorize on it.'),
          },
        );
      } else {
        events.push({ at: 2050, from: 'client', to: 'server', kind: 'tls', label: 'Finished', detail: '{Finished}' });
      }
      const start = mtls ? 3200 : 2800;
      events.push(
        {
          at: start,
          from: 'client',
          to: 'server',
          kind: 'headers',
          label: '(TLS) HEADERS GetOrder (encrypted)',
          detail: '(TLS application data — contents below are only visible to the endpoints)\n\n' + requestHeaders('GetOrder').replace(':scheme = http', ':scheme = https'),
          note: l('นับจากนี้ทุก frame ถูกเข้ารหัส', 'From here on every frame is encrypted.'),
        },
        { at: start + 900, from: 'server', to: 'client', kind: 'trailers', label: '(TLS) Order + grpc-status 0', detail: '(encrypted)\ngrpc-status = 0' },
      );
      return {
        actors: [
          { id: 'client', label: mtls ? l('checkout-service', 'checkout-service') : CLIENT.label },
          { id: 'server', label: l('orders.internal', 'orders.internal') },
        ],
        events,
        outcome: mtls
          ? { ok: true, text: l('ทั้งสองฝั่งพิสูจน์ตัวตนกันแล้ว', 'Both sides proved who they are.') }
          : { ok: true, text: l('เข้ารหัสแล้ว client รู้ว่าคุยกับ server ตัวจริง', 'Encrypted, and the client knows it reached the real server.') },
      };
    },
  },
  code: [
    {
      id: 'go',
      lang: 'go',
      code: `import (
	"crypto/tls"
	"crypto/x509"
	"os"

	"google.golang.org/grpc/credentials"
)

func loadPool(path string) *x509.CertPool {
	pem, _ := os.ReadFile(path)
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(pem)
	return pool
}

// ---- Server (mTLS)
cert, _ := tls.LoadX509KeyPair("orders.crt", "orders.key")
serverCreds := credentials.NewTLS(&tls.Config{
	Certificates: []tls.Certificate{cert},
	ClientCAs:    loadPool("ca.crt"),
	ClientAuth:   tls.RequireAndVerifyClientCert, // drop this line for plain TLS
	MinVersion:   tls.VersionTLS13,
})
s := grpc.NewServer(grpc.Creds(serverCreds))

// ---- Client (mTLS)
clientCert, _ := tls.LoadX509KeyPair("checkout.crt", "checkout.key")
clientCreds := credentials.NewTLS(&tls.Config{
	Certificates: []tls.Certificate{clientCert}, // omit for plain TLS
	RootCAs:      loadPool("ca.crt"),
	ServerName:   "orders.internal",
})
conn, err := grpc.NewClient("orders.internal:443", grpc.WithTransportCredentials(clientCreds))

// ---- Server: who called?
p, _ := peer.FromContext(ctx)
tlsInfo := p.AuthInfo.(credentials.TLSInfo)
caller := tlsInfo.State.PeerCertificates[0].Subject.CommonName // "checkout-service"`,
    },
    {
      id: 'node',
      lang: 'typescript',
      code: `import { readFileSync } from 'node:fs';

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
    md.set('authorization', \`Bearer \${getToken()}\`);
    cb(null, md);
  }),
);`,
    },
    {
      id: 'python',
      lang: 'python',
      code: `def read(path):
    with open(path, "rb") as f:
        return f.read()

# ---- Server (mTLS)
server_creds = grpc.ssl_server_credentials(
    [(read("orders.key"), read("orders.crt"))],
    root_certificates=read("ca.crt"),
    require_client_auth=True,          # False for plain TLS
)
server.add_secure_port("[::]:443", server_creds)

# ---- Client (mTLS)
channel_creds = grpc.ssl_channel_credentials(
    root_certificates=read("ca.crt"),
    private_key=read("checkout.key"),        # omit both for plain TLS
    certificate_chain=read("checkout.crt"),
)
channel = grpc.secure_channel("orders.internal:443", channel_creds)

# ---- Server: who called?
def GetOrder(self, request, context):
    caller = context.auth_context().get("x509_common_name")  # [b"checkout-service"]`,
    },
    {
      id: 'csharp',
      lang: 'csharp',
      code: `// ---- Server (mTLS): Program.cs
using Microsoft.AspNetCore.Server.Kestrel.Https;

builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.ConfigureHttpsDefaults(https =>
    {
        https.ServerCertificate = X509Certificate2.CreateFromPemFile("orders.crt", "orders.key");
        https.ClientCertificateMode = ClientCertificateMode.RequireCertificate; // remove for plain TLS
    });
});

// ---- Server: who called?
var caller = context.GetHttpContext().Connection.ClientCertificate?.GetNameInfo(X509NameType.SimpleName, false);

// ---- Client (mTLS)
var handler = new SocketsHttpHandler();
handler.SslOptions.ClientCertificates = new X509CertificateCollection
{
    X509Certificate2.CreateFromPemFile("checkout.crt", "checkout.key"), // omit for plain TLS
};
var channel = GrpcChannel.ForAddress("https://orders.internal", new GrpcChannelOptions
{
    HttpHandler = handler,
});`,
    },
  ],
};

export default topic;
