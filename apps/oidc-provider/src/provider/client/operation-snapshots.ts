import type { ClientTrafficGateResult } from "@iam/api-core/client-traffic-gate";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { OidcClientRuntimeMetadata } from "./client-runtime-metadata.ts";
import { requireSubjectAccessOperation } from "@iam/api-core/subject-access";

/** Configuration and Gate are independent facts, retained only for this operation. */
export function createOidcOperationSnapshots(deps: {
  clients: { findRuntime: (clientCode: string) => Promise<OidcClientRuntimeMetadata | null> };
  traffic?: { check: (clientCode: string) => Promise<ClientTrafficGateResult> };
}) {
  function createScope(operation: SubjectAccessOperation) {
    function first<Result>(read: (clientCode: string) => Promise<Result>) {
      const results = new Map<string, Promise<Result>>();
      return async (clientCode: string): Promise<Result> => {
        requireSubjectAccessOperation(operation);
        let result = results.get(clientCode);
        if (!result) {
          result = Promise.resolve().then(() => {
            requireSubjectAccessOperation(operation);
            return read(clientCode);
          });
          results.set(clientCode, result);
        }
        try {
          return await result;
        }
        finally {
          requireSubjectAccessOperation(operation);
        }
      };
    }
    const findRuntime = first(clientCode => deps.clients.findRuntime(clientCode));
    return {
      clients: {
        findRuntime,
        async findActiveVersion(clientCode: string) {
          return (await findRuntime(clientCode))?.oidc_config_version ?? null;
        },
      },
      traffic: deps.traffic ? { check: first(clientCode => deps.traffic!.check(clientCode)) } : undefined,
    };
  }
  const scopes = new WeakMap<SubjectAccessOperation, ReturnType<typeof createScope>>();
  return {
    forOperation(value: SubjectAccessOperation) {
      const operation = requireSubjectAccessOperation(value);
      let scope = scopes.get(operation);
      if (!scope) {
        scope = createScope(operation);
        scopes.set(operation, scope);
      }
      return scope;
    },
  };
}
