import type postgres from "postgres";
import { createHash } from "node:crypto";
import { ClientCodeSchema } from "@iam/contracts";
import { z } from "zod";
import sourceCatalog from "./b648-client-catalog.json";
import { B648_SOURCE, CLIENT_SSO_EXPANSION, inspectMigrationPrefix, migrationsDirectory } from "./staged-migrations";

const legacyColumns = ["oidc_enabled", "oidc_config", "oidc_secret_hash", "oidc_config_version", "custom_sso_enabled", "custom_sso_config", "custom_sso_secret_hash", "custom_sso_config_version"];
export class B648SourceError extends Error {
  constructor(readonly reason: string, readonly clients: string[] = []) {
    super(reason);
  }
}
const snapshotSchema = z.object({ ddl: z.array(z.object({
  entityType: z.string(),
  table: z.string().optional(),
  name: z.string(),
  type: z.string().optional(),
  notNull: z.boolean().optional(),
})) });

/** The immutable source snapshot belongs to b6481f2; no source columns may be added, omitted or retyped. */
export async function inspectB648Clients(
  tx: postgres.TransactionSql,
  schema: string,
  validateSource: (row: Record<string, unknown>) => void,
  expanded = false,
) {
  await inspectMigrationPrefix(tx, schema, expanded ? CLIENT_SSO_EXPANSION : B648_SOURCE);
  const snapshot = snapshotSchema.parse(await Bun.file(new URL(
    "20260823091908_remove_subject_claim_catalog_version/snapshot.json",
    migrationsDirectory,
  )).json());
  const expected = snapshot.ddl.filter(item => item.entityType === "columns" && item.table === "client")
    .map(item => ({ name: item.name, type: item.type!.replace(/^serial$/u, "integer").replace(/^varchar/u, "character varying").replace(/^timestamp$/u, "timestamp without time zone"), notNull: item.notNull }));
  if (expanded) {
    expected.push(
      { name: "sso_enabled", type: "boolean", notNull: true },
      { name: "sso_config", type: "jsonb", notNull: false },
      { name: "sso_secret", type: "character varying(255)", notNull: false },
      { name: "sso_credential_id", type: "uuid", notNull: false },
      { name: "sso_secret_updated_at", type: "timestamp with time zone", notNull: false },
    );
  }
  const columns = await tx<{ name: string; type: string; notNull: boolean }[]>`SELECT attname AS name,
    format_type(atttypid, atttypmod) AS type, attnotnull AS "notNull" FROM pg_attribute
    WHERE attrelid = 'client'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attname`;
  if (JSON.stringify(Array.from(columns)) !== JSON.stringify(expected.sort((a, b) => a.name.localeCompare(b.name))))
    throw new B648SourceError("unsupported-client-schema");
  // A serial column is an integer plus this exact owned nextval default. Resolve OIDs
  // instead of freezing the deployment schema's name into the source fingerprint.
  const serial = await tx<{ valid: boolean }[]>`SELECT (
      pg_get_expr(d.adbin,d.adrelid) = format('nextval(%L::regclass)', s.oid::regclass::text)
      AND a.attidentity = '' AND a.attgenerated = ''
      AND s.relnamespace = c.relnamespace AND s.relname = 'client_id_seq'
      AND q.seqtypid = 'integer'::regtype AND q.seqstart = 1 AND q.seqincrement = 1
      AND q.seqmin = 1 AND q.seqmax = 2147483647 AND q.seqcache = 1 AND NOT q.seqcycle
    ) AS valid
    FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='id'
    JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    JOIN pg_depend ownership ON ownership.classid='pg_class'::regclass
      AND ownership.refclassid='pg_class'::regclass AND ownership.refobjid=c.oid
      AND ownership.refobjsubid=a.attnum AND ownership.deptype='a'
    JOIN pg_class s ON s.oid=ownership.objid AND s.relkind='S'
    JOIN pg_sequence q ON q.seqrelid=s.oid
    WHERE c.oid='client'::regclass`;
  if (serial.length !== 1 || !serial[0]!.valid)
    throw new B648SourceError("unsupported-client-id-sequence");
  // Frozen pg_catalog evidence from the exact source on the declared PostgreSQL 18.4.
  const constraints = await tx`SELECT conname AS name, pg_get_constraintdef(oid,true) AS definition,
    convalidated AS validated FROM pg_constraint WHERE conrelid='client'::regclass
    AND conname NOT IN ('client_sso_config_check','client_sso_enabled_config_check','client_sso_credential_check','client_sso_enabled_not_null') ORDER BY conname`;
  const defaults = await tx`SELECT a.attname AS name,pg_get_expr(d.adbin,d.adrelid) AS expression
    FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='client'::regclass AND a.attname NOT IN ('id','sso_enabled') ORDER BY a.attname`;
  const indexes = await tx`SELECT c.relname AS name,substring(pg_get_indexdef(i.indexrelid) FROM ' USING .*') AS definition
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='client'::regclass ORDER BY c.relname`;
  if (JSON.stringify({ constraints, defaults, indexes }) !== JSON.stringify(sourceCatalog))
    throw new B648SourceError("unsupported-client-constraints-defaults-or-indexes");
  const rows = await tx<{ data: Record<string, unknown> }[]>`SELECT to_jsonb(c) AS data FROM client c ORDER BY id LIMIT 1001`;
  if (rows.length > 1000)
    throw new B648SourceError("source-exceeds-1000-clients");
  const invalid: string[] = [];
  let invalidCount = 0;
  for (const row of rows) {
    try {
      validateSource(row.data);
    }
    catch {
      invalidCount++;
      const code = ClientCodeSchema.safeParse(row.data.client_code);
      if (code.success)
        invalid.push(code.data);
    }
  }
  if (invalidCount)
    throw new B648SourceError("invalid-source-configuration", invalid);
  return { source: "b6481f2de5c2930fc381d99e70520e0783091e9d", inspected: rows.length, expanded };
}

export async function prepareB648CallbackCheck(tx: postgres.TransactionSql) {
  const ddl = await Bun.file(new URL("20260916050609_explicit_callback_type/migration.sql", migrationsDirectory)).text();
  await tx`ALTER TABLE client DROP CONSTRAINT IF EXISTS client_sso_config_check`;
  await tx.unsafe(ddl);
}

/** Hash final facts, including secrets without disclosing them; legacy columns alone are excluded. */
export async function clientUpgradeFingerprints(tx: postgres.TransactionSql) {
  const rows = await tx<{ clientCode: string; facts: string }[]>`SELECT c.client_code AS "clientCode",
    jsonb_build_object('client',
      (to_jsonb(c) - ${legacyColumns}::text[]) || jsonb_build_object('sso_config', CASE
        WHEN sso_config->>'protocol' = 'custom-sso' AND sso_config->>'callbackType' = 'managed'
        THEN sso_config - 'callbackEndpoint' ELSE sso_config END),
      'roles', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM role r WHERE r.client_id = c.id), '[]'::jsonb))::text AS facts
    FROM client c ORDER BY c.id LIMIT 1001`;
  if (rows.length > 1000)
    throw new Error("Source exceeds 1000 Client bound");
  return rows.map(row => ({ clientCode: row.clientCode, digest: createHash("sha256").update(row.facts).digest("hex") }));
}
