# Load balancing
> Long-lived connections break traditional load balancing. You have to decide where balancing happens.

The first surprise for many teams moving gRPC onto Kubernetes: they scale to three replicas and one does all the work while two sit idle.

The cause is the multiplexing we praised a chapter ago. The client opens one connection and sends every call down it. A TCP-level (L4) load balancer, like a plain Kubernetes Service, picks a backend only when the connection opens. After that every call goes to the same place.

There are two fixes:

- **Client-side balancing.** The client resolves the name to every IP, connects to each one and spreads calls itself with `round_robin`. Nothing sits in the middle, so it's fast.
- **An HTTP/2-aware (L7) proxy** such as Envoy, Linkerd, Istio or NGINX set up as a gRPC proxy. It balances per call instead of per connection.

Switch between `pick_first`, the default, and `round_robin`, and watch where the six calls land.

===notes===

## Worth remembering

- Prefix the target with `dns:///` so the client resolves every IP. Without it, some languages use only the first address.
- On Kubernetes, use a headless Service (`clusterIP: None`) so DNS returns every pod IP.
- DNS answers don't update on their own. When pods come and go, the client re-resolves only after a connection drops. Setting `MaxConnectionAge` on the server (or the equivalent in other languages) makes clients reconnect now and then and discover new pods.
- Larger systems with dozens of services usually move to a service mesh or xDS (Envoy's control plane), so policy is set in one place instead of in every client.
