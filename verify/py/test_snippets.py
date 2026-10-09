"""Runs the Python snippets from the site against real in-process servers.

Each test copies the snippet code as closely as possible. Only glue is added:
stub data sources (tracker, bot, repo, cart), ports, and assertions.
"""
import asyncio
import json
import os
import re
import sys
import threading
import time
import traceback
from collections import namedtuple
from concurrent import futures

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "gen"))
CERTS = os.path.join(HERE, "..", "certs")

import grpc  # noqa: E402
from shop.v1 import shop_pb2, shop_pb2_grpc  # noqa: E402

results = []


def check(name):
    def wrap(fn):
        try:
            fn()
            results.append((name, "PASS", ""))
        except Exception as e:  # noqa: BLE001
            results.append((name, "FAIL", f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=3)}"))
        return fn
    return wrap


def start(servicer, interceptors=None, options=None, creds=None):
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10), interceptors=interceptors, options=options)
    shop_pb2_grpc.add_OrderServiceServicer_to_server(servicer, server)
    port = server.add_secure_port("127.0.0.1:0", creds) if creds else server.add_insecure_port("127.0.0.1:0")
    server.start()
    return server, port


def stub_for(port):
    channel = grpc.insecure_channel(f"127.0.0.1:{port}")
    return channel, shop_pb2_grpc.OrderServiceStub(channel)


# ---------------------------------------------------------------- protobuf
@check("protobuf: serialize/parse")
def _():
    item = shop_pb2.Item(sku="SKU-1007", quantity=150)
    data = item.SerializeToString()
    assert data.hex() == "0a08534b552d31303037109601", data.hex()
    assert len(data) == 13
    decoded = shop_pb2.Item.FromString(data)
    assert (decoded.sku, decoded.quantity, decoded.price_cents) == ("SKU-1007", 150, 0)


# ---------------------------------------------------------------- unary
class UnaryService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        if not request.order_id:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "order_id is required")
        return shop_pb2.Order(
            id=request.order_id,
            customer_id="C-42",
            total_cents=5970,
            status=shop_pb2.ORDER_STATUS_PAID,
        )


@check("unary: GetOrder + INVALID_ARGUMENT")
def _():
    server, port = start(UnaryService())
    with grpc.insecure_channel(f"localhost:{port}") as channel:
        stub = shop_pb2_grpc.OrderServiceStub(channel)
        order = stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-1001"), timeout=2.0)
        assert f"order {order.id} is {shop_pb2.OrderStatus.Name(order.status)}" == "order A-1001 is ORDER_STATUS_PAID"
        try:
            stub.GetOrder(shop_pb2.GetOrderRequest(order_id=""), timeout=2.0)
            raise AssertionError("expected error")
        except grpc.RpcError as e:
            assert e.code() == grpc.StatusCode.INVALID_ARGUMENT
    server.stop(0)


# ---------------------------------------------------------------- server streaming
Ev = namedtuple("Ev", "status note")


class Tracker:
    def follow(self, order_id):
        for st, note in [(1, "payment received"), (2, "packing"), (3, "with courier"), (4, "signed")]:
            yield Ev(st, note)


tracker = Tracker()


class StreamService(shop_pb2_grpc.OrderServiceServicer):
    def WatchOrder(self, request, context):
        for ev in tracker.follow(request.order_id):
            if not context.is_active():   # client cancelled
                return
            yield shop_pb2.OrderEvent(status=ev.status, note=ev.note)

    def UploadItems(self, request_iterator, context):
        count, total = 0, 0
        for item in request_iterator:
            count += 1
            total += item.quantity * item.price_cents
        return shop_pb2.UploadSummary(item_count=count, total_cents=total)

    def SupportChat(self, request_iterator, context):
        yield shop_pb2.ChatMessage(**{"from": "bot", "text": "Hi! How can I help?"})
        for msg in request_iterator:
            for reply in bot.answer(msg.text):
                yield shop_pb2.ChatMessage(**{"from": "bot", "text": reply})
        yield shop_pb2.ChatMessage(**{"from": "bot", "text": "Have a nice day!"})


class Bot:
    def answer(self, text):
        return ["Checking...", "Out for delivery"] if "order" in text else ["You're welcome"]


bot = Bot()


@check("server streaming: WatchOrder")
def _():
    server, port = start(StreamService())
    channel, stub = stub_for(port)
    got = []
    for ev in stub.WatchOrder(shop_pb2.WatchOrderRequest(order_id="A-1001")):
        got.append(shop_pb2.OrderStatus.Name(ev.status))
    assert got == ["ORDER_STATUS_PENDING", "ORDER_STATUS_PAID", "ORDER_STATUS_SHIPPED", "ORDER_STATUS_DELIVERED"], got
    channel.close()
    server.stop(0)


@check("client streaming: UploadItems")
def _():
    server, port = start(StreamService())
    channel, stub = stub_for(port)
    cart = [("SKU-1", 2, 100), ("SKU-2", 1, 250)]

    def items():
        for sku, qty, price in cart:
            yield shop_pb2.Item(sku=sku, quantity=qty, price_cents=price)

    summary = stub.UploadItems(items())
    assert (summary.item_count, summary.total_cents) == (2, 450)
    channel.close()
    server.stop(0)


@check("bidi: SupportChat")
def _():
    server, port = start(StreamService())
    channel, stub = stub_for(port)

    def outgoing():
        for line in ["Where is order A-1001?", "Thanks!"]:
            yield shop_pb2.ChatMessage(**{"from": "C-42", "text": line})

    got = [(getattr(r, "from"), r.text) for r in stub.SupportChat(outgoing())]
    assert got[0] == ("bot", "Hi! How can I help?") and got[-1] == ("bot", "Have a nice day!"), got
    assert len(got) == 5, got
    channel.close()
    server.stop(0)


# ---------------------------------------------------------------- metadata
HOSTNAME = "pod-2"


class Repo:
    def find(self, order_id, auth=None):
        if order_id == "A-9999":
            return None
        return shop_pb2.Order(id=order_id, status=shop_pb2.ORDER_STATUS_PAID)

    def scan(self, order_id):
        for _ in range(30):
            time.sleep(0.1)
            yield b"chunk"


repo = Repo()


class MetadataService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        md = dict(context.invocation_metadata())
        auth = md.get("authorization")
        assert auth == "Bearer t0k"

        context.send_initial_metadata((("x-served-by", HOSTNAME),))
        order = repo.find(request.order_id, auth)
        context.set_trailing_metadata((("x-db-time-ms", "12"),))
        return order


@check("metadata: headers + trailers")
def _():
    server, port = start(MetadataService())
    channel, stub = stub_for(port)
    token, req_id = "t0k", "7f3c9a"
    order, call = stub.GetOrder.with_call(
        shop_pb2.GetOrderRequest(order_id="A-1001"),
        metadata=(("authorization", f"Bearer {token}"), ("x-request-id", req_id)),
    )
    assert dict(call.initial_metadata()).get("x-served-by") == "pod-2"
    assert dict(call.trailing_metadata()).get("x-db-time-ms") == "12"
    channel.close()
    server.stop(0)


# ---------------------------------------------------------------- deadlines
cleanup_called = threading.Event()


class SlowService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        print("  time left:", context.time_remaining())
        context.add_callback(lambda: cleanup_called.set())
        for chunk in repo.scan(request.order_id):
            if not context.is_active():
                return shop_pb2.Order()  # nobody is listening any more
        return shop_pb2.Order(id=request.order_id)


@check("deadlines: DEADLINE_EXCEEDED + cancel")
def _():
    server, port = start(SlowService())
    channel, stub = stub_for(port)
    used_cache = False

    def cached_order():
        nonlocal used_cache
        used_cache = True
        return shop_pb2.Order(id="cached")

    try:
        order = stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-1001"), timeout=1.5)
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            order = cached_order()
        else:
            raise
    assert used_cache and order.id == "cached"

    future = stub.GetOrder.future(shop_pb2.GetOrderRequest(order_id="A-1001"))
    time.sleep(0.2)
    assert future.cancel()
    assert future.cancelled()
    assert cleanup_called.wait(3), "server callback did not fire"
    channel.close()
    server.stop(0)


# ---------------------------------------------------------------- errors
from google.protobuf import any_pb2  # noqa: E402
from google.rpc import code_pb2, error_details_pb2, status_pb2  # noqa: E402
from grpc_status import rpc_status  # noqa: E402

VALID_ID = re.compile(r"^A-\d+$")


class ErrorService(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        if not VALID_ID.match(request.order_id):
            detail = any_pb2.Any()
            detail.Pack(error_details_pb2.BadRequest(field_violations=[
                error_details_pb2.BadRequest.FieldViolation(
                    field="order_id", description="must match A-\\d+"),
            ]))
            context.abort_with_status(rpc_status.to_status(status_pb2.Status(
                code=code_pb2.INVALID_ARGUMENT, message="invalid order_id", details=[detail])))

        order = repo.find(request.order_id)
        if order is None:
            context.abort(grpc.StatusCode.NOT_FOUND, f"order {request.order_id} not found")
        return order


@check("errors: NOT_FOUND + rich details")
def _():
    server, port = start(ErrorService())
    channel, stub = stub_for(port)
    not_found = False
    try:
        stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-9999"), timeout=2)
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.NOT_FOUND:
            not_found = True
    assert not_found
    try:
        stub.GetOrder(shop_pb2.GetOrderRequest(order_id="oops"), timeout=2)
        raise AssertionError("expected error")
    except grpc.RpcError as e:
        status = rpc_status.from_call(e)
        assert e.code() == grpc.StatusCode.INVALID_ARGUMENT
        br = error_details_pb2.BadRequest()
        status.details[0].Unpack(br)
        assert br.field_violations[0].field == "order_id"
    channel.close()
    server.stop(0)


# ---------------------------------------------------------------- interceptors
class LoggingInterceptor(grpc.ServerInterceptor):
    def intercept_service(self, continuation, handler_call_details):
        print(f"  -> {handler_call_details.method}")
        return continuation(handler_call_details)


def _deny(request, context):
    context.abort(grpc.StatusCode.UNAUTHENTICATED, "missing token")


class AuthInterceptor(grpc.ServerInterceptor):
    def intercept_service(self, continuation, handler_call_details):
        md = dict(handler_call_details.invocation_metadata)
        if not md.get("authorization", "").startswith("Bearer "):
            return grpc.unary_unary_rpc_method_handler(_deny)  # short-circuit
        return continuation(handler_call_details)


@check("interceptors: auth short-circuit")
def _():
    server, port = start(UnaryService(), interceptors=[LoggingInterceptor(), AuthInterceptor()])
    channel, stub = stub_for(port)
    try:
        stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-1001"))
        raise AssertionError("expected UNAUTHENTICATED")
    except grpc.RpcError as e:
        assert e.code() == grpc.StatusCode.UNAUTHENTICATED, e.code()
    order = stub.GetOrder(shop_pb2.GetOrderRequest(order_id="A-1001"), metadata=(("authorization", "Bearer x"),))
    assert order.id == "A-1001"
    channel.close()
    server.stop(0)


# ---------------------------------------------------------------- retries + keepalive
class FlakyService(shop_pb2_grpc.OrderServiceServicer):
    def __init__(self, failures):
        self.failures = failures
        self.calls = 0

    def GetOrder(self, request, context):
        self.calls += 1
        if self.calls <= self.failures:
            context.abort(grpc.StatusCode.UNAVAILABLE, "connection to database lost")
        return shop_pb2.Order(id=request.order_id)


@check("retries: service config retries UNAVAILABLE")
def _():
    service_config = {
        "methodConfig": [{
            "name": [{"service": "shop.v1.OrderService", "method": "GetOrder"}],
            "retryPolicy": {
                "maxAttempts": 4,
                "initialBackoff": "0.5s",
                "maxBackoff": "5s",
                "backoffMultiplier": 2,
                "retryableStatusCodes": ["UNAVAILABLE"],
            },
        }]
    }
    flaky = FlakyService(failures=2)
    executor = futures.ThreadPoolExecutor(max_workers=10)
    server = grpc.server(executor, options=[
        ("grpc.keepalive_permit_without_calls", 1),
        ("grpc.http2.min_ping_interval_without_data_ms", 20_000),
    ])
    shop_pb2_grpc.add_OrderServiceServicer_to_server(flaky, server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    channel = grpc.insecure_channel(f"127.0.0.1:{port}", options=[
        ("grpc.service_config", json.dumps(service_config)),
        ("grpc.enable_retries", 1),
        ("grpc.keepalive_time_ms", 30_000),
        ("grpc.keepalive_timeout_ms", 10_000),
        ("grpc.keepalive_permit_without_calls", 1),
    ])
    order = shop_pb2_grpc.OrderServiceStub(channel).GetOrder(shop_pb2.GetOrderRequest(order_id="A-1"), timeout=10)
    assert order.id == "A-1" and flaky.calls == 3, flaky.calls
    channel.close()
    server.stop(0)


# ---------------------------------------------------------------- health + reflection
@check("health + reflection")
def _():
    from grpc_health.v1 import health, health_pb2, health_pb2_grpc
    from grpc_reflection.v1alpha import reflection, reflection_pb2, reflection_pb2_grpc

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    shop_pb2_grpc.add_OrderServiceServicer_to_server(UnaryService(), server)
    health_servicer = health.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    health_servicer.set("shop.v1.OrderService", health_pb2.HealthCheckResponse.SERVING)
    SERVICE_NAMES = (
        shop_pb2.DESCRIPTOR.services_by_name["OrderService"].full_name,
        reflection.SERVICE_NAME,
    )
    reflection.enable_server_reflection(SERVICE_NAMES, server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()

    channel = grpc.insecure_channel(f"127.0.0.1:{port}")
    h = health_pb2_grpc.HealthStub(channel)
    assert h.Check(health_pb2.HealthCheckRequest(service="shop.v1.OrderService")).status == health_pb2.HealthCheckResponse.SERVING
    health_servicer.set("shop.v1.OrderService", health_pb2.HealthCheckResponse.NOT_SERVING)
    assert h.Check(health_pb2.HealthCheckRequest(service="shop.v1.OrderService")).status == health_pb2.HealthCheckResponse.NOT_SERVING

    r = reflection_pb2_grpc.ServerReflectionStub(channel)
    resp = next(r.ServerReflectionInfo(iter([reflection_pb2.ServerReflectionRequest(list_services="")])))
    names = [s.name for s in resp.list_services_response.service]
    assert "shop.v1.OrderService" in names, names
    channel.close()
    server.stop(0)


# ---------------------------------------------------------------- multiplexing (asyncio)
@check("multiplexing: grpc.aio gather")
def _():
    server, port = start(UnaryService())

    async def main():
        async with grpc.aio.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = shop_pb2_grpc.OrderServiceStub(channel)
            orders = await asyncio.gather(*[
                stub.GetOrder(shop_pb2.GetOrderRequest(order_id=oid))
                for oid in ("A-1001", "A-1002", "A-1003")
            ])
            return [o.status for o in orders]

    assert asyncio.run(main()) == [2, 2, 2]
    server.stop(0)


# ---------------------------------------------------------------- load balancing
@check("load balancing: dns:/// + round_robin")
def _():
    server, port = start(UnaryService())
    channel = grpc.insecure_channel(f"dns:///localhost:{port}", options=[
        ("grpc.lb_policy_name", "round_robin"),
    ])
    order = shop_pb2_grpc.OrderServiceStub(channel).GetOrder(shop_pb2.GetOrderRequest(order_id="A-1"), timeout=5)
    assert order.id == "A-1"
    channel.close()
    server.stop(0)


# ---------------------------------------------------------------- TLS / mTLS
def read(path):
    with open(os.path.join(CERTS, path), "rb") as f:
        return f.read()


seen_caller = []


class TlsService(UnaryService):
    def GetOrder(self, request, context):
        caller = context.auth_context().get("x509_common_name")  # [b"checkout-service"]
        seen_caller.append(caller)
        return super().GetOrder(request, context)


@check("tls: mTLS + caller identity")
def _():
    server_creds = grpc.ssl_server_credentials(
        [(read("orders.key"), read("orders.crt"))],
        root_certificates=read("ca.crt"),
        require_client_auth=True,
    )
    server, port = start(TlsService(), creds=server_creds)
    channel_creds = grpc.ssl_channel_credentials(
        root_certificates=read("ca.crt"),
        private_key=read("checkout.key"),
        certificate_chain=read("checkout.crt"),
    )
    channel = grpc.secure_channel(f"localhost:{port}", channel_creds,
                                  options=[("grpc.ssl_target_name_override", "orders.internal")])
    order = shop_pb2_grpc.OrderServiceStub(channel).GetOrder(shop_pb2.GetOrderRequest(order_id="A-1"), timeout=5)
    assert order.id == "A-1"
    assert seen_caller == [[b"checkout-service"]], seen_caller
    channel.close()

    # Without a client certificate the handshake must fail
    bad = grpc.secure_channel(f"localhost:{port}", grpc.ssl_channel_credentials(root_certificates=read("ca.crt")))
    try:
        shop_pb2_grpc.OrderServiceStub(bad).GetOrder(shop_pb2.GetOrderRequest(order_id="A-1"), timeout=3)
        raise AssertionError("expected handshake failure")
    except grpc.RpcError as e:
        assert e.code() == grpc.StatusCode.UNAVAILABLE, e.code()
    server.stop(0)


print()
for name, status, detail in results:
    print(f"[{status}] {name}")
    if detail:
        print("       " + detail.replace("\n", "\n       "))
failed = sum(1 for _, s, _ in results if s == "FAIL")
print(f"\n{len(results) - failed}/{len(results)} passed")
sys.exit(1 if failed else 0)
