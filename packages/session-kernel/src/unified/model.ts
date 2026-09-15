import { z } from "zod";

const id = z.uuid();
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const lifecycle = {
  version: z.literal(1),
  instance: id,
  subjectIdentifier: id,
  subjectContext: z.string().min(1),
  createdAt: time,
  expiresAt: time,
  state: z.enum(["active", "terminated"]),
};

export const userSessionSchema = z
  .object({
    ...lifecycle,
    kind: z.literal("userSession"),
    userSessionId: id,
    authTime: time,
    amr: z.preprocess(
      value =>
        value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0
          ? []
          : value,
      z.array(z.string().min(1)),
    ),
    origin: z
      .object({ ip: z.string().max(64).optional(), userAgent: z.string().max(512).optional() })
      .strict()
      .optional(),
  })
  .strict();

export const clientSessionSchema = z
  .object({
    ...lifecycle,
    kind: z.literal("clientSession"),
    clientSessionId: id,
    userSessionId: id,
    parentInstance: id,
    clientId: z.string().min(1).max(256),
    protocol: z.enum(["oidc", "custom_sso"]),
    authorizedAt: time,
  })
  .strict();

export type UserSession = z.infer<typeof userSessionSchema>;
export type ClientSession = z.infer<typeof clientSessionSchema>;
export type SessionRecord = UserSession | ClientSession;
export const sessionRecordSchema = z.discriminatedUnion("kind", [userSessionSchema, clientSessionSchema]);

export const authenticationSchema = userSessionSchema.pick({
  subjectIdentifier: true,
  subjectContext: true,
  amr: true,
  origin: true,
});
export type UserSessionAuthentication = z.infer<typeof authenticationSchema>;

export const targetSchema = z
  .object({
    kind: z.enum(["userSession", "clientSession"]),
    id,
    instance: id,
    userSessionId: id,
    subjectIdentifier: id,
    clientId: z.string().min(1).max(256).optional(),
  })
  .strict();
export type CapturedSession = z.infer<typeof targetSchema>;

export function captureIdentity(record: SessionRecord): CapturedSession {
  return {
    kind: record.kind,
    id: record.kind === "userSession" ? record.userSessionId : record.clientSessionId,
    instance: record.instance,
    userSessionId: record.userSessionId,
    subjectIdentifier: record.subjectIdentifier,
    ...(record.kind === "clientSession" ? { clientId: record.clientId } : {}),
  };
}

export type SessionFailure = { status: "missing" | "terminated" | "expired" | "mismatch" | "corrupt" };
export type SessionResolution<T> = SessionFailure | { status: "resolved"; value: T };
export type RevocationResult = {
  target: CapturedSession;
  status:
    | "terminated"
    | "already_terminated"
    | "missing"
    | "expired"
    | "excluded"
    | "replaced"
    | "failed"
    | "unknown";
};

export class SessionStorageError extends Error {
  constructor(
    readonly outcome: "failed" | "unknown",
    options?: ErrorOptions,
  ) {
    super("Session storage operation could not be confirmed", options);
    this.name = "SessionStorageError";
  }
}

export class SessionObservationRequiredError extends Error {
  constructor() {
    super("A matching observation from this factory and active operation is required");
    this.name = "SessionObservationRequiredError";
  }
}
