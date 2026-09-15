import { clientSnapshotKeys } from "./redis-store";

export { clientSnapshotKeys };

export function createClientSnapshotMaintenanceTestFixture(redis: {
  set: (key: string, value: string) => Promise<unknown>;
}, trackKey: (key: string) => void) {
  function trackClient(code: string) {
    const keys = clientSnapshotKeys(code);
    const owned = [keys.control, ...keys.payloads];
    owned.forEach(trackKey);
    return owned;
  }
  return {
    trackClient,
    async seedInvalidClientPayload(code: string) {
      trackClient(code);
      const key = clientSnapshotKeys(code).payloads[0]!;
      await redis.set(key, "sensitive-fixture");
      return key;
    },
  };
}
