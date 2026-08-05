import { describe, expect, it } from "bun:test";
import { ApisixAdminClient } from "../../src/apisix-admin-client";
import { getDefinition } from "../../src/resources";

describe("apisix admin client", () => {
  it("supports fetch injection, API key header, and URL joining", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response("{}", { status: 200 });
    };
    const client = new ApisixAdminClient({
      adminUrl: "http://127.0.0.1:9180/apisix/admin/",
      adminKey: "secret-key",
      fetch: fetchImpl as any,
    });

    await client.upsert("routes", "route-a", { id: "route-a" });

    expect(calls.at(0)?.url).toBe("http://127.0.0.1:9180/apisix/admin/routes/route-a");
    expect(calls.at(0)?.init.method).toBe("PUT");
    expect((calls.at(0)?.init.headers as Record<string, string>)["X-API-KEY"]).toBe("secret-key");
  });

  it("throws on non-2xx responses", async () => {
    const client = new ApisixAdminClient({
      adminUrl: "http://127.0.0.1:9180/apisix/admin",
      adminKey: "secret-key",
      fetch: (async () => new Response("denied", { status: 403 })) as any,
    });

    await expect(client.delete("routes", "route-a")).rejects.toThrow("403 denied");
  });

  it("unwraps APISIX list responses and derives missing IDs from keys", async () => {
    const client = new ApisixAdminClient({
      adminUrl: "http://127.0.0.1:9180/apisix/admin",
      adminKey: "secret-key",
      fetch: (async () => new Response(JSON.stringify({
        list: [
          {
            key: "/apisix/routes/route-a",
            value: {
              uri: "/a/*",
            },
          },
        ],
      }), { status: 200 })) as any,
    });

    await expect(client.list(getDefinition("routes"))).resolves.toEqual([
      {
        id: "route-a",
        uri: "/a/*",
      },
    ]);
  });
});
