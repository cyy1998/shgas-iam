export interface ClientAuthFailureStore {
  readFailureCount: (clientId: string, ip: string) => Promise<number>;
  recordFailure: (clientId: string, ip: string) => Promise<number>;
  clear: (clientId: string, ip: string) => Promise<void>;
}

export function createClientAuthRateLimiter(failures: ClientAuthFailureStore, limit: number) {
  return {
    async isBlocked(clientId: string, ip: string) {
      return await failures.readFailureCount(clientId, ip) >= limit;
    },
    recordFailure(clientId: string, ip: string) {
      return failures.recordFailure(clientId, ip);
    },
    clear(clientId: string, ip: string) {
      return failures.clear(clientId, ip);
    },
  };
}

export type ClientAuthRateLimiter = ReturnType<typeof createClientAuthRateLimiter>;
