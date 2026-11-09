export async function closeMaintenanceResources(resources: Array<Promise<unknown>>) {
  const results = await Promise.allSettled(resources);
  const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (failures.length > 0) throw new AggregateError(failures, "Maintenance resource shutdown failed");
}
