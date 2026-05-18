import type { Redis } from "ioredis";
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { createPublicAuthenticationHandler } from "../auth";
import { errorHandler } from "../error-handler";

describe("createPublicAuthenticationHandler", () => {
  test("deletes the local session cookie by cookie name when the Redis session is expired", async () => {
    const sessionId = "bf1cf140-1510-40c3-b117-a43cf84de157";
    const app = new Hono();
    const redis = {
      get: async (key: string) => {
        expect(key).toBe(`local_iam-admin_session:${sessionId}`);
        return null;
      },
    } as Pick<Redis, "get"> as Redis;

    app.use("*", createPublicAuthenticationHandler({
      redis,
      userSchema: z.object({
        id: z.number(),
        username: z.string(),
        roles: z.array(z.string()),
      }),
    }));
    app.get("/public/user-info", c => c.json({ ok: true }));
    app.onError(errorHandler);

    const response = await app.request("http://localhost/public/user-info", {
      headers: {
        Client: "iam-admin",
        Cookie: `local_iam-admin_session=${sessionId}`,
      },
    });

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()[0]).toStartWith("local_iam-admin_session=");
  });
});
