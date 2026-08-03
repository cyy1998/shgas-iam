import type { DbClient } from "@iam/db";
import type { SubjectProjectionCutoverClientRecord } from "./subject-projection-client-cutover";
import { clients } from "@iam/db/schema";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

const LEGACY_GATEWAY_MANAGEMENT_LEVEL = "Gateway";
const LEGACY_INDEPENDENT_MANAGEMENT_LEVEL = "Independent";
const LEGACY_CUSTOM_SSO_ATTRIBUTE_KEYS_SQL = sql`
  ARRAY[
    'managementLevel',
    'requireOrcas',
    'validRedirectUrls',
    'userExcluding',
    'callbackEndpoint',
    'logoutEndpoint'
  ]::text[]
`;

export function createSubjectProjectionClientCutoverRepository(
  db: DbClient,
) {
  async function readInventory(clientCodes: string[]) {
    const [legacyRows, records] = await Promise.all([
      db.select({ clientCode: clients.clientCode })
        .from(clients)
        .where(and(
          eq(clients.isDelete, false),
          or(
            eq(clients.customSsoEnabled, true),
            sql`${clients.extAttributes}->>'managementLevel' IN (
              ${LEGACY_GATEWAY_MANAGEMENT_LEVEL},
              ${LEGACY_INDEPENDENT_MANAGEMENT_LEVEL}
            )`,
          ),
        ))
        .orderBy(asc(clients.clientCode)),
      clientCodes.length === 0
        ? Promise.resolve([])
        : db.select({
            clientCode: clients.clientCode,
            customSsoEnabled: clients.customSsoEnabled,
            customSsoConfig: clients.customSsoConfig,
            customSsoSecretHash: clients.customSsoSecretHash,
            customSsoConfigVersion: clients.customSsoConfigVersion,
            legacyCustomSsoAttributesPresent:
              sql<boolean>`${clients.extAttributes} ?| ${LEGACY_CUSTOM_SSO_ATTRIBUTE_KEYS_SQL}`,
          })
            .from(clients)
            .where(and(
              inArray(clients.clientCode, clientCodes),
              eq(clients.isDelete, false),
            ))
            .orderBy(asc(clients.clientCode)),
    ]);
    return {
      legacyEnabledClientCodes: legacyRows.map(row => row.clientCode),
      records,
    };
  }

  async function applyUpdates(updates: SubjectProjectionCutoverClientRecord[]) {
    if (updates.length === 0)
      return;
    const encoded = JSON.stringify(updates);
    const updated = await db.execute(sql<{ clientCode: string }>`
      WITH desired AS (
        SELECT
          item->>'clientCode' AS client_code,
          (item->>'customSsoEnabled')::boolean AS custom_sso_enabled,
          NULLIF(item->'customSsoConfig', 'null'::jsonb) AS custom_sso_config,
          item->>'customSsoSecretHash' AS custom_sso_secret_hash,
          (item->>'customSsoConfigVersion')::integer AS custom_sso_config_version
        FROM jsonb_array_elements(${encoded}::jsonb) AS item
      )
      UPDATE "client" AS target
      SET
        custom_sso_enabled = desired.custom_sso_enabled,
        custom_sso_config = desired.custom_sso_config,
        custom_sso_secret_hash = desired.custom_sso_secret_hash,
        custom_sso_config_version = desired.custom_sso_config_version,
        ext_attributes = target.ext_attributes - ${LEGACY_CUSTOM_SSO_ATTRIBUTE_KEYS_SQL},
        update_time = now()
      FROM desired
      WHERE target.client_code = desired.client_code
      RETURNING target.client_code AS "clientCode"
    `);
    if (updated.length !== updates.length) {
      throw new Error("Subject Projection client batch was not applied completely");
    }
  }

  return { applyUpdates, readInventory };
}
