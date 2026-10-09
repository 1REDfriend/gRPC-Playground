# Server: consume request_iterator, yield replies whenever you like
class OrderService(shop_pb2_grpc.OrderServiceServicer):
    def SupportChat(self, request_iterator, context):
        yield shop_pb2.ChatMessage(**{"from": "bot", "text": "Hi! How can I help?"})
        for msg in request_iterator:
            for reply in bot.answer(msg.text):
                yield shop_pb2.ChatMessage(**{"from": "bot", "text": reply})
        yield shop_pb2.ChatMessage(**{"from": "bot", "text": "Have a nice day!"})

# "from" is a Python keyword, so pass it via ** or use getattr(msg, "from")


# Client: send from a generator, read from the returned iterator
def outgoing():
    for line in ["Where is order A-1001?", "Thanks!"]:
        yield shop_pb2.ChatMessage(**{"from": "C-42", "text": line})

for reply in stub.SupportChat(outgoing()):
    print(getattr(reply, "from"), reply.text)
