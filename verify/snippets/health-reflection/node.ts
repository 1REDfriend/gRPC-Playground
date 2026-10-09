// npm install grpc-health-check @grpc/reflection
import { HealthImplementation } from 'grpc-health-check';
import { ReflectionService } from '@grpc/reflection';

const health = new HealthImplementation({ 'shop.v1.OrderService': 'SERVING' });
health.addToServer(server);

new ReflectionService(definition).addToServer(server); // same packageDefinition you loaded

// Later:
health.setStatus('shop.v1.OrderService', 'NOT_SERVING');
