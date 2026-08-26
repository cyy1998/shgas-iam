export async function runWithinInternalHandlerBudget<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  createTimeoutError: () => Error,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(createTimeoutError()),
        timeoutMs,
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
