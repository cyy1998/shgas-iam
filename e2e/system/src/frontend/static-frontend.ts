import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { frontendApps, frontendPrefixes } from "./frontend-config.ts";

const immutable = "public, max-age=31536000, immutable";
const staticAsset = /\.(?:js|css|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|wasm)$/i;
const hashedAdminAsset = /^assets\/.+\.[A-Za-z0-9_-]{8}\.[a-zA-Z0-9]+$/;
const noStore = { "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache", Expires: "0" };

export function startStaticFrontendServer(paths: { admin: string; sso: string; rpTerminalPath: string }) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response(null, { status: 400 });
      }
      if (pathname === "/healthz") return new Response("ok\n");
      const app = frontendApps.find((app) => {
        const prefix = frontendPrefixes[app];
        return pathname === prefix || pathname.startsWith(`${prefix}/`);
      });
      if (app === undefined) return new Response(null, { status: 404 });

      const prefix = frontendPrefixes[app];
      if (pathname === prefix) return new Response(null, { status: 301, headers: { Location: `${prefix}/` } });
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
      }

      const name = pathname.slice(prefix.length + 1);
      if (name.includes("\\") || name.includes("\0") || name.split("/").some((part) => part === "." || part === "..")) {
        return new Response(null, { status: 404 });
      }

      const head = request.method === "HEAD";
      if (app === "sso" && name === "e2e-rp.html") return respondWithFile(paths.rpTerminalPath, noStore, head);
      const cached = app === "sso" ? name.startsWith("assets/") : hashedAdminAsset.test(name);
      if (cached || staticAsset.test(name)) {
        return respondWithFile(
          await findFile(paths[app], name),
          { "Cache-Control": cached ? immutable : "no-cache" },
          head,
        );
      }

      const file = (await findFile(paths[app], name)) ?? (await findFile(paths[app], "index.html"));
      return respondWithFile(file, noStore, head);
    },
  });

  return { origin: server.url.origin, stop: () => server.stop(true) };
}

async function findFile(directory: string, name: string) {
  const root = resolve(directory);
  const path = resolve(root, name);
  if (!insideDirectory(root, path)) return undefined;
  try {
    const file = await realpath(path);
    if (insideDirectory(await realpath(root), file) && (await stat(file)).isFile()) return file;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  return undefined;
}

function insideDirectory(root: string, path: string) {
  const entry = relative(root, path);
  return entry !== "" && entry !== ".." && !entry.startsWith(`..${sep}`) && !isAbsolute(entry);
}

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

async function respondWithFile(path: string | undefined, headers: Record<string, string>, head: boolean) {
  if (path === undefined) return new Response(null, { status: 404, headers });
  const file = Bun.file(path);
  if (!(await file.exists())) return new Response(null, { status: 404, headers });
  return new Response(head ? null : file, {
    headers: {
      ...headers,
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": String(file.size),
    },
  });
}
