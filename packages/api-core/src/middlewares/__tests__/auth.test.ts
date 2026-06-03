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

  test("rejects and cleans up a stale local session when reverse mapping is missing", async () => {
    const sessionId = "bf1cf140-1510-40c3-b117-a43cf84de157";
    const app = new Hono();
    const values = new Map<string, string>([
      [`local_iam-admin_session:${sessionId}`, JSON.stringify({
        id: 1,
        username: "138550",
        roles: [],
      })],
    ]);
    const deletedKeys: string[] = [];
    const redis = {
      get: async (key: string) => values.get(key) ?? null,
      del: async (key: string) => {
        deletedKeys.push(key);
        return values.delete(key) ? 1 : 0;
      },
    } as Pick<Redis, "get" | "del"> as Redis;

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
    expect(deletedKeys).toEqual([
      `local_iam-admin_session:${sessionId}`,
      `local_session_reverse:${sessionId}`,
    ]);
    expect(response.headers.getSetCookie()[0]).toStartWith("local_iam-admin_session=");
  });
});
