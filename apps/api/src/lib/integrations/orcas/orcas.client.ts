import type { OrcasLoginInput } from "./orcas.type";
import config from "@api/env";
import { createSingleton } from "@iam/api-core/core/singleton";
import { CustomError } from "@iam/api-core/errors/CustomError";

const ORCAS_SESSION_REGEX = /orcas_sso_sessionid=([^;]+)/;

interface OrcasLoginResponse {
  code?: number;
  data?: {
    id?: string;
  };
}

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

      const data = await resp.json().catch(() => null) as OrcasLoginResponse | null;
      const setCookies = resp.headers.getSetCookie();
      if (resp.status !== 200 || data?.code !== 200 || !data.data?.id || setCookies.length === 0) {
        throw new CustomError("Orcas登录失败");
      }

      const cookieStr = setCookies.find(cookie => ORCAS_SESSION_REGEX.test(cookie)) ?? "";
      const match = cookieStr.match(ORCAS_SESSION_REGEX);
      const orcasSessionId = match ? match[1] : null;
      if (!orcasSessionId) {
        throw new CustomError("Orcas登录失败");
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
