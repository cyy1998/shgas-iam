import type { UserDto } from "@/schemas/user.common.type";
import axios from "axios";
import config from "@/env";
import { CustomError } from "@/errors/CustomError";
import { createSingleton } from "../core/singleton";

function createOrcasClient() {
  return {
    async orcasLogin(userDto: UserDto) {
      const orcasUri = config.ORCAS_URL;
      const resp = await axios(orcasUri, {
        method: "POST",
        data: {
          id: userDto.id,
          username: userDto.username,
          name: userDto.name,
          mobile: userDto.mobile ?? "",
        },
      });
      if (resp.status !== 200 || resp.data.code !== 200 || !resp.headers["set-cookie"]) {
        throw new CustomError("Orcas登录失败");
      }
      const cookieStr = resp.headers["set-cookie"][1] ?? "";
      const match = cookieStr.match(/orcas_sso_sessionid=([^;]+)/);
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
