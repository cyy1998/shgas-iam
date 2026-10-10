import {
  createUnifiedCustomSsoInventory,
  createUnifiedCustomSsoMaintenance,
  createUnifiedCustomSsoVerifier,
} from "@iam/custom-sso/maintenance";
import { createOidcInventory, createOidcMaintenance, createOidcVerifier } from "@iam/oidc/maintenance";
import {
  createUnifiedSessionInventory,
  createUnifiedSessionMaintenance,
  createUnifiedSessionVerifier,
} from "@iam/session-kernel/maintenance";
import type { SessionClearInput } from "@worker/commands/session-clear/arguments";
import type { Redis } from "ioredis";

interface Report {
  matching: number;
  removed: number;
  unknown: number;
}
interface Page {
  nextCursor: string;
  matching: number;
  removed?: number;
  unknown: number;
}
interface Owner {
  name: string;
  run: () => Promise<Report>;
}

export function createSessionClearMaintenance(redis: Redis, input: SessionClearInput, signal: AbortSignal): Owner[] {
  const reader = {
    scan: async (cursor: string, match: "MATCH", pattern: string, count: "COUNT", limit: string) =>
      await redis.scan(cursor, match, pattern, count, limit),
  };
  const writer = {
    ...reader,
    unlink: async (...keys: string[]) => await redis.unlink(...keys),
  };
  const owners: Owner[] = [];
  function add(
    name: string,
    inventory: (cursor: string) => Promise<Page>,
    apply: (cursor: string) => Promise<Page>,
    verify: () => Promise<{ matching: number }>,
  ) {
    owners.push({
      name,
      async run() {
        if (input.mode === "verify") return { ...(await verify()), removed: 0, unknown: 0 };
        const report: Report = { matching: 0, removed: 0, unknown: 0 };
        let cursor = "0";
        let pages = 0;
        do {
          signal.throwIfAborted();
          if (++pages > 100_000) throw new Error("Session cleanup page budget exhausted");
          const page = await (input.mode === "apply" ? apply(cursor) : inventory(cursor));
          signal.throwIfAborted();
          cursor = page.nextCursor;
          report.matching += page.matching;
          report.removed += page.removed ?? 0;
          report.unknown += page.unknown;
        } while (cursor !== "0");
        return report;
      },
    });
  }
  if (input.owner === "all" || input.owner === "kernel") {
    const inventory = createUnifiedSessionInventory(reader, input.kernelNamespace!);
    const maintenance = createUnifiedSessionMaintenance(writer, input.kernelNamespace!);
    const verifier = createUnifiedSessionVerifier(reader, input.kernelNamespace!);
    add(
      "unified-kernel",
      (cursor) => inventory.inventory({ cursor }),
      (cursor) => maintenance.apply({ cursor }),
      () => verifier.verify(signal),
    );
  }
  if (input.owner === "all" || input.owner === "custom-sso") {
    const inventory = createUnifiedCustomSsoInventory(reader, input.customNamespace!);
    const maintenance = createUnifiedCustomSsoMaintenance(writer, input.customNamespace!);
    const verifier = createUnifiedCustomSsoVerifier(reader, input.customNamespace!);
    add(
      "unified-custom-sso",
      (cursor) => inventory.inventory({ cursor }),
      (cursor) => maintenance.apply({ cursor }),
      () => verifier.verify(signal),
    );
  }
  if (input.owner === "all" || input.owner === "oidc") {
    const inventory = createOidcInventory(reader, input.oidcNamespace!);
    const maintenance = createOidcMaintenance(writer, input.oidcNamespace!);
    const verifier = createOidcVerifier(reader, input.oidcNamespace!);
    add(
      "unified-oidc",
      (cursor) => inventory.inventory({ cursor }),
      (cursor) => maintenance.apply({ cursor }),
      () => verifier.verify(signal),
    );
  }
  return owners;
}
