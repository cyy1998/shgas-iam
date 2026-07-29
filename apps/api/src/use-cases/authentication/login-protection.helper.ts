import { LoginRestrictionUnavailableError } from "@iam/api-core/login-restriction";
import { LoginProtectionUnavailableError } from "./login-protection.error";

export async function runLoginProtectionOperation<T>(options: {
  operation: () => Promise<T>;
  auditUnavailable: () => Promise<void>;
}): Promise<T> {
  try {
    return await options.operation();
  }
  catch (error) {
    if (!(error instanceof LoginRestrictionUnavailableError))
      throw error;

    let cause: unknown = error;
    try {
      await options.auditUnavailable();
    }
    catch (auditError) {
      cause = new AggregateError(
        [error, auditError],
        "Login protection state and unavailable audit both failed",
      );
    }
    throw new LoginProtectionUnavailableError(cause);
  }
}
