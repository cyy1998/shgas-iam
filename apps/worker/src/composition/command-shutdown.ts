export async function closeWorkerCommandResources(
  resources: Array<Promise<unknown>>,
) {
  const results = await Promise.allSettled(resources);
  const failures = results.flatMap(result =>
    result.status === "rejected" ? [result.reason] : []);
  if (failures.length > 0)
    throw new AggregateError(failures, "Worker command resource shutdown failed");
}
