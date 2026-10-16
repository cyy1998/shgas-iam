/** Only for disposable Full-system E2E data; never a deployment credential. */
export function createE2EGatewayApiKey(runId: string) {
  if (!/^[a-z0-9-]+$/u.test(runId))
    throw new Error("E2E run id must contain only lowercase letters, digits, and hyphens");
  return `iam-e2e-gateway-api-key-${runId.slice(-18)}`;
}
