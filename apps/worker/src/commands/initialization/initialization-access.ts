interface InitializationAccessDependencies {
  verifyPostgres(): Promise<{ status: "passed" | "failed" }>;
  factsArePublished(): Promise<boolean>;
  seedAccess(): Promise<{ seeded: number; retainedExisting: number }>;
  verifyAccess(): Promise<{ status: "passed" | "failed" }>;
}

export async function completeInitializationAccess(deps: InitializationAccessDependencies) {
  if ((await deps.verifyPostgres()).status !== "passed") throw new Error("initialization-postgres-publication-pending");
  if (!(await deps.factsArePublished())) throw new Error("initialization-redis-facts-pending");
  const seeded = await deps.seedAccess();
  if ((await deps.verifyAccess()).status !== "passed") throw new Error("initialization-access-not-verified");
  return seeded;
}
