import type { OrcasLoginInput } from "./orcas.type";
import { z } from "@hono/zod-openapi";
import { OrcasLoginFailedError } from "@iam/api-core/errors/OrcasLoginFailedError";

const ORCAS_SESSION_REGEX = /orcas_sso_sessionid=([^;]+)/;

const OrcasLoginResponseSchema = z.object({
  code: z.number().optional(),
  data: z.object({
    id: z.string().optional(),
  }).optional(),
});

export interface CreateOrcasClientDeps {
  config: {
    orcasUrl: string;
  };
  fetch?: typeof fetch;
}

export function createOrcasClient(deps: CreateOrcasClientDeps) {
  const fetchFn = deps.fetch ?? fetch;

  return {
    async orcasLogin(input: OrcasLoginInput) {
      const resp = await fetchFn(deps.config.orcasUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: input.id,
          username: input.username,
          name: input.name,
          mobile: input.mobile ?? "",
        }),
      });

      const data = OrcasLoginResponseSchema.nullable().catch(null).parse(await resp.json().catch(() => null));
      const setCookies = resp.headers.getSetCookie();
      if (resp.status !== 200 || data?.code !== 200 || !data.data?.id || setCookies.length === 0) {
        throw new OrcasLoginFailedError("Orcas登录失败");
      }

      const cookieStr = setCookies.find(cookie => ORCAS_SESSION_REGEX.test(cookie)) ?? "";
      const match = cookieStr.match(ORCAS_SESSION_REGEX);
      const orcasSessionId = match ? match[1] : null;
      if (!orcasSessionId) {
        throw new OrcasLoginFailedError("Orcas登录失败");
      }
      return {
        orcasSessionId,
        orcasId: data.data.id,
      };
    },
  };
}

export type OrcasClient = ReturnType<typeof createOrcasClient>;
