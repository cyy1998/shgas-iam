import { expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness } from "../support/postgres-harness";

const migrations = new URL("../../src/migrations/", import.meta.url);
const baselineEnd = "20261110064114_global_roles";

test("upgrading existing Client and Global Roles preserves their assignments and published facts", async () => {
  const tempRoot = resolve(tmpdir());
  const prefix = "iam-role-kind-";
  const harness = await createPostgresTestHarness();
  const failures: unknown[] = [];
  let baseline: string | undefined;
  try {
    baseline = await mkdtemp(join(tempRoot, prefix));
    for (const entry of await readdir(migrations, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name <= baselineEnd)
        await cp(new URL(entry.name, migrations), join(baseline, entry.name), { recursive: true });
    }
    const db = drizzle({ client: harness.sql });
    const migrationOptions = { migrationsSchema: harness.schemaName };
    await migrate(db, { ...migrationOptions, migrationsFolder: baseline });

    await harness.sql`
      INSERT INTO client (id, client_code, client_name, client_secret, ext_attributes)
      VALUES (10, 'portal', 'Portal', 'test-secret', '{}')
    `;
    await harness.sql`
      INSERT INTO role (id, role_code, role_name, role_type, client_id)
      VALUES (20, 'portal:reader', 'Reader', 'client', 10),
             (21, 'global:reviewer', 'Reviewer', 'global', NULL)
    `;
    await harness.sql`
      INSERT INTO "user" (id, subject_identifier, username, name)
      VALUES (50, '10000000-0000-4000-8000-000000000001', 'holder', 'Holder')
    `;
    await harness.sql`
      INSERT INTO organization (id, org_code, org_name, path, level, org_type)
      VALUES (40, 'HQ', 'Headquarters', '/40', 1, '部门')
    `;
    await harness.sql`
      INSERT INTO organization_closure (ancestor_id, descendant_id, depth) VALUES (40, 40, 0)
    `;
    await harness.sql`
      INSERT INTO "position" (id, post_code, post_name) VALUES (60, 'POS', 'Position')
    `;
    await harness.sql`
      INSERT INTO employment (id, user_id, dept_id, pos_id, is_primary, start_time)
      VALUES (30, 50, 40, 60, true, '2026-08-01')
    `;
    await harness.sql`
      INSERT INTO role_assignment (role_id, target_type, target_id, include_descendants)
      VALUES (20, 'employment', 30, false), (21, 'organization', 40, true)
    `;
    await harness.sql`
      INSERT INTO user_document (user_id, subject_identifier, schema_version, source_version, published_at, document)
      VALUES (50, '10000000-0000-4000-8000-000000000001', 1, 7, '2026-11-01', '{
        "subjectIdentifier": "10000000-0000-4000-8000-000000000001",
        "username": "holder",
        "name": "Holder",
        "mobile": null,
        "wxId": null,
        "userType": "正式员工",
        "status": 1,
        "employments": [{
          "isPrimary": true,
          "organization": {
            "code": "HQ",
            "name": "Headquarters",
            "type": "部门",
            "path": [{"code": "HQ", "name": "Headquarters", "type": "部门", "level": 1, "distanceToTarget": 0}]
          },
          "position": {"code": "POS", "name": "Position"},
          "responsibilities": [],
          "clientAuthorizations": [{"clientCode": "portal", "roles": [{"code": "portal:reader"}]}],
          "globalRoles": [{"code": "global:reviewer"}]
        }]
      }')
    `;
    const assignments = await harness.sql`SELECT * FROM role_assignment ORDER BY id`;
    const documents = await harness.sql`SELECT * FROM user_document`;

    await migrate(db, { ...migrationOptions, migrationsFolder: fileURLToPath(migrations) });

    const roles = await harness.sql`
      SELECT id, role_code, role_type, client_id, role_kind FROM role ORDER BY id
    `;
    expect([...roles]).toEqual([
      { id: 20, role_code: "portal:reader", role_type: "client", client_id: 10, role_kind: "basic" },
      { id: 21, role_code: "global:reviewer", role_type: "global", client_id: null, role_kind: "basic" },
    ]);
    expect([...(await harness.sql`SELECT * FROM role_assignment ORDER BY id`)]).toEqual([...assignments]);
    expect([...(await harness.sql`SELECT * FROM user_document`)]).toEqual([...documents]);

    const [legacy] = await harness.sql`
      INSERT INTO role (role_code, role_name, client_id)
      VALUES ('portal:legacy', 'Legacy', 10) RETURNING role_kind
    `;
    expect(legacy).toEqual({ role_kind: "basic" });
  } catch (error) {
    failures.push(error);
  }

  for (const cleanup of [
    () => harness.close(),
    async () => {
      if (!baseline) return;
      const target = resolve(baseline);
      if (dirname(target) !== tempRoot || !basename(target).startsWith(prefix)) {
        throw new Error("Unexpected Role Kind migration fixture path");
      }
      await rm(target, { recursive: true });
    },
  ]) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Role Kind migration fixture failed");
});
