import type { Socket } from "node:net";
import type {
  CleanupRef,
  ClientBinding,
  IssuedCredential,
  PrincipalSession,
  RenewalPolicy,
} from "../session/kernel/model";
import { createServer } from "node:net";
import { createSessionKernelConfig } from "../session/kernel/config";
import { createCurrentLookupHash } from "../session/kernel/hmac";
import { createSessionKernelKeyBuilder } from "../session/kernel/keys";

export interface ProcessSmokeRedisCommand {
  readonly name: string;
  readonly args: readonly string[];
}

export interface CreateProcessSmokeRedisServerOptions {
  readonly hostname?: string;
  readonly subjectAccessRepairBacklogMetrics?: {
    readonly count: number;
    readonly oldestAgeMs: number | null;
  };
  readonly values?: ReadonlyMap<string, string>;
}

interface ProcessSmokeRedisSeedPort {
  set: (key: string, value: string) => void;
}

interface ProcessSmokeLifecycleSeedOptions {
  readonly cleanupRefs?: readonly CleanupRef[];
  readonly lookupHmacId: string;
  readonly lookupHmacSecret: string;
  readonly namespace: string;
  readonly now?: number;
  readonly subjectAccessTransitionId: string;
  readonly subjectIdentifier: string;
  readonly ttlMs?: number;
}

interface ProcessSmokeSessionSeedOptions
  extends ProcessSmokeLifecycleSeedOptions {
  readonly externalToken: string;
}

export interface SeedProcessSmokePrincipalSessionOptions
  extends ProcessSmokeSessionSeedOptions {
  readonly principalSessionId: string;
}

export interface SeedProcessSmokeClientBindingOptions
  extends ProcessSmokeLifecycleSeedOptions {
  readonly bindingId: string;
  readonly clientCode: string;
  readonly metadata?: Record<string, unknown>;
  readonly principalSessionId: string;
  readonly protocol: string;
  readonly renewalPolicy: RenewalPolicy;
}

export interface SeedProcessSmokeCredentialOptions
  extends ProcessSmokeSessionSeedOptions {
  readonly bindingId?: string;
  readonly clientCode: string;
  readonly credentialId: string;
  readonly credentialType: string;
  readonly metadata?: Record<string, unknown>;
  readonly principalSessionId: string;
  readonly protocol: string;
  readonly renewalPolicy?: RenewalPolicy;
}

export async function createProcessSmokeRedisServer(
  options: CreateProcessSmokeRedisServerOptions = {},
) {
  const hostname = options.hostname ?? "127.0.0.1";
  const subjectAccessRepairBacklogMetrics
    = options.subjectAccessRepairBacklogMetrics ?? {
      count: 0,
      oldestAgeMs: null,
    };
  validateRepairBacklogMetrics(subjectAccessRepairBacklogMetrics);
  const values = new Map(options.values);
  const sortedSets = new Map<string, Map<string, number>>();
  const commands: ProcessSmokeRedisCommand[] = [];
  const sockets = new Set<Socket>();
  const transactions = new Map<Socket, ProcessSmokeRedisCommand[]>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {
      // Owned child trees may be force-terminated while their Redis sockets
      // are open. The fixture intentionally treats peer resets as cleanup.
    });
    socket.once("close", () => {
      sockets.delete(socket);
      transactions.delete(socket);
    });
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length > 0) {
        const parsed = parseCommand(pending);
        if (parsed === undefined)
          return;
        pending = pending.subarray(parsed.bytesConsumed);
        const [nameRaw = "", ...args] = parsed.parts;
        const name = nameRaw.toLowerCase();
        commands.push({ name, args });
        try {
          handleCommand(
            socket,
            values,
            sortedSets,
            transactions,
            subjectAccessRepairBacklogMetrics,
            name,
            args,
          );
        }
        catch (error) {
          socket.write(errorString(
            error instanceof Error
              ? error.message
              : "process smoke Redis command failed",
          ));
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, hostname, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("process smoke Redis server did not bind a TCP port");

  return {
    hostname,
    port: address.port,
    commands,
    set(key: string, value: string) {
      values.set(key, value);
    },
    zadd(key: string, score: number, member: string) {
      return addSortedSetMember(sortedSets, key, score, member);
    },
    delete(key: string) {
      const existed = values.delete(key);
      return sortedSets.delete(key) || existed;
    },
    async close() {
      for (const socket of sockets)
        socket.destroy();
      if (!server.listening)
        return;
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    },
  };
}

export function seedProcessSmokePrincipalSession(
  redis: ProcessSmokeRedisSeedPort,
  options: SeedProcessSmokePrincipalSessionOptions,
) {
  const seed = createSessionSeed(options);
  const principalSession: PrincipalSession = {
    version: 1,
    subjectAccessTransitionId: options.subjectAccessTransitionId,
    sessionKind: "browser_user",
    principalSessionId: options.principalSessionId,
    externalTokenLookupHash: seed.lookupHash,
    lookupKeyId: options.lookupHmacId,
    principal: {
      principalType: "user",
      subjectId: options.subjectIdentifier,
    },
    authTime: seed.now,
    lastActiveAt: seed.now,
    expiresAt: seed.expiresAt,
    absoluteExpiresAt: seed.expiresAt,
    amr: ["pwd"],
    cleanupRefs: [...(options.cleanupRefs ?? [])],
  };
  redis.set(
    seed.keys.lookup("principal_session", seed.lookupHash),
    options.principalSessionId,
  );
  redis.set(
    seed.keys.active("principal_session", options.principalSessionId),
    JSON.stringify(principalSession),
  );
  return principalSession;
}

export function seedProcessSmokeCredential(
  redis: ProcessSmokeRedisSeedPort,
  options: SeedProcessSmokeCredentialOptions,
) {
  const seed = createSessionSeed(options);
  const credential: IssuedCredential = {
    version: 1,
    subjectAccessTransitionId: options.subjectAccessTransitionId,
    credentialId: options.credentialId,
    protocol: options.protocol,
    credentialType: options.credentialType,
    lookupHash: seed.lookupHash,
    lookupKeyId: options.lookupHmacId,
    principalSessionId: options.principalSessionId,
    bindingId: options.bindingId,
    clientCode: options.clientCode,
    principal: {
      principalType: "user",
      subjectId: options.subjectIdentifier,
    },
    renewalPolicy: options.renewalPolicy ?? "fixed_at_issue",
    issuedAt: seed.now,
    expiresAt: seed.expiresAt,
    metadata: options.metadata,
    cleanupRefs: [...(options.cleanupRefs ?? [])],
  };
  redis.set(
    seed.keys.lookup("credential", seed.lookupHash),
    options.credentialId,
  );
  redis.set(
    seed.keys.active("credential", options.credentialId),
    JSON.stringify(credential),
  );
  return credential;
}

export function seedProcessSmokeClientBinding(
  redis: ProcessSmokeRedisSeedPort,
  options: SeedProcessSmokeClientBindingOptions,
) {
  const seed = createLifecycleSeed(options);
  const binding: ClientBinding = {
    version: 1,
    subjectAccessTransitionId: options.subjectAccessTransitionId,
    bindingId: options.bindingId,
    protocol: options.protocol,
    clientCode: options.clientCode,
    principalSessionId: options.principalSessionId,
    principal: {
      principalType: "user",
      subjectId: options.subjectIdentifier,
    },
    authTime: seed.now,
    renewalPolicy: options.renewalPolicy,
    issuedAt: seed.now,
    expiresAt: seed.expiresAt,
    metadata: options.metadata,
    cleanupRefs: [...(options.cleanupRefs ?? [])],
  };
  redis.set(
    seed.keys.active("client_binding", options.bindingId),
    JSON.stringify(binding),
  );
  return binding;
}

function createSessionSeed(options: ProcessSmokeSessionSeedOptions) {
  const seed = createLifecycleSeed(options);
  const config = createSessionKernelConfig({
    namespace: options.namespace,
    principalIdleTtlMs: options.ttlMs ?? 60 * 60 * 1000,
    principalAbsoluteTtlMs: options.ttlMs ?? 60 * 60 * 1000,
    lookupHmacKeys: {
      current: {
        id: options.lookupHmacId,
        secret: options.lookupHmacSecret,
      },
    },
  });
  return {
    ...seed,
    lookupHash: createCurrentLookupHash(options.externalToken, config).lookupHash,
  };
}

function createLifecycleSeed(options: ProcessSmokeLifecycleSeedOptions) {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? 60 * 60 * 1000;
  return {
    expiresAt: now + ttlMs,
    keys: createSessionKernelKeyBuilder(options.namespace),
    now,
  };
}

function handleCommand(
  socket: Socket,
  values: Map<string, string>,
  sortedSets: Map<string, Map<string, number>>,
  transactions: Map<Socket, ProcessSmokeRedisCommand[]>,
  subjectAccessRepairBacklogMetrics: {
    readonly count: number;
    readonly oldestAgeMs: number | null;
  },
  name: string,
  args: string[],
) {
  if (name === "multi") {
    if (transactions.has(socket)) {
      socket.write(errorString("MULTI calls can not be nested"));
      return;
    }
    transactions.set(socket, []);
    socket.write(simpleString("OK"));
    return;
  }
  if (name === "discard") {
    if (!transactions.delete(socket)) {
      socket.write(errorString("DISCARD without MULTI"));
      return;
    }
    socket.write(simpleString("OK"));
    return;
  }
  if (name === "exec") {
    const transaction = transactions.get(socket);
    if (transaction === undefined) {
      socket.write(errorString("EXEC without MULTI"));
      return;
    }
    transactions.delete(socket);
    socket.write(array(transaction.map(command =>
      executeTransactionCommand(values, sortedSets, command))));
    return;
  }

  const transaction = transactions.get(socket);
  if (transaction !== undefined) {
    transaction.push({ name, args });
    socket.write(simpleString("QUEUED"));
    return;
  }

  switch (name) {
    case "auth":
    case "client":
    case "config":
    case "select":
      socket.write(simpleString("OK"));
      return;
    case "command":
      socket.write(array([]));
      return;
    case "eval":
      socket.write(executeSupportedEval(
        values,
        subjectAccessRepairBacklogMetrics,
        args,
      ));
      return;
    case "del":
    case "unlink":
      socket.write(integer(deleteValues(values, sortedSets, args)));
      return;
    case "echo":
      socket.write(bulkString(args[0] ?? ""));
      return;
    case "exists":
      socket.write(integer(args.filter(key =>
        values.has(key) || sortedSets.has(key)).length));
      return;
    case "incr":
      socket.write(integer(incrementValue(values, args[0] ?? "")));
      return;
    case "expire":
    case "pexpireat":
    case "publish":
      socket.write(integer(0));
      return;
    case "get":
      socket.write(bulkString(values.get(args[0] ?? "") ?? null));
      return;
    case "getdel": {
      const key = args[0] ?? "";
      const value = values.get(key) ?? null;
      values.delete(key);
      socket.write(bulkString(value));
      return;
    }
    case "info":
      socket.write(bulkString("# Server\r\nredis_version:7.0.0\r\n"));
      return;
    case "mget":
      socket.write(array(args.map(key => values.get(key) ?? null)));
      return;
    case "ping":
      socket.write(args.length === 0
        ? simpleString("PONG")
        : bulkString(args[0] ?? ""));
      return;
    case "psubscribe":
    case "subscribe": {
      const kind = name;
      args.forEach((channel, index) => {
        socket.write(array([kind, channel, index + 1]));
      });
      return;
    }
    case "scan": {
      const matchIndex = args.findIndex(arg => arg.toLowerCase() === "match");
      const pattern = matchIndex < 0 ? "*" : (args[matchIndex + 1] ?? "*");
      const matched = [...new Set([...values.keys(), ...sortedSets.keys()])]
        .filter(key => matchesProcessSmokeRedisGlob(pattern, key))
        .sort();
      socket.write(array(["0", matched]));
      return;
    }
    case "punsubscribe":
    case "unsubscribe": {
      const kind = name;
      const channels = args.length === 0 ? [""] : args;
      channels.forEach((channel, index) => {
        socket.write(array([kind, channel, Math.max(0, channels.length - index - 1)]));
      });
      return;
    }
    case "quit":
      socket.end(simpleString("OK"));
      return;
    case "set":
      values.set(args[0] ?? "", args[1] ?? "");
      socket.write(simpleString("OK"));
      return;
    case "ttl":
      socket.write(integer(
        values.has(args[0] ?? "") || sortedSets.has(args[0] ?? "")
          ? -1
          : -2,
      ));
      return;
    case "zadd":
      socket.write(integer(addSortedSetMember(
        sortedSets,
        args[0] ?? "",
        Number(args[1]),
        args[2] ?? "",
      )));
      return;
    case "zcard":
      socket.write(integer(sortedSets.get(args[0] ?? "")?.size ?? 0));
      return;
    case "zrange":
    case "zrevrange":
      socket.write(array(readSortedSetRange(
        sortedSets,
        args[0] ?? "",
        Number(args[1]),
        Number(args[2]),
        name === "zrevrange",
      )));
      return;
    case "zrem":
      socket.write(integer(removeSortedSetMembers(
        sortedSets,
        args[0] ?? "",
        args.slice(1),
      )));
      return;
    case "zremrangebyscore":
      socket.write(integer(removeSortedSetRangeByScore(
        sortedSets,
        args[0] ?? "",
        args[1] ?? "-inf",
        args[2] ?? "+inf",
      )));
      return;
    default:
      socket.write(errorString(`unsupported process smoke Redis command: ${name}`));
  }
}

function executeSupportedEval(
  values: Map<string, string>,
  subjectAccessRepairBacklogMetrics: {
    readonly count: number;
    readonly oldestAgeMs: number | null;
  },
  args: readonly string[],
) {
  const script = args[0] ?? "";
  const keyCount = Number(args[1]);

  if (keyCount === 1 && script.startsWith(
    "-- authorization-grant-redemption:",
  )) {
    return executeAuthorizationGrantHappyPath(values, script, args);
  }

  if (
    script.includes("-- session-kernel-consume-artifact-v1")
    && keyCount === 4
  ) {
    const activeKey = args[2] ?? "";
    const lookupKey = args[3] ?? "";
    const tombstoneKey = args[4] ?? "";
    const lookupTombstoneKey = args[5] ?? "";
    const serializedArtifact = args[6] ?? "";
    const artifactId = args[7] ?? "";
    const serializedTombstone = args[8] ?? "";
    if (
      values.has(tombstoneKey)
      || values.has(lookupTombstoneKey)
      || values.get(activeKey) !== serializedArtifact
      || values.get(lookupKey) !== artifactId
    ) {
      return integer(0);
    }

    values.set(tombstoneKey, serializedTombstone);
    values.set(lookupTombstoneKey, serializedTombstone);
    values.delete(activeKey);
    values.delete(lookupKey);
    return integer(1);
  }

  if (
    script.startsWith("-- subject-access:inspect-repair-backlog\n")
    && keyCount === 2
  ) {
    return array([
      String(subjectAccessRepairBacklogMetrics.count),
      subjectAccessRepairBacklogMetrics.oldestAgeMs === null
        ? ""
        : String(subjectAccessRepairBacklogMetrics.oldestAgeMs),
    ]);
  }

  if (
    script.startsWith("-- custom-sso-client-runtime:read\n")
    && keyCount === 3
  ) {
    const cacheKey = args[2] ?? "";
    const mutationKey = args[3] ?? "";
    const generationKey = args[4] ?? "";
    if (values.has(mutationKey))
      return array(["blocked"]);

    const generation = values.get(generationKey) ?? "0";
    const cached = values.get(cacheKey);
    return array(cached === undefined
      ? ["ready", generation]
      : ["ready", generation, cached]);
  }

  if (
    script.startsWith("-- custom-sso-client-runtime:publish\n")
    && keyCount === 3
  ) {
    const cacheKey = args[2] ?? "";
    const mutationKey = args[3] ?? "";
    const generationKey = args[4] ?? "";
    const expectedGeneration = args[5] ?? "";
    const serialized = args[6] ?? "";
    if (values.has(mutationKey))
      return integer(0);

    const generation = values.get(generationKey) ?? "0";
    if (generation !== expectedGeneration)
      return integer(0);

    values.set(cacheKey, serialized);
    return integer(1);
  }

  return array([]);
}

function executeAuthorizationGrantHappyPath(
  values: Map<string, string>,
  script: string,
  args: readonly string[],
) {
  const key = args[2] ?? "";
  const operation = script.slice(
    "-- authorization-grant-redemption:".length,
  ).split("\n", 1)[0];
  if (operation === "initialize") {
    const serialized = args[3] ?? "";
    values.set(key, serialized);
    return array(["created"]);
  }

  const grantId = args[3] ?? "";
  const attemptId = args[4] ?? "";
  if (operation === "begin") {
    const expiresAt = readProcessSmokeGrantExpiry(values.get(key), grantId);
    const leaseDurationMs = Number(args[5]);
    const leaseExpiresAt = Math.min(expiresAt, Date.now() + leaseDurationMs);
    values.set(key, JSON.stringify({
      version: 1,
      grantId,
      state: "redeeming",
      attemptId,
      leaseExpiresAt,
      expiresAt,
    }));
    return array([
      "reserved",
      String(leaseExpiresAt),
      String(expiresAt),
    ]);
  }

  if (operation === "consume") {
    const expiresAt = readProcessSmokeGrantExpiry(values.get(key), grantId);
    values.set(key, JSON.stringify({
      version: 1,
      grantId,
      state: "consumed",
      expiresAt,
    }));
    return array(["consumed"]);
  }

  return array([]);
}

function readProcessSmokeGrantExpiry(
  serialized: string | undefined,
  grantId: string,
): number {
  if (serialized === undefined)
    throw new Error("process smoke Authorization Grant is missing");
  try {
    const record = JSON.parse(serialized) as {
      grantId?: unknown;
      expiresAt?: unknown;
    };
    if (
      record.grantId !== grantId
      || !Number.isSafeInteger(record.expiresAt)
    ) {
      throw new TypeError("process smoke Authorization Grant is invalid");
    }
    return record.expiresAt as number;
  }
  catch (error) {
    throw new TypeError("process smoke Authorization Grant is invalid", {
      cause: error,
    });
  }
}

function validateRepairBacklogMetrics(metrics: {
  readonly count: number;
  readonly oldestAgeMs: number | null;
}) {
  if (!Number.isSafeInteger(metrics.count) || metrics.count < 0) {
    throw new RangeError(
      "process smoke repair backlog count must be a non-negative safe integer",
    );
  }
  if (
    (metrics.count === 0 && metrics.oldestAgeMs !== null)
    || (metrics.count > 0 && (
      metrics.oldestAgeMs === null
      || !Number.isSafeInteger(metrics.oldestAgeMs)
      || metrics.oldestAgeMs < 0
    ))
  ) {
    throw new RangeError(
      "process smoke repair backlog oldest age must match the backlog count",
    );
  }
}

function executeTransactionCommand(
  values: Map<string, string>,
  sortedSets: Map<string, Map<string, number>>,
  command: ProcessSmokeRedisCommand,
): number | string | null {
  switch (command.name) {
    case "del":
      return deleteValues(values, sortedSets, command.args);
    case "exists":
      return command.args.filter(key =>
        values.has(key) || sortedSets.has(key)).length;
    case "get":
      return values.get(command.args[0] ?? "") ?? null;
    case "incr":
      return incrementValue(values, command.args[0] ?? "");
    case "set":
      values.set(command.args[0] ?? "", command.args[1] ?? "");
      return "OK";
    case "pexpireat":
      return 0;
    case "zadd":
      return addSortedSetMember(
        sortedSets,
        command.args[0] ?? "",
        Number(command.args[1]),
        command.args[2] ?? "",
      );
    case "zrem":
      return removeSortedSetMembers(
        sortedSets,
        command.args[0] ?? "",
        command.args.slice(1),
      );
    default:
      throw new Error(
        `unsupported process smoke Redis transaction command: ${command.name}`,
      );
  }
}

function deleteValues(
  values: Map<string, string>,
  sortedSets: Map<string, Map<string, number>>,
  keys: readonly string[],
) {
  let deleted = 0;
  for (const key of keys) {
    const existed = values.delete(key);
    if (sortedSets.delete(key) || existed)
      deleted += 1;
  }
  return deleted;
}

function addSortedSetMember(
  sortedSets: Map<string, Map<string, number>>,
  key: string,
  score: number,
  member: string,
) {
  if (!Number.isFinite(score))
    throw new TypeError("process smoke Redis ZADD score must be finite");
  const set = sortedSets.get(key) ?? new Map<string, number>();
  const added = set.has(member) ? 0 : 1;
  set.set(member, score);
  sortedSets.set(key, set);
  return added;
}

function readSortedSetRange(
  sortedSets: Map<string, Map<string, number>>,
  key: string,
  start: number,
  stop: number,
  reverse: boolean,
) {
  const ordered = [...(
    sortedSets.get(key) ?? new Map<string, number>()
  ).entries()]
    .sort(([leftMember, leftScore], [rightMember, rightScore]) =>
      leftScore - rightScore || leftMember.localeCompare(rightMember))
    .map(([member]) => member);
  if (reverse)
    ordered.reverse();
  const normalizedStart = start < 0 ? Math.max(0, ordered.length + start) : start;
  const normalizedStop = stop < 0 ? ordered.length + stop : stop;
  if (normalizedStart >= ordered.length || normalizedStop < normalizedStart)
    return [];
  return ordered.slice(normalizedStart, normalizedStop + 1);
}

function removeSortedSetMembers(
  sortedSets: Map<string, Map<string, number>>,
  key: string,
  members: readonly string[],
) {
  const set = sortedSets.get(key);
  if (set === undefined)
    return 0;
  let removed = 0;
  for (const member of members) {
    if (set.delete(member))
      removed += 1;
  }
  if (set.size === 0)
    sortedSets.delete(key);
  return removed;
}

function removeSortedSetRangeByScore(
  sortedSets: Map<string, Map<string, number>>,
  key: string,
  minimum: string,
  maximum: string,
) {
  const set = sortedSets.get(key);
  if (set === undefined)
    return 0;
  const min = minimum === "-inf" ? Number.NEGATIVE_INFINITY : Number(minimum);
  const max = maximum === "+inf" || maximum === "inf"
    ? Number.POSITIVE_INFINITY
    : Number(maximum);
  let removed = 0;
  for (const [member, score] of set) {
    if (score >= min && score <= max) {
      set.delete(member);
      removed += 1;
    }
  }
  if (set.size === 0)
    sortedSets.delete(key);
  return removed;
}

function incrementValue(values: Map<string, string>, key: string) {
  const current = values.get(key);
  const parsed = current === undefined ? 0 : Number(current);
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError(
      "process smoke Redis INCR requires a safe integer fixture value",
    );
  }
  const incremented = parsed + 1;
  values.set(key, String(incremented));
  return incremented;
}

function matchesProcessSmokeRedisGlob(pattern: string, value: string) {
  const expression = pattern
    .split("*")
    .map(part => part.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`, "u").test(value);
}

function parseCommand(buffer: Buffer) {
  const countLine = readLine(buffer, 0);
  if (countLine === undefined)
    return undefined;
  if (countLine.value[0] !== 0x2A)
    throw new Error("process smoke Redis server only accepts RESP arrays");
  const count = Number(countLine.value.subarray(1).toString("ascii"));
  if (!Number.isInteger(count) || count < 0)
    throw new Error("process smoke Redis server received an invalid array length");

  const parts: string[] = [];
  let offset = countLine.nextOffset;
  for (let index = 0; index < count; index += 1) {
    const lengthLine = readLine(buffer, offset);
    if (lengthLine === undefined)
      return undefined;
    if (lengthLine.value[0] !== 0x24)
      throw new Error("process smoke Redis server only accepts bulk command fields");
    const byteLength = Number(lengthLine.value.subarray(1).toString("ascii"));
    if (!Number.isInteger(byteLength) || byteLength < 0)
      throw new Error("process smoke Redis server received an invalid bulk length");
    const end = lengthLine.nextOffset + byteLength;
    if (buffer.length < end + 2)
      return undefined;
    if (buffer[end] !== 0x0D || buffer[end + 1] !== 0x0A)
      throw new Error("process smoke Redis server received an invalid bulk terminator");
    parts.push(buffer.subarray(lengthLine.nextOffset, end).toString("utf8"));
    offset = end + 2;
  }
  return { parts, bytesConsumed: offset };
}

function readLine(buffer: Buffer, offset: number) {
  const end = buffer.indexOf("\r\n", offset);
  if (end < 0)
    return undefined;
  return {
    value: buffer.subarray(offset, end),
    nextOffset: end + 2,
  };
}

function simpleString(value: string) {
  return `+${value}\r\n`;
}

function errorString(value: string) {
  return `-ERR ${value}\r\n`;
}

function integer(value: number) {
  return `:${value}\r\n`;
}

function bulkString(value: string | null) {
  if (value === null)
    return "$-1\r\n";
  return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
}

type RespValue = number | string | null | RespValue[];

function array(values: RespValue[]): string {
  return `*${values.length}\r\n${values.map((value) => {
    if (Array.isArray(value))
      return array(value);
    if (typeof value === "number")
      return integer(value);
    return bulkString(value);
  }).join("")}`;
}
