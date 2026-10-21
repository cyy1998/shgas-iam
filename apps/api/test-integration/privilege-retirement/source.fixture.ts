import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { z } from "zod";
import { check } from "./check.fixture";

export const BASELINE_COMMIT = "99b27c614a668cd66d354d4581ae5166a7275ff8";
const fingerprintKey = randomBytes(32);
const hashedFile = z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/u) });
const manifestSchema = z.object({
  sourceCommit: z.literal(BASELINE_COMMIT),
  autoloadDotenv: z.literal(false),
  autoloadBunfig: z.literal(false),
  externalWorkspaceImports: z.array(z.string()).length(0),
  runtimeFiles: z.array(hashedFile),
  migrationFiles: z.array(hashedFile),
  ownerSupport: hashedFile.extend({ externalWorkspaceImports: z.array(z.string()).length(0) }),
});

type LegacyOwners = Pick<typeof import("@iam/session-kernel"), "createUnifiedSessionKernel"> &
  Pick<
    typeof import("@iam/api-core/subject-access"),
    | "requireSubjectAccessOperation"
    | "createSubjectAccessOperations"
    | "createSubjectAccessBarrier"
    | "createRedisSubjectAccessStore"
    | "createSubjectAccessBootstrap"
    | "createUnifiedSubjectAccessSessionRevocation"
  > &
  Pick<typeof import("@iam/custom-sso/testing"), "createUnifiedCustomSsoRedisTestScope"> &
  Pick<typeof import("@iam/oidc/testing"), "createOidcRedisTestScope"> & {
    BASELINE_SOURCE_COMMIT: string;
    USER_PROFILE_SCHEMA_VERSION: number;
  };

export async function readBaseline(manifestPath: string) {
  const root = dirname(resolve(manifestPath));
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const locate = (path: string) => {
    const result = resolve(root, path);
    check(!relative(root, result).startsWith(".."), "Baseline artifact path escaped its root");
    return result;
  };
  for (const file of [...manifest.runtimeFiles, ...manifest.migrationFiles, manifest.ownerSupport]) {
    const digest = createHash("sha256")
      .update(await readFile(locate(file.path)))
      .digest("hex");
    check(digest === file.sha256, "Fixed baseline artifact checksum mismatch");
  }
  const owners: LegacyOwners = await import(pathToFileURL(locate(manifest.ownerSupport.path)).href);
  check(owners.BASELINE_SOURCE_COMMIT === BASELINE_COMMIT, "Old owner bundle source mismatch");
  check(owners.USER_PROFILE_SCHEMA_VERSION === 3, "Old owner bundle is not Profile v3");
  return { root, runtime: join(root, "runtime"), owners, migrations: join(root, "migrations") };
}

export async function createCutoverDatabase(databaseUrl: string, sourceMigrations: string) {
  const schema = `iam_cutover_${randomUUID().replaceAll("-", "")}`;
  const control = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await control.unsafe(`CREATE SCHEMA "${schema}"`);
  } catch (failure) {
    try {
      await control.end({ timeout: 1 });
    } catch (cleanup) {
      throw new AggregateError([failure, cleanup], "Cutover database initialization and cleanup failed");
    }
    throw failure;
  }
  const sql = postgres(databaseUrl, {
    max: 4,
    onnotice: () => {},
    connection: { search_path: schema, application_name: schema, statement_timeout: 10000 },
  });
  const database = drizzle({ client: sql });
  const migrateFrom = (migrationsFolder: string) => migrate(database, { migrationsFolder, migrationsSchema: schema });
  const target = new URL(databaseUrl);
  target.searchParams.set("search_path", schema);
  const close = async () => {
    const failures: unknown[] = [];
    for (const action of [
      () => sql.end({ timeout: 1 }),
      () => control.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`),
      () => control.end({ timeout: 1 }),
    ]) {
      try {
        await action();
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Cutover database cleanup failed");
  };
  try {
    await migrateFrom(sourceMigrations);
    return {
      sql,
      databaseUrl: target.href,
      close,
      migrateCurrent: () =>
        migrateFrom(fileURLToPath(new URL("../../../../packages/db/src/migrations/", import.meta.url))),
    };
  } catch (failure) {
    await close();
    throw failure;
  }
}

export type CutoverDatabase = Awaited<ReturnType<typeof createCutoverDatabase>>;

export const clients = {
  custom: "cutover-custom",
  managed: "cutover-managed",
  other: "cutover-other",
  oidc: "cutover-oidc",
  empty: "cutover-empty",
};
export const redirectUri = "https://rp.example/complete";
export const secret = "cutover-synthetic-sso-secret";

export async function seedSource(h: CutoverDatabase) {
  await h.sql`INSERT INTO "user" (id,username,name,status,is_delete,password)
    VALUES (1,'alice','Alice',1,false,'unchanged-hash'),(2,'bob','Bob',1,false,NULL),
      (3,'disabled','Disabled',3,false,NULL),(4,'deleted','Deleted',3,true,NULL)`;
  const claims = ["subjectIdentifier", "profile:username", "profile:name", "profile:employments", "iam:authorization"];
  for (const code of Object.values(clients)) {
    const config =
      code === clients.oidc
        ? {
            protocol: "oidc",
            clientType: "confidential",
            redirectUris: [redirectUri],
            postLogoutRedirectUris: [],
            allowedScopes: ["openid", "profile", "iam:employments", "iam:authorization"],
          }
        : {
            protocol: "custom-sso",
            callbackType: code === clients.managed ? "managed" : "business",
            ...(code === clients.managed ? {} : { callbackEndpoint: "https://rp.example/callback" }),
            validRedirectUrls: [redirectUri],
            subjectClaims: claims,
          };
    await h.sql`INSERT INTO client (client_code,client_name,client_secret,status,is_delete,ext_attributes,sso_enabled,sso_config,sso_secret,sso_credential_id,sso_secret_updated_at)
      VALUES (${code},${code},${`internal-${code}`},1,false,'{}',true,${JSON.stringify(config)}::jsonb,${secret},${randomUUID()},NOW())`;
  }
  await h.sql`INSERT INTO organization (id,org_code,org_name,path,level,org_type) VALUES (1,'ROOT','Root','/1',1,'分公司')`;
  await h.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0)`;
  await h.sql`INSERT INTO position (id,post_code,post_name) VALUES (1,'MANAGER','Manager')`;
  await h.sql`INSERT INTO employment (id,user_id,pos_id,dept_id,is_primary,status,start_time) VALUES (1,1,1,1,true,1,'2026-01-01T00:00:00Z'),(2,2,1,1,true,1,'2026-01-01T00:00:00Z')`;
  await h.sql`INSERT INTO role (id,role_code,role_name,client_id,status)
    SELECT row_number() OVER (ORDER BY id), client_code || '-reader','Reader',id,1 FROM client WHERE client_code <> ${clients.empty}`;
  await h.sql`INSERT INTO role_assignment (role_id,target_type,target_id,include_descendants) SELECT id,'employment',1,false FROM role`;
  await h.sql`INSERT INTO privilege (id,privilege_code,privilege_name,status,is_delete) VALUES (1,'old-read','Old read',1,false)`;
  await h.sql`INSERT INTO role_privilege (role_id,privilege_id) SELECT id,1 FROM role`;
  await h.sql`INSERT INTO client_delegation (delegator_user_id,delegatee_user_id,client_id,organization_scope_id,start_time,end_time,status,description)
    SELECT 1,2,id,1,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z',2,'Preserved' FROM client WHERE client_code=${clients.custom}`;
  await h.sql`INSERT INTO audit_log (action,outcome,actor_type,actor_client_code,target_type,target_id,source_app,details)
    VALUES ('privilege.create','success','client',${clients.custom},'privilege',1,'iam','{"historical":true}')`;
  return await h.sql<
    { id: number; subject_identifier: string }[]
  >`SELECT id,subject_identifier FROM "user" ORDER BY id`;
}

export async function sourceFingerprint(h: CutoverDatabase, auditUpperId = 2147483647) {
  const [row] = await h.sql`SELECT jsonb_build_object(
    'users',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "user" t),
    'clients',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM client t),
    'organizations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM organization t),
    'closure',(SELECT jsonb_agg(to_jsonb(t) ORDER BY ancestor_id,descendant_id) FROM organization_closure t),
    'positions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM position t),
    'roles',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM role t),
    'assignments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM role_assignment t),
    'employments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM employment t),
    'delegations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM client_delegation t),
    'audits',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_log t WHERE id <= ${auditUpperId})
  ) AS inventory`;
  return createHmac("sha256", fingerprintKey).update(JSON.stringify(row?.inventory)).digest("hex");
}
