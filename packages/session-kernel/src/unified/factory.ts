import type {
  CapturedSession,
  ClientSession,
  RevocationResult,
  SessionRecord,
  SessionResolution,
  UserSession,
  UserSessionAuthentication,
} from "./model";
import type { UnifiedSessionRedis } from "./storage";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  authenticationSchema,
  captureIdentity,
  clientSessionSchema,
  SessionObservationRequiredError,
  sessionRecordSchema,
  SessionStorageError,
  targetSchema,
  userSessionSchema,
} from "./model";
import { createUnifiedSessionStorage } from "./storage";

declare const observationBrand: unique symbol;
export interface UserSessionObservation {
  readonly [observationBrand]: "userSession";
  readonly userSession: Readonly<UserSession>;
  readonly observedAt: number;
  readonly remainingSeconds: number;
}
export interface ClientSessionObservation {
  readonly [observationBrand]: "clientSession";
  readonly userSession: Readonly<UserSession>;
  readonly clientSession: Readonly<ClientSession>;
  readonly observedAt: number;
  readonly remainingSeconds: number;
}
export interface RevocationObservation {
  readonly [observationBrand]: "revocation";
  readonly target: Readonly<CapturedSession>;
}

export interface UnifiedSessionKernelOptions<Operation extends object> {
  redis: UnifiedSessionRedis;
  /** The new generation always appends its own fixed namespace segment. */
  namespace?: string;
  userSessionTtlSeconds: number;
  clientSessionTtlSeconds: number;
  /** Lifecycle assertion only. The outer owner separately acquires Subject Access Permission. */
  assertOperationActive: (operation: Operation) => void;
}

type ObservationState = {
  operation: object;
  userSession?: UserSession;
  clientSession?: ClientSession;
  target?: CapturedSession;
};

const ttlSchema = z.number().int().positive().max(315360000);
const clientTargetSchema = z
  .object({
    userSessionId: z.uuid(),
    clientSessionId: z.uuid(),
    clientId: z.string().min(1).max(256),
  })
  .strict();
export type ClientSessionTarget = z.infer<typeof clientTargetSchema>;
const openSchema = clientSessionSchema.pick({ clientId: true, protocol: true });

function snapshot<T>(value: T): T {
  const result: T = structuredClone(value);
  function freeze(object: unknown) {
    if (object && typeof object === "object") {
      Object.values(object).forEach(freeze);
      Object.freeze(object);
    }
  }
  freeze(result);
  return result;
}

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function failure(status: string): { status: "missing" | "terminated" | "expired" | "mismatch" | "corrupt" } {
  switch (status) {
    case "missing":
    case "terminated":
    case "expired":
    case "mismatch":
    case "corrupt":
      return { status };
    default:
      throw new SessionStorageError("failed");
  }
}

/** Transitional new-generation entry; a composition selects this factory or the legacy one. */
export function createUnifiedSessionKernel<Operation extends object>(
  options: UnifiedSessionKernelOptions<Operation>,
) {
  const userTtl = ttlSchema.parse(options.userSessionTtlSeconds) * 1000;
  const clientTtl = ttlSchema.parse(options.clientSessionTtlSeconds) * 1000;
  const namespace = z
    .string()
    .regex(/^[\w:-]+$/u)
    .parse(options.namespace ?? "iam:session");
  const storage = createUnifiedSessionStorage(options.redis, namespace);
  const observations = new WeakMap<object, ObservationState>();
  const scopes = new WeakMap<Operation, ReturnType<typeof createScope>>();

  function createScope(operation: Operation) {
    const active = () => options.assertOperationActive(operation);
    function requireObservation(value: object) {
      active();
      const state = observations.get(value);
      if (!state || state.operation !== operation)
        throw new SessionObservationRequiredError();
      return state;
    }
    function observeUser(userSession: UserSession, observedAt: number): UserSessionObservation {
      active();
      const observation = snapshot({
        userSession,
        observedAt,
        remainingSeconds: Math.max(0, Math.floor((userSession.expiresAt - observedAt) / 1000)),
      }) as UserSessionObservation;
      observations.set(observation, { operation, userSession: structuredClone(userSession) });
      return observation;
    }
    function observeClient(
      userSession: UserSession,
      clientSession: ClientSession,
      observedAt: number,
    ): ClientSessionObservation {
      active();
      const observation = snapshot({
        userSession,
        clientSession,
        observedAt,
        remainingSeconds: Math.max(
          0,
          Math.floor((Math.min(userSession.expiresAt, clientSession.expiresAt) - observedAt) / 1000),
        ),
      }) as ClientSessionObservation;
      observations.set(observation, {
        operation,
        userSession: structuredClone(userSession),
        clientSession: structuredClone(clientSession),
      });
      return observation;
    }
    function observeRevocation(record: SessionRecord): RevocationObservation {
      active();
      const target = captureIdentity(record);
      const observation = snapshot({ target }) as RevocationObservation;
      observations.set(observation, { operation, target });
      return observation;
    }

    async function resolveUser(request: object): Promise<SessionResolution<UserSessionObservation>> {
      active();
      const result = await storage.execute({ action: "resolveUser", ...request });
      active();
      if (result.status !== "resolved")
        return failure(result.status);
      const parsed = userSessionSchema.safeParse(result.value);
      return parsed.success
        ? { status: "resolved", value: observeUser(parsed.data, result.observedAt) }
        : { status: "corrupt" };
    }

    async function revokeTarget(target: CapturedSession): Promise<RevocationResult> {
      active();
      try {
        const result = await storage.execute({ action: "revoke", target });
        const status = z
          .enum(["terminated", "already_terminated", "missing", "expired", "replaced", "failed"])
          .parse(result.status);
        return snapshot({ target, status });
      }
      catch (error) {
        return snapshot<RevocationResult>({
          target,
          status: error instanceof SessionStorageError ? error.outcome : "unknown",
        });
      }
    }

    async function captureSessions(input: {
      scope: { subjectIdentifier: string } | { userSessionId: string } | { clientId: string };
      offset?: number;
      limit?: number;
    }) {
      active();
      const scope = z
        .union([
          z.object({ subjectIdentifier: z.uuid() }).strict(),
          z.object({ userSessionId: z.uuid() }).strict(),
          z.object({ clientId: z.string().min(1).max(256) }).strict(),
        ])
        .parse(input.scope);
      const offset = z
        .number()
        .int()
        .nonnegative()
        .parse(input.offset ?? 0);
      const limit = z
        .number()
        .int()
        .min(1)
        .max(1000)
        .parse(input.limit ?? 100);
      const [index, id]
        = "subjectIdentifier" in scope
          ? ["subject", scope.subjectIdentifier]
          : "userSessionId" in scope
            ? ["children", scope.userSessionId]
            : ["client-index", scope.clientId];
      const result = await storage.execute({ action: "capture", index, id, offset, limit });
      active();
      if (result.status !== "captured")
        throw new SessionStorageError("failed");
      // Redis cjson represents an empty Lua table as {}.
      const page = z
        .object({
          records: z.union([z.array(sessionRecordSchema), z.object({}).strict()]),
          scanned: z.number().int(),
          hasMore: z.boolean(),
        })
        .parse(result.value);
      const records = Array.isArray(page.records) ? page.records : [];
      for (const record of records) {
        if (
          ("subjectIdentifier" in scope
            && (record.kind !== "userSession" || record.subjectIdentifier !== scope.subjectIdentifier))
          || ("userSessionId" in scope
            && (record.kind !== "clientSession" || record.userSessionId !== scope.userSessionId))
          || ("clientId" in scope && (record.kind !== "clientSession" || record.clientId !== scope.clientId))
        ) {
          throw new SessionStorageError("failed");
        }
      }
      return snapshot({
        records,
        targets: records.map(captureIdentity),
        nextOffset: page.hasMore ? offset + page.scanned : null,
      });
    }

    async function executeCapturedSessions(input: {
      targets: readonly CapturedSession[];
      excludeUserSessionId?: string;
    }) {
      active();
      const targets = z.array(targetSchema).max(1000).parse(input.targets);
      const exclude = z.uuid().optional().parse(input.excludeUserSessionId);
      const results: RevocationResult[] = [];
      const seen = new Set<string>();
      for (const target of targets) {
        const identity = `${target.kind}:${target.id}:${target.instance}`;
        if (seen.has(identity))
          continue;
        seen.add(identity);
        results.push(
          target.kind === "userSession" && target.id === exclude
            ? { target, status: "excluded" }
            : await revokeTarget(target),
        );
      }
      return snapshot({
        results,
        userSessionsTerminated: results.filter(
          r => r.target.kind === "userSession" && r.status === "terminated",
        ).length,
        clientSessionsTerminated: results.filter(
          r => r.target.kind === "clientSession" && r.status === "terminated",
        ).length,
        unfinished: results
          .filter(r => r.status === "failed" || r.status === "unknown")
          .map(r => r.target),
      });
    }

    return {
      async createUserSession(authentication: UserSessionAuthentication) {
        active();
        const facts = authenticationSchema.parse(authentication);
        const bearer = `us_${randomBytes(32).toString("base64url")}`;
        const record = {
          ...facts,
          version: 1,
          kind: "userSession",
          instance: randomUUID(),
          userSessionId: randomUUID(),
          state: "active",
        };
        const result = await storage.execute({
          action: "create",
          record,
          digest: digest(bearer),
          ttl: userTtl,
        });
        if (result.status !== "created")
          throw new SessionStorageError("failed");
        return { bearer, observation: observeUser(userSessionSchema.parse(result.value), result.observedAt) };
      },
      resolveUserSession: (bearer: string) =>
        resolveUser({ digest: digest(z.string().min(1).max(4096).parse(bearer)) }),
      resolveUserSessionById: (userSessionId: string) => resolveUser({ id: z.uuid().parse(userSessionId) }),
      async openClientSession(parent: UserSessionObservation, input: z.infer<typeof openSchema>) {
        const observed = requireObservation(parent);
        if (!observed.userSession || observed.clientSession || observed.target)
          throw new SessionObservationRequiredError();
        const target = openSchema.parse(input);
        const root = observed.userSession;
        const record = {
          ...target,
          version: 1,
          kind: "clientSession",
          state: "active",
          instance: randomUUID(),
          clientSessionId: randomUUID(),
          userSessionId: root.userSessionId,
          parentInstance: root.instance,
          subjectIdentifier: root.subjectIdentifier,
          subjectContext: root.subjectContext,
          expiresAt: 0,
        };
        const result = await storage.execute({ action: "open", parent: root, record, ttl: clientTtl });
        active();
        if (result.status !== "created" && result.status !== "reused")
          return failure(result.status);
        return {
          status: result.status,
          value: observeClient(root, clientSessionSchema.parse(result.value), result.observedAt),
        };
      },
      async resolveClientSessionForUse(
        input: ClientSessionTarget,
      ): Promise<SessionResolution<ClientSessionObservation>> {
        active();
        const { clientSessionId: id, ...target } = clientTargetSchema.parse(input);
        const result = await storage.execute({ action: "resolveClient", id, ...target });
        active();
        if (result.status !== "resolved")
          return failure(result.status);
        const parsed = z
          .object({ userSession: userSessionSchema, clientSession: clientSessionSchema })
          .safeParse(result.value);
        return parsed.success
          ? {
              status: "resolved",
              value: observeClient(parsed.data.userSession, parsed.data.clientSession, result.observedAt),
            }
          : { status: "corrupt" };
      },
      /** Reuses an already acquired observation; deliberately performs no new lifecycle read. */
      useObservation(observation: UserSessionObservation | ClientSessionObservation) {
        const state = requireObservation(observation);
        if (!state.userSession || state.target)
          throw new SessionObservationRequiredError();
        return snapshot({
          userSession: state.userSession,
          ...(state.clientSession ? { clientSession: state.clientSession } : {}),
        });
      },
      /** Protocol owners store this fixed deadline on their own artifacts; this never renews a session. */
      async getIssuanceLifetime(observation: ClientSessionObservation, ttlSeconds: number) {
        const state = requireObservation(observation);
        if (!state.userSession || !state.clientSession)
          throw new SessionObservationRequiredError();
        const ttl = ttlSchema.parse(ttlSeconds) * 1000;
        const { observedAt } = await storage.execute({ action: "time" });
        active();
        const expiresAt = Math.min(
          state.userSession.expiresAt,
          state.clientSession.expiresAt,
          observedAt + ttl,
        );
        return snapshot({
          issuedAt: observedAt,
          expiresAt,
          remainingSeconds: Math.max(0, Math.floor((expiresAt - observedAt) / 1000)),
        });
      },
      async observeUserSessionForRevocation(
        userSessionId: string,
      ): Promise<SessionResolution<RevocationObservation>> {
        active();
        const result = await storage.execute({
          action: "resolveUser",
          id: z.uuid().parse(userSessionId),
          neutral: true,
        });
        active();
        if (result.status !== "record")
          return failure(result.status);
        const parsed = userSessionSchema.safeParse(result.value);
        return parsed.success
          ? { status: "resolved", value: observeRevocation(parsed.data) }
          : { status: "corrupt" };
      },
      async observeClientSessionForRevocation(
        input: ClientSessionTarget,
      ): Promise<SessionResolution<RevocationObservation>> {
        active();
        const { clientSessionId: id, ...target } = clientTargetSchema.parse(input);
        const result = await storage.execute({ action: "resolveClient", id, ...target, neutral: true });
        active();
        if (result.status !== "record")
          return failure(result.status);
        const parsed = clientSessionSchema.safeParse(result.value);
        return parsed.success
          ? { status: "resolved", value: observeRevocation(parsed.data) }
          : { status: "corrupt" };
      },
      revokeObservedUserSession(observation: UserSessionObservation | RevocationObservation) {
        const state = requireObservation(observation);
        const target
          = state.target
            ?? (state.userSession && !state.clientSession ? captureIdentity(state.userSession) : undefined);
        if (target?.kind !== "userSession")
          throw new SessionObservationRequiredError();
        return revokeTarget(target);
      },
      revokeObservedClientSession(observation: ClientSessionObservation | RevocationObservation) {
        const state = requireObservation(observation);
        const target
          = state.target ?? (state.clientSession ? captureIdentity(state.clientSession) : undefined);
        if (target?.kind !== "clientSession")
          throw new SessionObservationRequiredError();
        return revokeTarget(target);
      },
      captureSessions,
      async listSessions(input: {
        kind: "userSession" | "clientSession";
        subjectIdentifier?: string;
        userSessionId?: string;
        offset: number;
        limit: number;
      }) {
        active();
        const query = z
          .object({
            kind: z.enum(["userSession", "clientSession"]),
            subjectIdentifier: z.uuid().optional(),
            userSessionId: z.uuid().optional(),
            offset: z.int().nonnegative(),
            limit: z.int().min(1).max(1000),
          })
          .strict()
          .refine(query => query.userSessionId === undefined || query.kind === "clientSession", {
            message: "userSessionId requires clientSession kind",
            path: ["userSessionId"],
          })
          .parse(input);
        const response = await storage.execute({ action: "list", ...query });
        active();
        if (response.status !== "listed")
          throw new SessionStorageError("failed");
        const page = z
          .object({
            records: z.union([z.array(sessionRecordSchema), z.object({}).strict()]),
            total: z.int().nonnegative(),
          })
          .parse(response.value);
        return snapshot({ records: Array.isArray(page.records) ? page.records : [], total: page.total });
      },
      executeCapturedSessions,
    };
  }

  return {
    forOperation(operation: Operation) {
      options.assertOperationActive(operation);
      let scope = scopes.get(operation);
      if (!scope) {
        scope = createScope(operation);
        scopes.set(operation, scope);
      }
      return scope;
    },
  };
}

export type UnifiedSessionKernel<Operation extends object = object> = ReturnType<
  typeof createUnifiedSessionKernel<Operation>
>;
