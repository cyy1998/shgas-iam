export const RETRYABLE_SERVICE_UNAVAILABLE
  = "retryable-service-unavailable" as const;

export interface RetryableServiceUnavailable {
  readonly retryability: typeof RETRYABLE_SERVICE_UNAVAILABLE;
}

export function isRetryableServiceUnavailable(
  error: unknown,
): error is Error & RetryableServiceUnavailable {
  return error instanceof Error
    && (error as Partial<RetryableServiceUnavailable>).retryability
    === RETRYABLE_SERVICE_UNAVAILABLE;
}
