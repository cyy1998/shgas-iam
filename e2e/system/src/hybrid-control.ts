import { timingSafeEqual } from "node:crypto";

interface HybridControlOptions {
  token: string;
  reset(file: string, signal: AbortSignal): Promise<void>;
  stopWorker(): Promise<void>;
  startWorker(signal: AbortSignal): Promise<void>;
  onFailure(error: unknown): void;
}

export function createHybridControl(options: HybridControlOptions) {
  const authorization = Buffer.from(`Bearer ${options.token}`);
  const shutdown = new AbortController();
  let active: Promise<void> | undefined;
  let lastFile: string | undefined;
  let resetFailed = false;

  return {
    async fetch(request: Request) {
      const presented = Buffer.from(request.headers.get("authorization") ?? "");
      if (presented.length !== authorization.length || !timingSafeEqual(presented, authorization)) {
        return new Response(null, { status: 401 });
      }
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
      const path = new URL(request.url).pathname;
      if (!["/reset", "/worker/stop", "/worker/start"].includes(path)) return new Response(null, { status: 404 });
      let file: string | undefined;
      if (path === "/reset") {
        const body: unknown = await request.json().catch(() => null);
        if (typeof body !== "object" || !body || !("file" in body) || typeof body.file !== "string" || !body.file)
          return new Response(null, { status: 400 });
        file = body.file;
      }

      if (shutdown.signal.aborted) return new Response(null, { status: 503 });
      if (active || (resetFailed && path === "/worker/start")) return new Response(null, { status: 409 });
      if (file !== undefined && file === lastFile) return new Response(null, { status: 204 });

      active = Promise.resolve().then(async () => {
        if (file !== undefined) {
          lastFile = undefined;
          resetFailed = true;
          await options.reset(file, shutdown.signal);
          lastFile = file;
          resetFailed = false;
        } else if (path === "/worker/stop") {
          await options.stopWorker();
        } else {
          await options.startWorker(shutdown.signal);
        }
      });
      try {
        await active;
        return new Response(null, { status: 204 });
      } catch (error) {
        options.onFailure(error);
        return new Response(null, { status: 500 });
      } finally {
        active = undefined;
      }
    },

    async close() {
      shutdown.abort(new Error("E2E control is shutting down"));
      await active?.catch(() => undefined);
    },
  };
}
