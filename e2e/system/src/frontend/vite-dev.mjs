import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [prefix, cacheDir, rpTerminalPath] = process.argv.slice(2);
const requireFromApp = createRequire(join(process.cwd(), "package.json"));
const { createServer } = await import(pathToFileURL(requireFromApp.resolve("vite")).href);
const server = await createServer({
  cacheDir: join(cacheDir, "vite"),
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: true,
    allowedHosts: ["internal.iam.localhost", "external.iam.localhost", "host.docker.internal"],
  },
  plugins: [
    {
      name: "iam-e2e-frontend-routes",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const pathname = request.url?.split("?", 1)[0];
          if (pathname === prefix) {
            response.writeHead(301, { Location: `${prefix}/` }).end();
          } else if (pathname === "/healthz") {
            response.writeHead(200, { "Content-Type": "text/plain" }).end("ok\n");
          } else if (rpTerminalPath && pathname === `${prefix}/e2e-rp.html`) {
            try {
              const page = await readFile(rpTerminalPath);
              response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }).end(page);
            } catch (error) {
              next(error);
            }
          } else {
            next();
          }
        });
      },
    },
  ],
});

try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string" || address.address !== "127.0.0.1") {
    throw new Error("Vite did not bind to loopback");
  }
  await writeFile(join(cacheDir, "port"), `${address.port}\n`, { flag: "wx" });
} catch (error) {
  await server.close();
  throw error;
}
