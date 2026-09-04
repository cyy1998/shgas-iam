import type { DbClient } from "@iam/db";
import type {
  ClientProtocolEpochInventoryRecord,
  ClientProtocolEpochTarget,
} from "./client-protocol-epoch-cutover";
import { clients } from "@iam/db/schema";
import { and, asc, eq, isNotNull, or } from "drizzle-orm";

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
    if (inventory.length !== targets.length || !targets.every((target) => {
      const record = inventoryByCode.get(target.clientCode);
      return record !== undefined
        && protocolEpochIsEligible(
          target.customSsoExpectedEpoch,
          record.customSsoConfigured,
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

    const after = [] as ClientProtocolEpochInventoryRecord[];
    for (const target of targets) {
      const record = inventoryByCode.get(target.clientCode)!;
      const customSsoEpoch = target.customSsoExpectedEpoch === record.customSsoEpoch
        ? record.customSsoEpoch + 1
        : record.customSsoEpoch;
      const oidcEpoch = target.oidcExpectedEpoch === record.oidcEpoch
        ? record.oidcEpoch + 1
        : record.oidcEpoch;
      if (
        customSsoEpoch !== record.customSsoEpoch
        || oidcEpoch !== record.oidcEpoch
      ) {
        await db.update(clients).set({
          customSsoConfigVersion: customSsoEpoch,
          oidcConfigVersion: oidcEpoch,
          updateTime: new Date(),
        }).where(eq(clients.clientCode, target.clientCode));
      }
      after.push({
        ...record,
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
  return {
    clientCode: row.clientCode,
    customSsoConfigured: row.customSsoConfig !== null,
    customSsoEpoch: row.customSsoEpoch,
    oidcConfigured: row.oidcConfig !== null,
    oidcEpoch: row.oidcEpoch,
  };
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
