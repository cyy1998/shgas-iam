import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { CreateOidcClaimsAdapterDeps } from "../../../src/provider/claims/claims.port.ts";
import { createSubjectAccessOperations } from "@iam/api-core/subject-access";
import { afterEach } from "vitest";
import { createOidcClaimsAdapter } from "../../../src/provider/claims.ts";

const activeOperations = new Set<SubjectAccessOperation>();
afterEach(() => {
  for (const operation of activeOperations) operation.close();
  activeOperations.clear();
});

/** Protocol-focused tests own an explicit operation; real HTTP tests exercise the request bridge. */
export function createClaimsFixture(deps: CreateOidcClaimsAdapterDeps) {
  const operations = createSubjectAccessOperations({
    barrier: { readCommittedTransitionId: async () => "20000000-0000-4000-8000-000000000001" },
    revocation: {
      revokePrincipalSession: async () => { throw new Error("Unexpected claims revocation"); },
      revokeUserSessions: async () => { throw new Error("Unexpected claims revocation"); },
    },
  });
  const operation = operations.createOperation();
  activeOperations.add(operation);
  let subjectIdentifier = "";
  const adapter = createOidcClaimsAdapter(deps, () => operation, async () => ({
    accountId: subjectIdentifier,
    authTime: 1,
    sessionId: "claims-fixture-principal",
  }));
  async function permit(subject: string) {
    subjectIdentifier = subject;
    await operation.acquireForAuthentication(subject);
  }
  return {
    async createAuthorizationCodeSnapshot(...args: Parameters<typeof adapter.createAuthorizationCodeSnapshot>) {
      await permit(args[0].subjectIdentifier);
      return await adapter.createAuthorizationCodeSnapshot(...args);
    },
    async createAccessTokenExtra(...args: Parameters<typeof adapter.createAccessTokenExtra>) {
      await permit(args[0].accountId);
      return await adapter.createAccessTokenExtra(...args);
    },
    async findAccount(...args: Parameters<typeof adapter.findAccount>) {
      await permit(args[0]);
      return await adapter.findAccount(...args);
    },
  };
}
