def read(path):
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
    caller = context.auth_context().get("x509_common_name")  # [b"checkout-service"]
