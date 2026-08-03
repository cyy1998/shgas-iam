import { setCookie } from "hono/cookie";

export function expireCustomSsoCookies(
  context: Parameters<typeof setCookie>[0],
  cookieNames: readonly string[],
) {
  for (const cookieName of cookieNames) {
    setCookie(context, cookieName, "", {
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    });
  }
}
