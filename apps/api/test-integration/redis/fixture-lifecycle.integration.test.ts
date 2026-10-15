import { afterEach, expect, test } from "bun:test";
import { connect, createServer } from "node:net";
import Redis from "ioredis";
import { closeApiRedisConnection, ownApiTestExecutor, resetApiRedisTestDatabase } from "./fixture-lifecycle";
import { fixture } from "./root-authentication.fixture";

afterEach(resetApiRedisTestDatabase);

test.each([
  { name: "reset failure", resetFails: true, closeFails: false, messages: ["ERR API fixture reset fault"] },
  {
    name: "control close failure",
    resetFails: false,
    closeFails: true,
    messages: ["ERR API fixture control close fault"],
  },
  {
    name: "reset and control close failures",
    resetFails: true,
    closeFails: true,
    messages: ["ERR API fixture reset fault", "ERR API fixture control close fault"],
  },
])("API reset preserves $name and disconnects its control connection", async ({ resetFails, closeFails, messages }) => {
  const originalUrl = process.env.IAM_API_TEST_REDIS_URL!;
  const url = new URL(originalUrl);
  const upstreamAddress = { host: url.hostname, port: Number(url.port) };
  let disconnected!: () => void;
  const controlDisconnected = new Promise<void>((resolve) => {
    disconnected = resolve;
  });
  const proxy = createServer((downstream) => {
    const upstream = connect(upstreamAddress);
    let pending = Buffer.alloc(0);
    downstream.on("data", (data) => {
      pending = Buffer.concat([pending, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
      for (let frame = redisCommandFrame(pending); frame; frame = redisCommandFrame(pending)) {
        pending = pending.subarray(frame.bytes);
        if (frame.command === "flushdb" && resetFails) downstream.write("-ERR API fixture reset fault\r\n");
        else if (frame.command === "quit" && closeFails) downstream.write("-ERR API fixture control close fault\r\n");
        else upstream.write(frame.data);
      }
    });
    upstream.pipe(downstream);
    downstream.on("close", () => {
      upstream.destroy();
      disconnected();
    });
    upstream.on("close", () => downstream.destroy());
    downstream.on("error", () => upstream.destroy());
    upstream.on("error", () => downstream.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("Missing reset fault proxy port");
  url.port = String(address.port);
  let failure: unknown;
  try {
    process.env.IAM_API_TEST_REDIS_URL = url.href;
    ownApiTestExecutor(async () => {});
    try {
      await resetApiRedisTestDatabase();
    } catch (error) {
      failure = error;
    }
    await controlDisconnected;
    const errors = failure instanceof AggregateError ? failure.errors : [failure];
    expect(errors.map((error) => (error instanceof Error ? error.message : String(error)))).toEqual([...messages]);
    expect(failure instanceof AggregateError).toBe(resetFails && closeFails);
  } finally {
    process.env.IAM_API_TEST_REDIS_URL = originalUrl;
    await new Promise<void>((resolve, reject) => proxy.close((error) => (error ? reject(error) : resolve())));
  }
});

/** Parse complete requests so fault replies cannot discard pipelined Redis handshakes. */
function redisCommandFrame(data: Buffer): { command: string; bytes: number; data: Buffer } | undefined {
  const arrayEnd = data.indexOf("\r\n");
  if (arrayEnd < 0) return;
  const count = Number(data.subarray(1, arrayEnd).toString());
  let cursor = arrayEnd + 2;
  let command = "";
  for (let index = 0; index < count; index++) {
    const sizeEnd = data.indexOf("\r\n", cursor);
    if (sizeEnd < 0) return;
    const size = Number(data.subarray(cursor + 1, sizeEnd).toString());
    const end = sizeEnd + 2 + size;
    if (data.length < end + 2) return;
    if (index === 0)
      command = data
        .subarray(sizeEnd + 2, end)
        .toString()
        .toLowerCase();
    cursor = end + 2;
  }
  return { command, bytes: cursor, data: data.subarray(0, cursor) };
}

test("closing one API fixture stops its executors without clearing the shared case database", async () => {
  const observer = new Redis(process.env.IAM_API_TEST_REDIS_URL!, { maxRetriesPerRequest: 0 });
  const closeObserver = ownApiTestExecutor(() => closeApiRedisConnection(observer));
  const first = await fixture();
  const peer = await fixture();
  try {
    await first.login();
    const peerRoot = await peer.login();
    const stateBefore = await observer.dbsize();
    await first.scope.close();
    expect(await observer.dbsize()).toBe(stateBefore);
    const response = await peer.app.request("/sso/authorize?client=iam&redirectUrl=https://app.example/callback", {
      headers: { Cookie: `global_session=${peerRoot}` },
    });
    expect(response.status).toBe(302);
    await peer.close();
    await first.close();
    await resetApiRedisTestDatabase();
    const next = new Redis(process.env.IAM_API_TEST_REDIS_URL!, { maxRetriesPerRequest: 0 });
    try {
      expect(await next.dbsize()).toBe(0);
    } finally {
      await closeApiRedisConnection(next);
    }
  } finally {
    await peer.scope.close();
    await first.scope.close();
    await closeObserver();
  }
});

test("Root Auth initialization failure stops previously created scopes and the network connection", async () => {
  const url = new URL(process.env.IAM_API_TEST_REDIS_URL!);
  const upstreamAddress = { host: url.hostname, port: Number(url.port) };
  let accepted = 0;
  const proxy = createServer((downstream) => {
    const failNetworkPing = ++accepted === 3;
    const upstream = connect(upstreamAddress);
    downstream.on("data", (data) => {
      if (failNetworkPing && data.toString().toLowerCase().includes("\r\nping\r\n"))
        downstream.write("-ERR injected network bootstrap failure\r\n");
      else upstream.write(data);
    });
    upstream.pipe(downstream);
    downstream.on("close", () => upstream.destroy());
    upstream.on("close", () => downstream.destroy());
    downstream.on("error", () => upstream.destroy());
    upstream.on("error", () => downstream.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const closeProxy = ownApiTestExecutor(
    () => new Promise<void>((resolve, reject) => proxy.close((error) => (error ? reject(error) : resolve()))),
  );
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("Missing setup fault proxy port");
  url.port = String(address.port);
  let failure: unknown;
  try {
    await fixture(30, url.href);
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ message: "ERR injected network bootstrap failure" });
  await closeProxy();
  expect(proxy.listening).toBe(false);
});

test("API reset stops a scope still awaiting PING before resetting the database", async () => {
  const url = new URL(process.env.IAM_API_TEST_REDIS_URL!);
  const upstreamAddress = { host: url.hostname, port: Number(url.port) };
  let pingReceived!: () => void;
  const pendingPing = new Promise<void>((resolve) => {
    pingReceived = resolve;
  });
  const proxy = createServer((downstream) => {
    const upstream = connect(upstreamAddress);
    downstream.on("data", (data) => {
      if (data.toString().toLowerCase().includes("\r\nping\r\n")) pingReceived();
      else upstream.write(data);
    });
    upstream.pipe(downstream);
    downstream.on("close", () => upstream.destroy());
    upstream.on("close", () => downstream.destroy());
    downstream.on("error", () => upstream.destroy());
    upstream.on("error", () => downstream.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  ownApiTestExecutor(
    () => new Promise<void>((resolve, reject) => proxy.close((error) => (error ? reject(error) : resolve()))),
  );
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("Missing stalled PING proxy port");
  url.port = String(address.port);
  const initializing = fixture(30, url.href).then(
    (value) => ({ value, failure: undefined }),
    (failure) => ({ value: undefined, failure }),
  );
  await pendingPing;
  await resetApiRedisTestDatabase();
  const outcome = await initializing;
  expect(outcome.value).toBeUndefined();
  expect(outcome.failure).toBeInstanceOf(Error);
  expect(proxy.listening).toBe(false);
  const next = new Redis(process.env.IAM_API_TEST_REDIS_URL!, { maxRetriesPerRequest: 0 });
  try {
    expect(await next.dbsize()).toBe(0);
  } finally {
    await closeApiRedisConnection(next);
  }
});
