import { Buffer } from "node:buffer";
import { createConnection } from "node:net";
import { integrationRedisSlotLimit, testRedisUrlEnv } from "./integration-selection.mjs";

const MAX_REDIS_DB = 2_147_483_647;
const fail = (msg) => {
  throw new Error(msg);
};

export function parseTestRedisUrl(rawUrl, envName = testRedisUrlEnv) {
  const err = (msg) => fail(`${envName} ${msg}`);
  const value = typeof rawUrl === "string" ? rawUrl.trim() : "";
  const invalid = [...value].some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127 || c === "\\");
  const url = value && !invalid ? URL.parse(value) : null;
  if (!url) err("must be a valid Redis URL");
  if (url.protocol !== "redis:") err("must use redis://; TLS is not supported");
  if (!url.hostname) err("must contain a Redis hostname");
  if (/[?#]/u.test(value)) err("must not contain a query or fragment");
  const path = value.match(/^redis:\/\/[^/]*(\/.*)?$/iu)?.[1] ?? "";
  if (path && path !== "/" && !/^\/\d+$/u.test(path)) err("must contain a valid Redis database number");
  const db = path.length > 1 ? Number(path.slice(1)) : 0;
  if (!Number.isSafeInteger(db) || db < 0 || db > MAX_REDIS_DB)
    err(`must contain a Redis database number between 0 and ${MAX_REDIS_DB}`);
  const port = Number(url.port || "6379");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) err("must contain a valid Redis port");
  const dec = (v) => {
    try {
      return v ? decodeURIComponent(v) : undefined;
    } catch {
      err("must contain valid percent-encoded Redis credentials");
    }
  };
  const [username, password] = [dec(url.username), dec(url.password)];
  const baseUrl = Object.assign(new URL(url.href), { port: String(port), pathname: `/${db}` }).href;
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  return {
    baseUrl,
    host,
    connectHost: host,
    port,
    db,
    ...(username !== undefined && { username }),
    ...(password !== undefined && { password }),
  };
}

export function formatRedisSlotUrl(rawUrl, slot, envName = testRedisUrlEnv) {
  if (!Number.isInteger(slot) || slot < 0 || slot > integrationRedisSlotLimit)
    fail(`Redis slot must be an integer between 0 and ${integrationRedisSlotLimit}`);
  return Object.assign(new URL(parseTestRedisUrl(rawUrl, envName).baseUrl), { pathname: `/${slot}` }).href;
}

export function redactRedisUrl(rawUrl) {
  const parsed = URL.parse(rawUrl);
  if (!parsed) return "<invalid redis url>";
  if (parsed.password) parsed.password = "***";
  return parsed.href;
}

const encodeResp = (parts) =>
  Buffer.from(`*${parts.length}\r\n${parts.map((p) => `$${Buffer.byteLength(String(p))}\r\n${p}\r\n`).join("")}`);

function takeReply(buf) {
  const crlf = buf.indexOf("\r\n");
  if (crlf === -1) return undefined;
  const [kind, line] = [String.fromCharCode(buf[0]), buf.subarray(1, crlf).toString("utf8")];
  if ("+-:".includes(kind)) return { kind, value: line, rest: buf.subarray(crlf + 2) };
  if (kind !== "$") fail(`Unsupported Redis RESP reply prefix: ${kind}`);
  const len = Number(line);
  if (!Number.isInteger(len) || len < -1) fail(`Invalid Redis RESP bulk string length: ${line}`);
  if (len === -1) return { kind, value: null, rest: buf.subarray(crlf + 2) };
  const end = crlf + 2 + len;
  if (buf.length < end + 2) return undefined;
  if (buf[end] !== 13 || buf[end + 1] !== 10) fail("Invalid Redis RESP bulk string terminator");
  return { kind, value: buf.subarray(crlf + 2, end).toString("utf8"), rest: buf.subarray(end + 2) };
}

export async function verifyRedisDatabaseSlotSupport(rawUrl, opts = {}) {
  const { requiredSlot = integrationRedisSlotLimit, signal, timeoutMs = 5000 } = opts;
  if (!Number.isInteger(requiredSlot) || requiredSlot < 0 || requiredSlot > MAX_REDIS_DB)
    fail(`Invalid required Redis slot: ${requiredSlot}`);
  const { baseUrl, connectHost, port, username, password } = parseTestRedisUrl(rawUrl);
  const redacted = redactRedisUrl(baseUrl);
  signal?.throwIfAborted();
  const auth =
    username !== undefined ? ["AUTH", username, password ?? ""] : password !== undefined ? ["AUTH", password] : null;
  const cmds = [
    ...(auth ? [["AUTH", auth]] : []),
    ["PING", ["PING"], (r) => "+$".includes(r.kind) && r.value === "PONG"],
    [`SELECT ${requiredSlot}`, ["SELECT", String(requiredSlot)], (r) => r.kind === "+" && r.value === "OK"],
  ];

  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: connectHost, port });
    let [buf, step, settled] = [Buffer.alloc(0), 0, false];
    const done = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      socket.destroy();
      err ? reject(err) : resolve();
    };
    const abort = (msg, cause) => done(new Error(msg, cause ? { cause } : undefined));
    const onAbort = () => done(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
    const timer = setTimeout(() => abort(`Redis preflight timed out after ${timeoutMs}ms for ${redacted}`), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.on("error", (e) => abort(`Redis preflight connection failed for ${redacted}: ${e.message}`, e));
    socket.on("close", () => abort(`Redis closed connection during preflight for ${redacted}`));
    socket.once("connect", () => socket.write(encodeResp(cmds[0][1])));
    socket.on("data", (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      try {
        for (let r = takeReply(buf); r; r = takeReply(buf)) {
          buf = r.rest;
          const [name, , ok] = cmds[step++];
          if (r.kind === "-") {
            const msg = name.startsWith("SELECT")
              ? `Redis at ${redacted} failed ${name} (${r.value}); integration tests require Redis configured with at least ${requiredSlot + 1} logical databases (--databases ${requiredSlot + 1})`
              : `Redis preflight ${name} failed for ${redacted}: ${r.value}`;
            return abort(msg);
          }
          if (ok && !ok(r)) return abort(`Redis preflight ${name} returned unexpected response for ${redacted}`);
          if (step === cmds.length) {
            socket.write(encodeResp(["QUIT"]));
            return done();
          }
          socket.write(encodeResp(cmds[step][1]));
        }
      } catch (e) {
        done(e);
      }
    });
  });
}
