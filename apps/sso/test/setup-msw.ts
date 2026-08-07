import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

export function registerMswLifecycle() {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });
}
