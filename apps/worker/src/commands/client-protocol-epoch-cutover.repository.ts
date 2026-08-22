import type { DbClient } from "@iam/db";
import type { CustomSsoClientConfig } from "@iam/db/schema";
import type {
  ClientProtocolEpochInventoryRecord,
  ClientProtocolEpochTarget,
} from "./client-protocol-epoch-cutover";
import { clients, customSsoClientConfigSchema } from "@iam/db/schema";
import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import { z } from "zod";

type LegacyCustomSsoClientConfig = Omit<
  CustomSsoClientConfig,
  "subjectClaimCatalogVersion"
> & { subjectClaimCatalogVersion: 1 };

type StoredCustomSsoClientConfig
  = | CustomSsoClientConfig
    | LegacyCustomSsoClientConfig;

const storedCustomSsoCatalogSchema = z.object({
  subjectClaimCatalogVersion: z.union([z.literal(1), z.literal(2)]),
}).passthrough();

const inventorySelection = {
  clientCode: clients.clientCode,
  customSsoConfig: clients.customSsoConfig,
  customSsoEpoch: clients.customSsoConfigVersion,
  oidcConfig: clients.oidcConfig,
  oidcEpoch: clients.oidcConfigVersion,
};

const configuredProtocolFilter = and(
  eq(clients.isDelete, false),
  or(isNotNull(clients.customSsoConfig), isNotNull(clients.oidcConfig)),
);

export function createClientProtocolEpochCutoverRepository(db: DbClient) {
  const readInventory = async () => {
    const rows = await db.select(inventorySelection)
      .from(clients)
      .where(configuredProtocolFilter)
      .orderBy(asc(clients.clientCode));
    return rows.map(toInventoryRecord);
  };

  const advanceEpochs = async (
    targets: ClientProtocolEpochTarget[],
    afterLockBeforeWrite: () => Promise<void>,
  ) => {
    if (targets.length === 0)
      throw new Error("Client Protocol epoch batch was not applied completely");
    const rows = await db.select(inventorySelection)
      .from(clients)
      .where(configuredProtocolFilter)
      .orderBy(asc(clients.clientCode))
      .for("update");
    const inventory = rows.map(toInventoryRecord);
    const inventoryByCode = new Map(inventory.map(record => [record.clientCode, record]));
    const rowsByCode = new Map(rows.map(row => [row.clientCode, row]));
    if (inventory.length !== targets.length || !targets.every((target) => {
      const record = inventoryByCode.get(target.clientCode);
      return record !== undefined
        && protocolEpochIsEligible(
          target.customSsoExpectedEpoch,
          record.customSsoConfigured,
          record.customSsoEpoch,
        )
        && customSsoCatalogIsEligible(
          target.customSsoTargetCatalogVersion,
          target.customSsoExpectedEpoch,
          record.customSsoCatalogVersion,
          record.customSsoEpoch,
        )
        && protocolEpochIsEligible(
          target.oidcExpectedEpoch,
          record.oidcConfigured,
          record.oidcEpoch,
        );
    })) {
      throw new Error("Client Protocol epoch batch was not applied completely");
    }

    await afterLockBeforeWrite();

    const after = [] as ClientProtocolEpochInventoryRecord[];
    for (const target of targets) {
      const record = inventoryByCode.get(target.clientCode)!;
      const row = rowsByCode.get(target.clientCode)!;
      const customSsoEpoch = target.customSsoExpectedEpoch === record.customSsoEpoch
        ? record.customSsoEpoch + 1
        : record.customSsoEpoch;
      const oidcEpoch = target.oidcExpectedEpoch === record.oidcEpoch
        ? record.oidcEpoch + 1
        : record.oidcEpoch;
      const customSsoConfigUpgrade = target.customSsoTargetCatalogVersion === 2
        && target.customSsoExpectedEpoch === record.customSsoEpoch
        && record.customSsoCatalogVersion === 1
        ? upgradeCustomSsoConfig(row.customSsoConfig)
        : undefined;
      const customSsoConfig = customSsoConfigUpgrade
        ?? parseStoredCustomSsoConfig(row.customSsoConfig);
      if (
        customSsoEpoch !== record.customSsoEpoch
        || oidcEpoch !== record.oidcEpoch
      ) {
        await db.update(clients).set({
          ...(customSsoConfigUpgrade === undefined
            ? {}
            : { customSsoConfig: customSsoConfigUpgrade }),
          customSsoConfigVersion: customSsoEpoch,
          oidcConfigVersion: oidcEpoch,
          updateTime: new Date(),
        }).where(eq(clients.clientCode, target.clientCode));
      }
      after.push({
        ...record,
        customSsoCatalogVersion: customSsoConfig?.subjectClaimCatalogVersion ?? null,
        customSsoEpoch,
        oidcEpoch,
      });
    }
    return after;
  };

  return { advanceEpochs, readInventory };
}

function toInventoryRecord(row: {
  clientCode: string;
  customSsoConfig: unknown;
  customSsoEpoch: number;
  oidcConfig: unknown;
  oidcEpoch: number;
}): ClientProtocolEpochInventoryRecord {
  const customSsoConfig = parseStoredCustomSsoConfig(row.customSsoConfig);
  return {
    clientCode: row.clientCode,
    customSsoCatalogVersion: customSsoConfig?.subjectClaimCatalogVersion ?? null,
    customSsoConfigured: customSsoConfig !== null,
    customSsoEpoch: row.customSsoEpoch,
    oidcConfigured: row.oidcConfig !== null,
    oidcEpoch: row.oidcEpoch,
  };
}

function parseStoredCustomSsoConfig(value: unknown): StoredCustomSsoClientConfig | null {
  if (value === null)
    return null;
  const stored = storedCustomSsoCatalogSchema.parse(value);
  if (stored.subjectClaimCatalogVersion === 2)
    return customSsoClientConfigSchema.parse(stored);
  const candidate = customSsoClientConfigSchema.parse({
    ...stored,
    subjectClaimCatalogVersion: 2,
  });
  return {
    ...candidate,
    subjectClaimCatalogVersion: 1,
  };
}

function upgradeCustomSsoConfig(value: unknown): CustomSsoClientConfig {
  const stored = parseStoredCustomSsoConfig(value);
  if (stored === null)
    throw new Error("Client Protocol Custom SSO configuration is missing");
  return customSsoClientConfigSchema.parse({
    ...stored,
    subjectClaimCatalogVersion: 2,
  });
}

function customSsoCatalogIsEligible(
  targetCatalogVersion: 2 | undefined,
  expectedEpoch: number | undefined,
  catalogVersion: 1 | 2 | null,
  currentEpoch: number,
) {
  if (targetCatalogVersion === undefined)
    return catalogVersion === null;
  if (expectedEpoch === undefined)
    return false;
  return (
    currentEpoch === expectedEpoch
    && (catalogVersion === 1 || catalogVersion === targetCatalogVersion)
  ) || (
    currentEpoch === expectedEpoch + 1
    && catalogVersion === targetCatalogVersion
  );
}

function protocolEpochIsEligible(
  expectedEpoch: number | undefined,
  configured: boolean,
  currentEpoch: number,
) {
  if (expectedEpoch === undefined)
    return !configured;
  return configured
    && (currentEpoch === expectedEpoch || currentEpoch === expectedEpoch + 1);
}
