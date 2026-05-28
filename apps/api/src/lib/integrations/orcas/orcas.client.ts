import type { OrcasLoginInput } from "./orcas.type";
import config from "@api/env";
import { z } from "@hono/zod-openapi";
import { createSingleton } from "@iam/api-core/core/singleton";
import { OrcasLoginFailedError } from "@iam/api-core/errors/OrcasLoginFailedError";

const ORCAS_SESSION_REGEX = /orcas_sso_sessionid=([^;]+)/;

const OrcasLoginResponseSchema = z.object({
  code: z.number().optional(),
  data: z.object({
    id: z.string().optional(),
  }).optional(),
});

function createOrcasClient() {
  return {
    async orcasLogin(input: OrcasLoginInput) {
      const orcasUri = config.ORCAS_URL;
      const resp = await fetch(orcasUri, {
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

const orcasClient = createSingleton(
  "orcas",
  createOrcasClient,
);

export default orcasClient;
