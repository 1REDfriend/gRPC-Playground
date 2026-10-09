channel = grpc.secure_channel("dns:///orders.internal:50051", creds, options=[
    ("grpc.lb_policy_name", "round_robin"),
])
