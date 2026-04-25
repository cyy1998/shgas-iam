import type { OrcasLoginInput } from "./orcas.type";
import { createSingleton } from "@lib/core/singleton";
import axios from "axios";
import config from "@/env";
import { CustomError } from "@/errors/CustomError";

const ORCAS_SESSION_REGEX = /orcas_sso_sessionid=([^;]+)/;

function createOrcasClient() {
  return {
    async orcasLogin(input: OrcasLoginInput) {
      const orcasUri = config.ORCAS_URL;
      const resp = await axios(orcasUri, {
        method: "POST",
        data: {
          id: input.id,
          username: input.username,
          name: input.name,
          mobile: input.mobile ?? "",
        },
      });
      if (resp.status !== 200 || resp.data.code !== 200 || !resp.headers["set-cookie"]) {
        throw new CustomError("Orcas登录失败");
      }
      const cookieStr = resp.headers["set-cookie"][1] ?? "";
      const match = cookieStr.match(ORCAS_SESSION_REGEX);
      const orcasSessionId = match ? match[1] : null;
      if (!orcasSessionId) {
        throw new CustomError("Orcas登录失败");
      }
      return {
        orcasSessionId,
        orcasId: resp.data.data.id,
      };
    },
  };
}

const orcasClient = createSingleton(
  "orcas",
  createOrcasClient,
);

export default orcasClient;
