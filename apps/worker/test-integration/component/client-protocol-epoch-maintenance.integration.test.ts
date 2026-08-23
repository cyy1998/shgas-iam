import type { ClientProtocolCutoverManifest } from "@iam/domain/client";
import { runClientProtocolEpochCommand } from "@worker/commands/client-protocol-epoch-maintenance";
import { describe, expect, mock, test } from "bun:test";

const manifest: ClientProtocolCutoverManifest = {
  version: 2,
  clients: [{
    clientCode: "portal",
    customSso: { expectedEpoch: 3, ownerStatus: "confirmed" },
    oidc: null,
  }],
};

describe("Client Protocol epoch maintenance command", () => {
  test("dry-run reads inventory without invoking apply", async () => {
    const readInventory = mock(async () => [{
      clientCode: "portal",
      customSsoConfigured: true,
      customSsoEpoch: 3,
      oidcConfigured: false,
      oidcEpoch: 0,
    }]);
    const apply = mock(async () => ({ status: "passed" as const }));
    const dryRun = mock(async () => ({ status: "passed" as const, phase: "before" }));
    const report = await runClientProtocolEpochCommand({
      cutover: {
        apply,
        dryRun,
        verify: async () => ({ status: "passed" as const }),
      },
      inventory: { readInventory },
      logger: { info: () => {} },
    }, { operation: "dry-run", manifest });

    expect(report).toEqual({ status: "passed", phase: "before" });
    expect(readInventory).toHaveBeenCalledTimes(1);
    expect(dryRun).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });
});
