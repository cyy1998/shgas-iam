import { runWithinInternalHandlerBudget } from "@api/routes/internal/_handler-budget";

export const INTERNAL_USER_HANDLER_TIMEOUT_MS = 5_000;

export async function runWithinInternalUserHandlerBudget<T>(
  operation: () => Promise<T>,
  createTimeoutError: () => Error,
): Promise<T> {
  return await runWithinInternalHandlerBudget(
    operation,
    INTERNAL_USER_HANDLER_TIMEOUT_MS,
    createTimeoutError,
  );
}
