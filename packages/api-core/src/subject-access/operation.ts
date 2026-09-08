import type { RevokeSummary } from "@iam/session-kernel";
import type {
  SubjectAccessOperationBarrierPort,
  SubjectAccessOperationRevocationPort,
} from "./operation.port";
import type { SubjectAccessContext } from "./subject-context";
import { z } from "zod";
import { SubjectAccessDisabledError, SubjectAccessUnavailableError } from "./errors";
import { encodeSubjectAccessContext, parseSubjectAccessContext } from "./subject-context";

const permissionBrand = Symbol("SubjectAccessPermission");
const operations = new WeakMap<object, () => void>();

export interface SubjectAccessPermission {
  readonly [permissionBrand]: true;
}

export class SubjectAccessPermissionRequiredError extends Error {
  constructor() {
    super("An active Subject Access operation and matching permission are required");
    this.name = "SubjectAccessPermissionRequiredError";
  }
}

export class SubjectAccessOperationDeniedError extends SubjectAccessDisabledError {
  readonly reason: "user_disabled" | "session_generation_stale" | "identity_mismatch";
  revokeSummary?: RevokeSummary;

  constructor(reason: SubjectAccessOperationDeniedError["reason"]) {
    super();
    this.name = "SubjectAccessOperationDeniedError";
    this.reason = reason;
  }
}

export interface SubjectAccessSessionTarget {
  readonly subjectIdentifier: string;
  readonly subjectContext: unknown;
  readonly principalSessionId: string;
}

export interface CreateSubjectAccessOperationsOptions {
  readonly barrier: SubjectAccessOperationBarrierPort;
  readonly revocation: SubjectAccessOperationRevocationPort;
}

/** Call only after authentication or read-only resolution establishes the trusted subject. */
export function createSubjectAccessOperations(options: CreateSubjectAccessOperationsOptions) {
  function createOperation() {
    let closed = false;
    let subject: string | undefined;
    let pending: Promise<SubjectAccessPermission> | undefined;
    let permission: SubjectAccessPermission | undefined;
    let context: SubjectAccessContext | undefined;
    let boundGeneration: string | undefined;

    function assertOpen() {
      if (closed)
        throw new SubjectAccessPermissionRequiredError();
    }

    function assertIdentity(subjectIdentifier: string, expected?: SubjectAccessContext) {
      if (subjectIdentifier !== subject || (expected && boundGeneration && expected.transitionId !== boundGeneration))
        throw new SubjectAccessOperationDeniedError("identity_mismatch");
    }

    async function deny(
      reason: "user_disabled" | "session_generation_stale",
      target: SubjectAccessSessionTarget | undefined,
      expected: SubjectAccessContext | undefined,
    ): Promise<never> {
      const error = new SubjectAccessOperationDeniedError(reason);
      if (target && expected) {
        try {
          error.revokeSummary = reason === "session_generation_stale"
            ? await options.revocation.revokePrincipalSession(target.principalSessionId, reason)
            : await options.revocation.revokeUserSessions(
                { principalType: "user", subjectId: expected.subjectIdentifier },
                reason,
                { onlySubjectAccessTransitionId: expected.transitionId },
              );
        }
        catch (cause) {
          error.cause = cause;
        }
      }
      throw error;
    }

    async function check(subjectIdentifier: string, target?: SubjectAccessSessionTarget) {
      if (!z.uuid().safeParse(subjectIdentifier).success)
        throw new SubjectAccessUnavailableError();
      const expected = target ? parseSubjectAccessContext(target.subjectContext) : undefined;
      if (target && !z.uuid().safeParse(target.principalSessionId).success)
        throw new SubjectAccessUnavailableError();
      if (expected && expected.subjectIdentifier !== subjectIdentifier)
        throw new SubjectAccessOperationDeniedError("identity_mismatch");
      boundGeneration = expected?.transitionId;
      let transitionId: string;
      try {
        transitionId = await options.barrier.readCommittedTransitionId(subjectIdentifier);
      }
      catch (error) {
        if (error instanceof SubjectAccessDisabledError)
          return await deny("user_disabled", target, expected);
        throw error instanceof SubjectAccessUnavailableError ? error : new SubjectAccessUnavailableError(error);
      }
      // Validate even injected providers; malformed generations must never become new context.
      const serialized = encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId });
      if (expected && expected.transitionId !== transitionId)
        return await deny("session_generation_stale", target, expected);
      assertOpen();
      context = parseSubjectAccessContext(serialized);
      boundGeneration = transitionId;
      permission = Object.freeze({ [permissionBrand]: true as const });
      return permission;
    }

    async function acquire(subjectIdentifier: string, target?: SubjectAccessSessionTarget) {
      assertOpen();
      if (!pending) {
        subject = subjectIdentifier;
        pending = check(subjectIdentifier, target);
      }
      else {
        assertIdentity(subjectIdentifier);
        if (target && boundGeneration) {
          const expected = parseSubjectAccessContext(target.subjectContext);
          if (expected.subjectIdentifier !== subjectIdentifier)
            throw new SubjectAccessOperationDeniedError("identity_mismatch");
          assertIdentity(subjectIdentifier, expected);
        }
      }
      const result = await pending;
      assertOpen();
      if (target) {
        const expected = parseSubjectAccessContext(target.subjectContext);
        if (expected.subjectIdentifier !== subjectIdentifier)
          throw new SubjectAccessOperationDeniedError("identity_mismatch");
        assertIdentity(subjectIdentifier, expected);
      }
      return result;
    }

    function requirePermission(subjectIdentifier: string): SubjectAccessPermission {
      assertOpen();
      if (!permission)
        throw new SubjectAccessPermissionRequiredError();
      assertIdentity(subjectIdentifier);
      return permission;
    }

    const operation = Object.freeze({
      acquireForAuthentication: (subjectIdentifier: string) => acquire(subjectIdentifier),
      acquireForSession: (target: SubjectAccessSessionTarget) => acquire(target.subjectIdentifier, { ...target }),
      requirePermission,
      getSubjectContext: (value: SubjectAccessPermission): string => {
        assertOpen();
        if (!permission || value !== permission || !context)
          throw new SubjectAccessPermissionRequiredError();
        return encodeSubjectAccessContext(context);
      },
      close: () => { closed = true; },
    });
    operations.set(operation, assertOpen);
    return operation;
  }

  async function run<T>(callback: (operation: SubjectAccessOperation) => Promise<T>): Promise<T> {
    const operation = createOperation();
    try {
      return await callback(operation);
    }
    finally {
      operation.close();
    }
  }

  return { createOperation, run };
}

export type SubjectAccessOperation = ReturnType<ReturnType<typeof createSubjectAccessOperations>["createOperation"]>;

export function requireSubjectAccessOperation(operation: SubjectAccessOperation | undefined): SubjectAccessOperation {
  if (!operation || !operations.has(operation))
    throw new SubjectAccessPermissionRequiredError();
  operations.get(operation)!();
  return operation;
}
