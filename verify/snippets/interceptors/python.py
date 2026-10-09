import grpc


class LoggingInterceptor(grpc.ServerInterceptor):
    # intercept_service runs before the handler is chosen; to time the handler itself,
    # wrap handler.unary_unary in your own function.
    def intercept_service(self, continuation, handler_call_details):
        print(f"-> {handler_call_details.method}")
        return continuation(handler_call_details)


def _deny(request, context):
    context.abort(grpc.StatusCode.UNAUTHENTICATED, "missing token")


class AuthInterceptor(grpc.ServerInterceptor):
    def intercept_service(self, continuation, handler_call_details):
        md = dict(handler_call_details.invocation_metadata)
        if not md.get("authorization", "").startswith("Bearer "):
            return grpc.unary_unary_rpc_method_handler(_deny)  # short-circuit
        return continuation(handler_call_details)


server = grpc.server(
    futures.ThreadPoolExecutor(max_workers=10),
    interceptors=[LoggingInterceptor(), AuthInterceptor()],  # outermost first
)
