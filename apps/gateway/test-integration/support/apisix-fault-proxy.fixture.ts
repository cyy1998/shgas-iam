import { createServer } from "node:http";
import type { Socket } from "node:net";
import type { ApisixFixture } from "./apisix.fixture";
import { bounded } from "./lifecycle-sync.fixture";

type Intercept = {
  method: string;
  path: string;
  action?: "forward" | "reject" | "drop_after_forward";
};
type JournalEntry = { method: string; path: string; forwarded: boolean; status?: number };

/** Test-only HTTP boundary. Successful ACKs always come from the real APISIX. */
export async function createApisixFaultProxy(fixture: ApisixFixture) {
  const journal: JournalEntry[] = [];
  const intercepts: Array<
    Intercept & {
      entered: ReturnType<typeof Promise.withResolvers<void>>;
      released: ReturnType<typeof Promise.withResolvers<void>>;
      completed: ReturnType<typeof Promise.withResolvers<void>>;
    }
  > = [];
  const gates = new Set<(typeof intercepts)[number]>();
  const sockets = new Set<Socket>();
  const pending = new Set<Promise<void>>();
  const failures: unknown[] = [];
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  const server = createServer((request, response) => {
    const operation = (async () => {
      const method = request.method ?? "GET";
      const path = new URL(request.url ?? "/", fixture.adminUrl).pathname;
      const entry: JournalEntry = { method, path, forwarded: false };
      journal.push(entry);
      const index = intercepts.findIndex((item) => item.method === method && item.path === path);
      const gate = index === -1 ? undefined : intercepts.splice(index, 1)[0];
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        if (gate) {
          gate.entered.resolve();
          await gate.released.promise;
        }
        if (gate?.action === "reject") {
          entry.status = 400;
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error_msg: "controlled test rejection" }));
          return;
        }
        entry.forwarded = true;
        const result = await fetch(new URL(request.url ?? "/", fixture.adminUrl), {
          method,
          headers: { "X-API-KEY": fixture.adminKey, "content-type": "application/json" },
          body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        const payload = Buffer.from(await result.arrayBuffer());
        entry.status = result.status;
        if (gate?.action === "drop_after_forward") {
          response.destroy();
          return;
        }
        if (!response.destroyed) {
          response.writeHead(result.status, {
            "content-type": result.headers.get("content-type") ?? "application/json",
          });
          response.end(payload);
        }
      } catch (error) {
        if (!closing) failures.push(error);
        response.destroy();
      } finally {
        gate?.completed.resolve();
      }
    })();
    pending.add(operation);
    void operation.finally(() => pending.delete(operation));
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await bounded(
    new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    }),
    "fault proxy listen",
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fault proxy did not bind a TCP port");
  function releaseAll() {
    for (const gate of gates) gate.released.resolve();
  }
  return {
    adminUrl: `http://127.0.0.1:${address.port}/apisix/admin`,
    journal,
    releaseAll,
    interceptOnce(input: Intercept) {
      const gate = {
        ...input,
        entered: Promise.withResolvers<void>(),
        released: Promise.withResolvers<void>(),
        completed: Promise.withResolvers<void>(),
      };
      intercepts.push(gate);
      gates.add(gate);
      return {
        get entered() {
          return bounded(gate.entered.promise, `proxy ${input.method} ${input.path} entered`);
        },
        get completed() {
          return bounded(gate.completed.promise, `proxy ${input.method} ${input.path} completed`);
        },
        release() {
          gate.released.resolve();
        },
      };
    },
    close() {
      closing ??= (async () => {
        releaseAll();
        controller.abort();
        const stopped = new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        for (const socket of sockets) socket.destroy();
        await bounded(Promise.all([stopped, ...pending]), "fault proxy close");
        if (failures.length) throw new AggregateError(failures, "fault proxy forwarding failed");
      })();
      return closing;
    },
  };
}
