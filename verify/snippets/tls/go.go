import (
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
caller := tlsInfo.State.PeerCertificates[0].Subject.CommonName // "checkout-service"
