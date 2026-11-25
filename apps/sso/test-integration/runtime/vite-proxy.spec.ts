import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createServer as createViteServer } from "vite";

test("the development proxy routes fixed callbacks to Auth API and SSO protocol requests to SSO API", async ({
  request,
}) => {
  const upstreams = ["auth", "sso"].map((service) =>
    createServer((req, res) => res.end(JSON.stringify({ service, url: req.url }))),
  );
  for (const upstream of upstreams) upstream.listen(0, "127.0.0.1");
  try {
    await Promise.all(upstreams.map((upstream) => once(upstream, "listening")));
    const targets = upstreams.map((upstream) => {
      const address = upstream.address();
      if (!address || typeof address === "string") throw new Error("Expected a loopback listener");
      return `http://127.0.0.1:${address.port}`;
    });
    const server = await createViteServer({
      configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
      server: { port: 0, host: "127.0.0.1", ws: false, watch: null },
      plugins: [
        {
          name: "loopback-test-upstreams",
          configResolved(config) {
            for (const proxy of Object.values(config.server.proxy ?? {})) {
              if (typeof proxy !== "object") continue;
              if (proxy.target === "http://localhost:30000") proxy.target = targets[0];
              if (proxy.target === "http://localhost:30002") proxy.target = targets[1];
            }
          },
        },
      ],
    });
    try {
      await server.listen();
      const origin = server.resolvedUrls?.local[0];
      if (!origin) throw new Error("Expected a Vite listener");
      for (const [path, service] of [
        ["/sso/thirdparty/oa?state=fixture", "auth"],
        ["/sso/third-party/wx?state=fixture", "auth"],
        ["/sso/wechat-qr/mobile/callback?state=fixture", "auth"],
        ["/sso/wechat-qr/mobile/confirm/fixture", "auth"],
        ["/sso/authorize?client=fixture", "sso"],
      ] as const) {
        const response = await request.get(new URL(path, origin).href);
        const result: unknown = await response.json();
        expect(response.status()).toBe(200);
        expect(result).toEqual({ service, url: path });
      }
    } finally {
      await server.close();
    }
  } finally {
    await Promise.all(upstreams.map((upstream) => new Promise<void>((resolve) => upstream.close(() => resolve()))));
  }
});
