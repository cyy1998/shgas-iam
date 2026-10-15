import { clientSnapshotKeys } from "./redis-store";

export { clientSnapshotKeys };

export function createClientSnapshotMaintenanceTestFixture(redis: {
  set: (key: string, value: string) => Promise<unknown>;
}) {
  function trackClient(code: string) {
    const keys = clientSnapshotKeys(code);
    return [keys.control, ...keys.payloads];
  }
  return {
    trackClient,
    async seedInvalidClientPayload(code: string) {
      const key = clientSnapshotKeys(code).payloads[0]!;
      await redis.set(key, "sensitive-fixture");
      return key;
    },
  };
}
