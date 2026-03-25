import type { Context, Next } from "hono";
import { AuthzUnauthorizedError } from "@errors/AuthzUnauthorizedError";
import { CustomError } from "@errors/CustomError";
import { UserDetailDtoSchema } from "@schemas/user.common.type";
import { deleteCookie, getCookie } from "hono/cookie";
import redis from "@/lib/clients/redis";
import { reviveIsoDates } from "@/utils/common.utils";

export async function authenicationHandler(c: Context, next: Next) {
  const clientCode = c.req.header("Client");
  const sessionId = clientCode === "iam"
    ? getCookie(c, `global_session`) ?? c.req.header("Authorization") ?? null
    : getCookie(c, `local_${clientCode}_session`) ?? c.req.header("Authorization") ?? null;
  if (!clientCode) {
    throw new CustomError("非法请求");
  }
  if (!sessionId) {
    throw new AuthzUnauthorizedError("未登录");
  }
  const userString = clientCode === "iam"
    ? await redis.get(`global_session:${sessionId}`)
    : await redis.get(`local_${clientCode}_session:${sessionId}`);
  if (!userString) {
    deleteCookie(c, clientCode === "iam" ? `global_session:${sessionId}` : `local_${clientCode}_session:${sessionId}`);
    deleteCookie(c, "orcas_sso_sessionid");
    throw new AuthzUnauthorizedError("未登录");
  }
  const userDetailDto = UserDetailDtoSchema.parse(JSON.parse(userString, reviveIsoDates));
  // const userDto: UserDto = JSON.parse(Buffer.from(userString, 'base64').toString('utf8'))
  c.set("userId", userDetailDto.id);
  c.set("username", userDetailDto.username);
  c.set("userDetailDto", userDetailDto);
  return await next();
}
