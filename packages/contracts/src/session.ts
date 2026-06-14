export const GLOBAL_SESSION_VERSION = 1 as const;

export interface GlobalSessionEnvelope<TUser = unknown> {
  version: typeof GLOBAL_SESSION_VERSION;
  /** Original authentication time in Unix seconds. */
  authTime: number;
  user: TUser;
}
