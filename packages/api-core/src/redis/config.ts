import { z } from "zod";

export type RedisConfig = {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db: number;
};

export function redisUrlString() {
  return z
    .string()
    .trim()
    .transform((value, ctx): RedisConfig => {
      const fail = (message: string): never => {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      };

      if (
        [...value].some(
          (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === "\\",
        )
      )
        return fail("must be a valid Redis URL");

      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return fail("must be a valid Redis URL");
      }
      if (url.protocol !== "redis:") return fail("must use redis://; TLS is not supported");
      if (!url.hostname) return fail("must contain a Redis hostname");
      if (/[?#]/u.test(value)) return fail("must not contain a query or fragment");

      const path = value.match(/^redis:\/\/[^/]*(\/.*)?$/iu)?.[1] ?? "";
      if (path !== "" && path !== "/" && !/^\/\d+$/u.test(path))
        return fail("must contain a valid Redis database number");
      const db = path === "" || path === "/" ? 0 : Number(path.slice(1));
      if (!Number.isSafeInteger(db) || db < 0 || db > 2_147_483_647)
        return fail("must contain a Redis database number between 0 and 2147483647");

      const port = Number(url.port || "6379");
      if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) return fail("must contain a valid Redis port");

      let username: string | undefined;
      let password: string | undefined;
      try {
        username = url.username ? decodeURIComponent(url.username) : undefined;
        password = url.password ? decodeURIComponent(url.password) : undefined;
      } catch {
        return fail("must contain valid percent-encoded Redis credentials");
      }

      return {
        host: url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname,
        port,
        db,
        password,
        ...(username === undefined ? {} : { username }),
      };
    });
}
