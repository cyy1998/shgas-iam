export async function closeProfileV2MaintenanceResources(
  resources: Array<Promise<unknown>>,
) {
  const results = await Promise.allSettled(resources);
  const failures = results.flatMap(result =>
    result.status === "rejected" ? [result.reason] : []);
  if (failures.length > 0)
    throw new AggregateError(failures, "Profile V2 maintenance resource shutdown failed");
}
