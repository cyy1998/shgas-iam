export const INTERNAL_USER_HANDLER_TIMEOUT_MS = 5_000;

export async function runWithinInternalUserHandlerBudget<T>(
  operation: () => Promise<T>,
  createTimeoutError: () => Error,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(createTimeoutError()),
        INTERNAL_USER_HANDLER_TIMEOUT_MS,
      );
    });
    return await Promise.race([
      deadline,
      Promise.resolve().then(operation),
    ]);
  }
  finally {
    if (timeout !== undefined)
      clearTimeout(timeout);
  }
}
