import type {
  CapturedSession,
  RevocationResult,
  SessionRecord,
  UnifiedSessionKernel,
} from "@iam/session-kernel";
import type { SubjectAccessOperation } from "../operation";
import { encodeSubjectAccessContext, parseSubjectAccessContext } from "../subject-context";

export interface UnifiedSessionRevocationSummary {
  userSessionsTerminated: number;
  clientSessionsTerminated: number;
  results: RevocationResult[];
  unfinished: CapturedSession[];
}

interface OperationScope {
  run: <T>(callback: (operation: SubjectAccessOperation) => Promise<T>) => Promise<T>;
}

/** Captures every page before executing; a retry never expands an existing batch. */
export function createUnifiedSubjectAccessSessionRevocation(
  kernel: UnifiedSessionKernel<SubjectAccessOperation>,
  operations: OperationScope,
) {
  async function capture(
    operation: SubjectAccessOperation,
    scope: { subjectIdentifier: string } | { userSessionId: string } | { clientId: string },
  ) {
    const records: SessionRecord[] = [];
    const targets: CapturedSession[] = [];
    let offset: number | null = 0;
    do {
      if (offset >= 10000)
        throw new Error("Session capture exceeds the request budget");
      const page = await kernel.forOperation(operation).captureSessions({ scope, offset, limit: 1000 });
      records.push(...page.records);
      targets.push(...page.targets);
      offset = page.nextOffset;
    } while (offset !== null);
    return { records, targets };
  }

  async function execute(
    operation: SubjectAccessOperation,
    targets: readonly CapturedSession[],
    excludeUserSessionId?: string,
  ) {
    const uniqueTargets = [
      ...new Map(
        targets.map(target => [`${target.kind}:${target.id}:${target.instance}`, target]),
      ).values(),
    ];
    if (uniqueTargets.length > 10000)
      throw new Error("Session capture exceeds the request budget");
    const summary: UnifiedSessionRevocationSummary = {
      userSessionsTerminated: 0,
      clientSessionsTerminated: 0,
      results: [],
      unfinished: [],
    };
    for (let offset = 0; offset < uniqueTargets.length; offset += 1000) {
      const result = await kernel.forOperation(operation).executeCapturedSessions({
        targets: uniqueTargets.slice(offset, offset + 1000),
        excludeUserSessionId,
      });
      summary.userSessionsTerminated += result.userSessionsTerminated;
      summary.clientSessionsTerminated += result.clientSessionsTerminated;
      summary.results.push(...result.results);
      summary.unfinished.push(...result.unfinished);
    }
    return summary;
  }

  async function revokeRoots(
    subjectIdentifier: string,
    contexts?: ReadonlySet<string>,
    excludeUserSessionId?: string,
  ) {
    return await operations.run(async (operation) => {
      const roots = await capture(operation, { subjectIdentifier });
      const selected = roots.records.filter(
        record => contexts === undefined || contexts.has(record.subjectContext),
      );
      const ids = new Set(
        selected.map(record => (record.kind === "userSession" ? record.userSessionId : "")),
      );
      const targets = roots.targets.filter(target => ids.has(target.id));
      for (const id of ids) {
        const children = await capture(operation, { userSessionId: id });
        targets.push(...children.targets);
        if (targets.length > 10000)
          throw new Error("Session capture exceeds the request budget");
      }
      return await execute(operation, targets, excludeUserSessionId);
    });
  }

  return {
    async executeCapturedSessions(targets: readonly CapturedSession[], excludeUserSessionId?: string) {
      return await operations.run(
        async operation => await execute(operation, targets, excludeUserSessionId),
      );
    },
    async revokeClientSessions(clientId: string) {
      return await operations.run(async (operation) => {
        const captured = await capture(operation, { clientId });
        return await execute(operation, captured.targets);
      });
    },
    async revokePrincipalSession(userSessionId: string, _reason: string) {
      return await operations.run(async (operation) => {
        const sessions = kernel.forOperation(operation);
        const observed = await sessions.observeUserSessionForRevocation(userSessionId);
        if (observed.status === "corrupt")
          throw new Error("Session state could not be confirmed");
        const children = await capture(operation, { userSessionId });
        return await execute(operation, [
          ...(observed.status === "resolved" ? [observed.value.target] : []),
          ...children.targets,
        ]);
      });
    },
    async revokeUserSessions(
      principal: { readonly subjectId: string },
      _reason: string,
      options: { onlySubjectAccessTransitionId?: string; exceptPrincipalSessionId?: string } = {},
    ) {
      const contexts
        = options.onlySubjectAccessTransitionId === undefined
          ? undefined
          : new Set([
              encodeSubjectAccessContext({
                version: 1,
                subjectIdentifier: principal.subjectId,
                transitionId: options.onlySubjectAccessTransitionId,
              }),
            ]);
      return await revokeRoots(principal.subjectId, contexts, options.exceptPrincipalSessionId);
    },
    async prepareUserSessionRevocation(principal: { readonly subjectId: string }) {
      const subjectIdentifier = principal.subjectId;
      const contexts = await operations.run(async (operation) => {
        const roots = await capture(operation, { subjectIdentifier });
        return new Set(
          roots.records.map((record) => {
            const context = parseSubjectAccessContext(record.subjectContext);
            if (context.subjectIdentifier !== subjectIdentifier)
              throw new Error("Session subject context does not match");
            return record.subjectContext;
          }),
        );
      });
      return {
        async revoke(_reason: string, options: { onlySubjectAccessTransitionId?: string } = {}) {
          const selected = new Set(contexts);
          if (options.onlySubjectAccessTransitionId !== undefined) {
            selected.add(
              encodeSubjectAccessContext({
                version: 1,
                subjectIdentifier,
                transitionId: options.onlySubjectAccessTransitionId,
              }),
            );
          }
          return await revokeRoots(subjectIdentifier, selected);
        },
      };
    },
  };
}
