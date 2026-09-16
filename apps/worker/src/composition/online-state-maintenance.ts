import type { OnlineStateInput } from "@worker/commands/online-state/arguments";
import type { Redis } from "ioredis";
import {
  createLegacyGrantMaintenance,
  createLegacyGrantVerifier,
  createOfflineGrantVerifier,
  createUnifiedCustomSsoInventory,
  createUnifiedCustomSsoMaintenance,
  createUnifiedCustomSsoVerifier,
} from "@iam/custom-sso/maintenance";
import { createOidcInventory, createOidcMaintenance, createOidcVerifier } from "@iam/oidc/maintenance";
import {
  createOfflineOidcInventory,
  createOfflineOidcMaintenance,
  createOfflineOidcVerifier,
} from "@iam/oidc/offline-maintenance";
import {
  createOfflineSessionInventory,
  createOfflineSessionMaintenance,
  createOfflineSessionVerifier,
  createUnifiedSessionInventory,
  createUnifiedSessionMaintenance,
  createUnifiedSessionVerifier,
} from "@iam/session-kernel/maintenance";

interface Page {
  nextCursor: string;
  matching?: number;
  removed?: number;
  changed?: number;
  unknown: number;
}
interface Owner {
  name: string;
  run: () => Promise<{ matching: number; removed: number; changed: number; unknown: number }>;
}

export function createOnlineStateMaintenance(
  redis: Redis,
  input: OnlineStateInput,
  signal: AbortSignal,
): Owner[] {
  // Verification receives a capability with no eval, delete, acquisition or runtime factory.
  const scan = {
    scan: async (cursor: string, match: "MATCH", pattern: string, count: "COUNT", limit: string) =>
      await redis.scan(cursor, match, pattern, count, limit),
  };
  const reader = {
    ...scan,
    get: async (key: string) => await redis.get(key),
    type: async (key: string) => await redis.type(key),
    zrange: async (key: string, start: number, end: number, scores: "WITHSCORES") =>
      await redis.zrange(key, start, end, scores),
    smembers: async (key: string) => await redis.smembers(key),
    scard: async (key: string) => await redis.scard(key),
    srandmember: async (key: string, count: number) => await redis.srandmember(key, count),
  };
  const writer = {
    ...reader,
    eval: async (script: string, count: number, ...args: string[]) =>
      await redis.eval(script, count, ...args),
  };
  const owners: Owner[] = [];
  function selected(name: OnlineStateInput["owner"]) {
    return input.owner === "all" || input.owner === name;
  }
  function add(
    name: string,
    inventory: (cursor: string) => Promise<Page>,
    apply: (cursor: string) => Promise<Page>,
    verify: () => Promise<{ matching: number }>,
  ) {
    owners.push({
      name,
      async run() {
        if (input.mode === "verify" && !input.clientCode)
          return { ...(await verify()), removed: 0, changed: 0, unknown: 0 };
        const report = { matching: 0, removed: 0, changed: 0, unknown: 0 };
        let cursor = "0";
        let pages = 0;
        do {
          signal.throwIfAborted();
          if (++pages > 100_000)
            throw new Error("Inventory page budget exhausted");
          const page = await (input.mode === "apply" ? apply(cursor) : inventory(cursor));
          cursor = page.nextCursor;
          report.matching += page.matching ?? 0;
          report.removed += page.removed ?? 0;
          report.changed += page.changed ?? 0;
          report.unknown += page.unknown;
        } while (cursor !== "0");
        return report;
      },
    });
  }
  if (input.layout === "source") {
    if (selected("kernel")) {
      const inventory = createOfflineSessionInventory(reader, input.kernelNamespace!);
      const maintenance = createOfflineSessionMaintenance(writer, input.kernelNamespace!);
      const verifier = createOfflineSessionVerifier(scan, input.kernelNamespace!);
      add(
        "source-kernel",
        cursor => inventory.inventory({ cursor }),
        cursor => maintenance.apply({ cursor }),
        () => verifier.verify(signal),
      );
    }
    if (selected("custom-sso")) {
      const legacyReader = {
        scan: async (cursor: string, match: "MATCH", pattern: string, count: "COUNT", limit: number) =>
          await redis.scan(cursor, match, pattern, count, limit),
        get: reader.get,
      };
      const inventory = createLegacyGrantVerifier({ redis: legacyReader, writersStopped: true, signal });
      const maintenance = createLegacyGrantMaintenance({
        redis: {
          ...legacyReader,
          eval: async (script, count, ...args) => await redis.eval(script, count, ...args),
        },
        writersStopped: true,
        signal,
      });
      const verifier = createOfflineGrantVerifier(scan);
      owners.push({
        name: "source-custom-grants",
        async run() {
          if (input.mode === "verify")
            return { ...(await verifier.verify(signal)), removed: 0, changed: 0, unknown: 0 };
          const result = await (input.mode === "apply" ? maintenance.apply() : inventory.inventory());
          return {
            matching: result.targets,
            removed: result.removed,
            changed: 0,
            unknown: result.failed + result.unverified + (result.scanComplete ? 0 : 1),
          };
        },
      });
    }
    if (selected("oidc")) {
      const inventory = createOfflineOidcInventory(reader);
      const maintenance = createOfflineOidcMaintenance(writer);
      const verifier = createOfflineOidcVerifier(scan);
      add(
        "source-provider",
        cursor => inventory.inventory({ cursor }),
        cursor => maintenance.apply({ cursor }),
        () => verifier.verify(signal),
      );
    }
  }
  else {
    if (selected("kernel")) {
      const inventory = createUnifiedSessionInventory(reader, input.kernelNamespace!);
      const maintenance = createUnifiedSessionMaintenance(writer, input.kernelNamespace!);
      const verifier = createUnifiedSessionVerifier(scan, input.kernelNamespace!);
      add(
        "unified-kernel",
        cursor => inventory.inventory({ cursor }),
        cursor => maintenance.apply({ cursor }),
        () => verifier.verify(signal),
      );
    }
    if (selected("custom-sso")) {
      const inventory = createUnifiedCustomSsoInventory(reader, input.customNamespace!);
      const maintenance = createUnifiedCustomSsoMaintenance(writer, input.customNamespace!);
      const verifier = createUnifiedCustomSsoVerifier(scan, input.customNamespace!);
      add(
        "unified-custom-sso",
        cursor => inventory.inventory({ cursor, clientCode: input.clientCode, artifacts: input.artifacts }),
        cursor => maintenance.apply({ cursor, clientCode: input.clientCode, artifacts: input.artifacts }),
        () => verifier.verify(signal),
      );
    }
    if (selected("oidc")) {
      const inventory = createOidcInventory(reader, input.oidcNamespace!);
      const maintenance = createOidcMaintenance(writer, input.oidcNamespace!);
      const verifier = createOidcVerifier(scan, input.oidcNamespace!);
      add(
        "unified-oidc",
        cursor => inventory.inventory({ cursor, clientId: input.clientCode }),
        cursor => maintenance.apply({ cursor, clientId: input.clientCode }),
        () => verifier.verify(signal),
      );
    }
  }
  return owners;
}
