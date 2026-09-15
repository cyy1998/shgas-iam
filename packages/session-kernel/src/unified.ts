export { createUnifiedSessionKernel } from "./unified/factory";
export type {
  ClientSessionObservation,
  ClientSessionTarget,
  RevocationObservation,
  UnifiedSessionKernel,
  UnifiedSessionKernelOptions,
  UserSessionObservation,
} from "./unified/factory";
export { targetSchema as CapturedSessionSchema, SessionObservationRequiredError, SessionStorageError } from "./unified/model";
export type {
  CapturedSession,
  ClientSession,
  RevocationResult,
  SessionRecord,
  SessionResolution,
  UserSession,
  UserSessionAuthentication,
} from "./unified/model";
export type { UnifiedSessionRedis } from "./unified/storage";
