import { Buffer } from "node:buffer";
import { createConnection } from "node:net";
import { integrationRedisSlotLimit, testRedisUrlEnv } from "./integration-selection.mjs";

const MAX_REDIS_DB_INDEX = 2_147_483_647;

export function parseTestRedisUrl(rawUrl, envName = testRedisUrlEnv) {
  if (typeof rawUrl !== "string") throw new Error(`${envName} must be a valid Redis URL`);
  const value = rawUrl.trim();
  if (!value || [...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === "\\")) {
    throw new Error(`${envName} must be a valid Redis URL`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${envName} must be a valid Redis URL`);
  }
  if (url.protocol !== "redis:") throw new Error(`${envName} must use redis://; TLS is not supported`);
  if (!url.hostname) throw new Error(`${envName} must contain a Redis hostname`);
  if (/[?#]/u.test(value)) throw new Error(`${envName} must not contain a query or fragment`);

  const path = value.match(/^redis:\/\/[^/]*(\/.*)?$/iu)?.[1] ?? "";
  if (path !== "" && path !== "/" && !/^\/\d+$/u.test(path)) {
    throw new Error(`${envName} must contain a valid Redis database number`);
  }
  const db = path === "" || path === "/" ? 0 : Number(path.slice(1));
  if (!Number.isSafeInteger(db) || db < 0 || db > MAX_REDIS_DB_INDEX) {
    throw new Error(`${envName} must contain a Redis database number between 0 and ${MAX_REDIS_DB_INDEX}`);
  }

  const port = Number(url.port || "6379");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${envName} must contain a valid Redis port`);
  }

  let username;
  let password;
  try {
    username = url.username ? decodeURIComponent(url.username) : undefined;
    password = url.password ? decodeURIComponent(url.password) : undefined;
  } catch {
    throw new Error(`${envName} must contain valid percent-encoded Redis credentials`);
  }

  const normalized = new URL(url.href);
  normalized.port = String(port);
  normalized.pathname = `/${db}`;
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;

  return {
    baseUrl: normalized.href,
    host,
    connectHost: host,
    port,
    db,
    ...(username === undefined ? {} : { username }),
    ...(password === undefined ? {} : { password }),
  };
}

export function formatRedisSlotUrl(rawUrl, slot, envName = testRedisUrlEnv) {
  if (!Number.isInteger(slot) || slot < 0 || slot > integrationRedisSlotLimit) {
    throw new Error(`Redis slot must be an integer between 0 and ${integrationRedisSlotLimit}`);
  }
  const parsed = parseTestRedisUrl(rawUrl, envName);
  const slotUrl = new URL(parsed.baseUrl);
  slotUrl.pathname = `/${slot}`;
  return slotUrl.href;
}

export function redactRedisUrl(rawUrl) {
  const parsed = URL.parse(rawUrl);
  if (!parsed) return "<invalid redis url>";
  if (parsed.password) parsed.password = "***";
  return parsed.href;
}

function encodeRespCommand(parts) {
  const chunks = [`*${parts.length}\r\n`];
  for (const part of parts) {
    const value = String(part);
    chunks.push(`$${Buffer.byteLength(value, "utf8")}\r\n${value}\r\n`);
  }
  return Buffer.from(chunks.join(""), "utf8");
}

function parseRespFrame(buffer) {
  if (buffer.length < 3) return undefined;
  const crlf = buffer.indexOf("\r\n");
  if (crlf === -1) return undefined;

  const prefix = String.fromCharCode(buffer[0]);
  const line = buffer.subarray(1, crlf).toString("utf8");
  if (prefix === "+") return { frame: { type: "simple", value: line }, bytes: crlf + 2 };
  if (prefix === "-") return { frame: { type: "error", message: line }, bytes: crlf + 2 };
  if (prefix === ":") return { frame: { type: "integer", value: Number(line) }, bytes: crlf + 2 };
  if (prefix === "$") {
    const length = Number(line);
    if (!Number.isInteger(length) || length < -1) {
      throw new Error(`Invalid Redis RESP bulk string length: ${line}`);
    }
    if (length === -1) return { frame: { type: "bulk", value: null }, bytes: crlf + 2 };
    const totalBytes = crlf + 2 + length + 2;
    if (buffer.length < totalBytes) return undefined;
    if (buffer[crlf + 2 + length] !== 0x0d || buffer[crlf + 2 + length + 1] !== 0x0a) {
      throw new Error("Invalid Redis RESP bulk string terminator");
    }
    const value = buffer.subarray(crlf + 2, crlf + 2 + length).toString("utf8");
    return { frame: { type: "bulk", value }, bytes: totalBytes };
  }
  throw new Error(`Unsupported Redis RESP reply prefix: ${prefix}`);
}

export async function verifyRedisDatabaseSlotSupport(rawUrl, options = {}) {
  const { requiredSlot = integrationRedisSlotLimit, signal, timeoutMs = 5000 } = options;
  if (!Number.isInteger(requiredSlot) || requiredSlot < 0 || requiredSlot > MAX_REDIS_DB_INDEX) {
    throw new Error(`Invalid required Redis slot: ${requiredSlot}`);
  }
  const parsed = parseTestRedisUrl(rawUrl);
  const redacted = redactRedisUrl(parsed.baseUrl);
  signal?.throwIfAborted();

  let socket;
  let timer;
  let onAbort;
  let buffer = Buffer.alloc(0);
  let closedError;
  let waiter;

  const failAll = (error) => {
    if (!closedError) closedError = error;
    if (waiter) {
      const current = waiter;
      waiter = undefined;
      current.reject(error);
    }
  };

  const tryResolveWaiter = () => {
    if (!waiter) return;
    try {
      const parsedFrame = parseRespFrame(buffer);
      if (!parsedFrame) return;
      buffer = buffer.subarray(parsedFrame.bytes);
      const current = waiter;
      waiter = undefined;
      current.resolve(parsedFrame.frame);
    } catch (error) {
      failAll(error);
    }
  };

  const readReply = () => {
    const existing = parseRespFrame(buffer);
    if (existing) {
      buffer = buffer.subarray(existing.bytes);
      return Promise.resolve(existing.frame);
    }
    if (closedError) return Promise.reject(closedError);
    return new Promise((resolve, reject) => {
      waiter = { resolve, reject };
    });
  };

  const sendCommand = async (parts) => {
    signal?.throwIfAborted();
    if (closedError) throw closedError;
    const replyPromise = readReply();
    socket.write(encodeRespCommand(parts));
    return await replyPromise;
  };

  try {
    await new Promise((resolve, reject) => {
      socket = createConnection({ host: parsed.connectHost, port: parsed.port });
      let connected = false;
      const onError = (error) => {
        const wrapped = new Error(`Redis preflight connection failed for ${redacted}: ${error.message}`, {
          cause: error,
        });
        failAll(wrapped);
        if (!connected) reject(wrapped);
      };
      onAbort = () => {
        const reason = signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason));
        failAll(reason);
        socket.destroy();
        if (!connected) reject(reason);
      };
      timer = setTimeout(() => {
        const timeoutError = new Error(`Redis preflight timed out after ${timeoutMs}ms for ${redacted}`);
        failAll(timeoutError);
        socket.destroy();
        if (!connected) reject(timeoutError);
      }, timeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.on("error", onError);
      socket.on("close", () => {
        failAll(new Error(`Redis closed connection during preflight for ${redacted}`));
      });
      socket.on("data", (chunk) => {
        buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
        tryResolveWaiter();
      });
      socket.once("connect", () => {
        connected = true;
        resolve();
      });
    });

    if (parsed.username !== undefined) {
      const auth = await sendCommand(["AUTH", parsed.username, parsed.password ?? ""]);
      if (auth.type === "error") {
        throw new Error(`Redis preflight AUTH failed for ${redacted}: ${auth.message}`);
      }
    } else if (parsed.password !== undefined) {
      const auth = await sendCommand(["AUTH", parsed.password]);
      if (auth.type === "error") {
        throw new Error(`Redis preflight AUTH failed for ${redacted}: ${auth.message}`);
      }
    }

    const ping = await sendCommand(["PING"]);
    if (ping.type === "error") {
      throw new Error(`Redis preflight PING failed for ${redacted}: ${ping.message}`);
    }
    if ((ping.type !== "simple" && ping.type !== "bulk") || ping.value !== "PONG") {
      throw new Error(`Redis preflight PING returned unexpected response for ${redacted}`);
    }

    const select = await sendCommand(["SELECT", String(requiredSlot)]);
    if (select.type === "error") {
      throw new Error(
        `Redis at ${redacted} failed SELECT ${requiredSlot} (${select.message}); integration tests require Redis configured with at least ${requiredSlot + 1} logical databases (--databases ${requiredSlot + 1})`,
      );
    }
    if (select.type !== "simple" || select.value !== "OK") {
      throw new Error(`Redis preflight SELECT ${requiredSlot} returned unexpected response for ${redacted}`);
    }

    socket.write(encodeRespCommand(["QUIT"]));
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    socket?.destroy();
  }
}
