import type { ClientSsoConfig } from "@iam/contracts";
import type postgres from "postgres";
import type { ClientSsoUpgradeManifest } from "./upgrade-plan";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ClientCodeSchema } from "@iam/contracts";
import { normalizeClientSsoConfig } from "@iam/domain/client/sso-configuration";
import { planClientSsoUpgrade, readLegacyClient } from "./upgrade-plan";

const targetColumns = [
  "sso_enabled",
  "sso_config",
  "sso_secret",
  "sso_credential_id",
  "sso_secret_updated_at",
];
const expectedColumns = [
  "id",
  "client_code",
  "client_name",
  "client_secret",
  "url",
  "status",
  "description",
  "is_delete",
  "create_time",
  "update_time",
  "ext_attributes",
  "oidc_enabled",
  "oidc_config",
  "oidc_secret_hash",
  "oidc_config_version",
  "custom_sso_enabled",
  "custom_sso_config",
  "custom_sso_secret_hash",
  "custom_sso_config_version",
  ...targetColumns,
].sort();

type Row = Record<string, unknown>;
interface InventoryRow {
  data: Row;
  preserved: string;
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function readInventory(tx: postgres.TransactionSql) {
  const columns = await tx<Array<{ name: string }>>`SELECT attname AS name FROM pg_attribute
    WHERE attrelid = 'client'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attname`;
  if (JSON.stringify(columns.map(row => row.name)) !== JSON.stringify(expectedColumns))
    throw new Error("Unsupported source/target layout");
  const rows = await tx<InventoryRow[]>`SELECT to_jsonb(c) AS data,
    jsonb_build_object('client', to_jsonb(c) - ${targetColumns}::text[],
      'roles', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM role r WHERE r.client_id = c.id), '[]'::jsonb))::text AS preserved
    FROM client c ORDER BY c.id LIMIT 1001`;
  if (rows.length > 1000)
    throw new Error("Inventory exceeds supported bound");
  return rows;
}

function currentTarget(row: Row) {
  if (typeof row.sso_enabled !== "boolean")
    throw new Error("Invalid target state");
  const config
    = row.sso_config === null
      ? null
      : normalizeClientSsoConfig(row.sso_config as Parameters<typeof normalizeClientSsoConfig>[0]);
  const emptySecret
    = row.sso_secret === null && row.sso_credential_id === null && row.sso_secret_updated_at === null;
  const fullSecret
    = typeof row.sso_secret === "string"
      && row.sso_secret.length > 0
      && typeof row.sso_credential_id === "string"
      && typeof row.sso_secret_updated_at === "string";
  if ((!emptySecret && !fullSecret) || (row.sso_enabled && config === null))
    throw new Error("Invalid target state");
  return { config, enabled: row.sso_enabled, emptySecret, fullSecret };
}

/** Offline business-data migration. This capability has no Redis or Snapshot repair effects. */
export async function runClientSsoUpgrade(
  sql: postgres.Sql,
  options: {
    mode: "inventory" | "apply" | "verify";
    manifest?: ClientSsoUpgradeManifest;
    all: boolean;
  },
) {
  return await sql.begin(
    options.mode === "apply" ? "" : "ISOLATION LEVEL REPEATABLE READ READ ONLY",
    async (tx) => {
      if (options.mode === "apply")
        await tx`LOCK TABLE client, role IN SHARE ROW EXCLUSIVE MODE`;
      const inventory = await readInventory(tx);
      if (options.mode === "inventory") {
        const clients = inventory.map(({ data, preserved }) => {
          const parsedCode = ClientCodeSchema.safeParse(data.client_code);
          try {
            const source = readLegacyClient(data);
            const target = currentTarget(data);
            return {
              clientCode: source.row.client_code,
              sourceDigest: digest(preserved),
              credentialId: randomUUID(),
              availableProtocols: [
                ...(source.oidc ? ["oidc"] : []),
                ...(source.custom ? ["custom-sso"] : []),
              ],
              status:
                target.config !== null || !target.emptySecret
                  ? "target-present"
                  : source.oidc && source.custom
                    ? "pending-selection"
                    : "unmigrated",
            };
          }
          catch {
            return { ...(parsedCode.success ? { clientCode: parsedCode.data } : {}), status: "unknown" };
          }
        });
        return {
          version: 1,
          mode: options.mode,
          status: clients.some(row => row.status === "unknown") ? "failed" : "completed",
          clients,
        };
      }
      const manifest = options.manifest;
      if (!manifest)
        throw new Error("Manifest required");
      const results: Array<{ clientCode: string; status: string; reason?: string }> = [];
      const writes: Array<{
        code: string;
        config: ClientSsoConfig | null;
        enabled: boolean;
        credentialId: string | null;
        secret: string | null;
      }> = [];
      for (const selection of manifest.clients) {
        const found = inventory.find(row => row.data.client_code === selection.clientCode);
        try {
          if (!found || digest(found.preserved) !== selection.sourceDigest) {
            results.push({
              clientCode: selection.clientCode,
              status: "blocked",
              reason: "source-changed-or-missing",
            });
            continue;
          }
          const plan = planClientSsoUpgrade(found.data, selection, manifest);
          if (plan.kind === "pending") {
            results.push({ clientCode: selection.clientCode, status: "pending", reason: plan.reason });
            continue;
          }
          const target = currentTarget(found.data);
          const matches
            = target.enabled === plan.enabled
              && JSON.stringify(target.config) === JSON.stringify(plan.config)
              && (plan.requiresSecret
                ? target.fullSecret
                && found.data.sso_credential_id === selection.credentialId
                && /^[\w-]{43}$/u.test(String(found.data.sso_secret))
                && Number.isFinite(Date.parse(String(found.data.sso_secret_updated_at)))
                : target.emptySecret);
          if (matches) {
            results.push({ clientCode: selection.clientCode, status: "verified" });
            continue;
          }
          if (options.mode === "verify" || target.config !== null || target.enabled || !target.emptySecret) {
            results.push({ clientCode: selection.clientCode, status: "blocked", reason: "target-mismatch" });
            continue;
          }
          writes.push({
            code: selection.clientCode,
            config: plan.config,
            enabled: plan.enabled,
            credentialId: plan.requiresSecret ? selection.credentialId : null,
            secret: plan.requiresSecret ? randomBytes(32).toString("base64url") : null,
          });
          results.push({ clientCode: selection.clientCode, status: "ready" });
        }
        catch {
          results.push({ clientCode: selection.clientCode, status: "blocked", reason: "unknown-data" });
        }
      }
      const completeScope
        = !options.all
          || (inventory.length === manifest.clients.length
            && inventory.every(row =>
              manifest.clients.some(selection => row.data.client_code === selection.clientCode),
            ));
      const blocked
        = !completeScope || results.some(row => row.status === "blocked" || row.status === "pending");
      if (!blocked && options.mode === "apply") {
        for (const write of writes) {
          const updated
            = await tx`UPDATE client SET sso_config = ${write.config === null ? null : tx.json(write.config)},
          sso_enabled = ${write.enabled}, sso_secret = ${write.secret}, sso_credential_id = ${write.credentialId},
          sso_secret_updated_at = CASE WHEN ${write.secret !== null} THEN CURRENT_TIMESTAMP ELSE NULL END
          WHERE client_code = ${write.code} RETURNING id`;
          if (updated.length !== 1)
            throw new Error("Incomplete update");
        }
        // Detect unexpected triggers changing business facts, role ownership, or another Client.
        const after = await readInventory(tx);
        if (
          after.length !== inventory.length
          || after.some(
            (row, index) =>
              row.preserved !== inventory[index]?.preserved
              || (!writes.some(write => write.code === row.data.client_code)
                && JSON.stringify(row.data) !== JSON.stringify(inventory[index]?.data)),
          )
        ) {
          throw new Error("Preserved facts changed");
        }
        for (const write of writes) {
          const stored = after.find(row => row.data.client_code === write.code)?.data;
          if (
            !stored
            || JSON.stringify(currentTarget(stored).config) !== JSON.stringify(write.config)
            || stored.sso_enabled !== write.enabled
            || stored.sso_secret !== write.secret
            || stored.sso_credential_id !== write.credentialId
          ) {
            throw new Error("Target write changed");
          }
        }
      }
      return {
        version: 1,
        mode: options.mode,
        status: blocked ? "failed" : "completed",
        scope: options.all ? "all" : "selected",
        completeScope,
        updatedRows: blocked ? 0 : writes.length,
        clients: results.map(row =>
          row.status === "ready" ? { ...row, status: blocked ? "not-applied" : "applied" } : row,
        ),
      };
    },
  );
}
