import type { SessionKernel, SessionOrigin } from "@iam/session-kernel";
import { CustomError } from "@iam/api-core/errors/CustomError";

type PrincipalSessionCreationOptions = {
  amr?: readonly string[];
  origin?: SessionOrigin;
};

export function createPrincipalSessionAdapter(kernel: Pick<SessionKernel, "createPrincipalSession">) {
  async function createPrincipalSession(
    subjectIdentifier: string,
    options: PrincipalSessionCreationOptions = {},
  ) {
    const result = await kernel.createPrincipalSession(subjectIdentifier, {
      sessionKind: "browser_user",
      amr: options.amr === undefined ? [] : [...options.amr],
      origin: options.origin,
    });
    if (result.status !== "created" || !result.externalToken) {
      throw new CustomError("全局session创建失败");
    }
    return {
      token: result.externalToken,
      principalSession: result.value,
    };
  }

  return { createPrincipalSession };
}

export type PrincipalSessionAdapter = ReturnType<typeof createPrincipalSessionAdapter>;
