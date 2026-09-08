export const SessionKernelLogEvent = {
  SchemaCorrupted: "session_kernel.schema_corrupted",
  TombstoneReplayDetected: "session_kernel.tombstone_replay.detected",
  RevokeCleanupFailed: "session_kernel.revoke.cleanup_failed",
} as const;
