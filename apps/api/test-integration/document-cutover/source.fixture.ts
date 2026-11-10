import { execFile } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { hashSecret } from "@iam/runtime/security/bcrypt";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sm2 } from "sm-crypto";
import { z } from "zod";
import { check } from "./check.fixture";

export const BASELINE_COMMIT = "95dc4871c62e36b63b26a3f71c5670ae449c79e2";
export const BASELINE_MANIFEST_SHA256 = "ba67791da1d687c96c27c6514e756c66fd18a98e2f7ffc8d7494eb58fb76d978";
export const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const execute = promisify(execFile);

export async function requireCandidate(candidate: string) {
  check(/^[a-f0-9]{40}$/u.test(candidate), "Candidate must be a full commit SHA");
  const { stdout: head } = await execute("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
  const { stdout: status } = await execute("git", ["status", "--porcelain"], { cwd: repositoryRoot });
  check(head.trim() === candidate, "Candidate does not match actual checkout HEAD");
  check(status.trim() === "", "Candidate checkout must be clean");
  return candidate;
}
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
    typeof import("@iam/subject-access"),
    "requireSubjectAccessOperation" | "createSubjectAccessOperations" | "createSubjectAccessBarrier"
  > &
  Pick<typeof import("@iam/subject-access/redis"), "createRedisSubjectAccessStore" | "createSubjectAccessBootstrap"> &
  Pick<typeof import("@iam/subject-access/session-kernel"), "createUnifiedSubjectAccessSessionRevocation"> &
  Pick<typeof import("@iam/custom-sso/testing"), "createUnifiedCustomSsoRedisTestScope"> &
  Pick<typeof import("@iam/oidc/testing"), "createOidcRedisTestScope"> & {
    BASELINE_SOURCE_COMMIT: string;
    USER_PROFILE_SCHEMA_VERSION: number;
  };

export async function readBaseline(manifestPath: string) {
  const root = dirname(resolve(manifestPath));
  const bytes = await readFile(manifestPath);
  check(createHash("sha256").update(bytes).digest("hex") === BASELINE_MANIFEST_SHA256, "Unapproved baseline manifest");
  const manifest = manifestSchema.parse(JSON.parse(bytes.toString("utf8")));
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
  check(owners.USER_PROFILE_SCHEMA_VERSION === 4, "Old owner bundle is not Profile v4");
  return { root, runtime: join(root, "runtime"), owners, migrations: join(root, "migrations") };
}

export async function readCandidate(manifestPath: string, candidate: string) {
  await requireCandidate(candidate);
  const root = dirname(resolve(manifestPath));
  const manifest = z
    .object({
      sourceCommit: z.literal(candidate),
      autoloadDotenv: z.literal(false),
      autoloadBunfig: z.literal(false),
      externalWorkspaceImports: z.array(z.string()).length(0),
      runtimeFiles: z.array(hashedFile).min(8),
      migrationFiles: z.array(hashedFile).min(59),
    })
    .parse(JSON.parse(await readFile(manifestPath, "utf8")));
  for (const file of [...manifest.runtimeFiles, ...manifest.migrationFiles]) {
    const path = resolve(root, file.path);
    check(!relative(root, path).startsWith(".."), "Candidate path escaped artifact root");
    check(
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex") === file.sha256,
      "Candidate artifact checksum mismatch",
    );
  }
  return { root, runtime: join(root, "runtime"), migrations: join(root, "migrations") };
}

export async function createCutoverDatabase(
  databaseUrl: string,
  sourceMigrations: string,
  candidateMigrations: string,
) {
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
      migrateCurrent: () => migrateFrom(candidateMigrations),
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
  oidcOther: "cutover-oidc-other",
  empty: "cutover-empty",
  internal: "cutover-internal-only",
};
export const redirectUri = "https://rp.example/complete";
export const secret = "cutover-synthetic-sso-secret";
export const password = "Cutover-283-synthetic-password!";
export const loginKeys = sm2.generateKeyPairHex();

export async function seedSource(h: CutoverDatabase) {
  await h.sql`INSERT INTO "user" (id,username,name,status,is_delete,password)
    VALUES (1,'alice','Alice',1,false,${await hashSecret(password, 4)}),(2,'bob','Bob',1,false,NULL),
      (3,'disabled','Disabled',3,false,NULL),(4,'deleted','Deleted',3,true,NULL),(5,'paused','Paused',2,false,NULL)`;
  const claims = ["subjectIdentifier", "profile:username", "profile:name", "profile:employments", "iam:authorization"];
  for (const code of Object.values(clients)) {
    const config =
      code === clients.oidc || code === clients.oidcOther
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
      VALUES (${code},${code},${`internal-${code}`},1,false,'{}',${code !== clients.internal},${JSON.stringify(config)}::jsonb,${secret},${randomUUID()},NOW())`;
  }
  await h.sql`INSERT INTO organization (id,org_code,org_name,parent_id,path,level,org_type,status,is_delete) VALUES
    (1,'ROOT','Root',-1,'/1',1,'分公司',1,false),(2,'PAUSED','Paused org',1,'/1/2',2,'分公司',2,false),
    (3,'DISABLED','Disabled org',1,'/1/3',2,'分公司',3,false),(4,'DELETED','Deleted org',1,'/1/4',2,'分公司',3,true)`;
  await h.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0),(1,2,1),(2,2,0),(1,3,1),(3,3,0),(1,4,1),(4,4,0)`;
  await h.sql`INSERT INTO position (id,post_code,post_name) VALUES (1,'MANAGER','Manager')`;
  await h.sql`INSERT INTO employment (id,user_id,pos_id,dept_id,is_primary,status,start_time) VALUES (1,1,1,1,true,1,'2026-01-01T00:00:00Z'),(2,2,1,1,true,1,'2026-01-01T00:00:00Z')`;
  await h.sql`INSERT INTO role (id,role_code,role_name,client_id,status)
    SELECT row_number() OVER (ORDER BY id), client_code || '-reader','Reader',id,1 FROM client WHERE client_code <> ${clients.empty}`;
  await h.sql`INSERT INTO role_assignment (role_id,target_type,target_id,include_descendants) SELECT id,'employment',1,false FROM role`;
  await h.sql`INSERT INTO client_delegation (delegator_user_id,delegatee_user_id,client_id,organization_scope_id,start_time,end_time,status,description)
    SELECT 1,2,id,1,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z',2,'Preserved' FROM client WHERE client_code=${clients.custom}`;
  await h.sql`INSERT INTO audit_log (action,outcome,actor_type,actor_client_code,target_type,target_id,source_app,details)
    VALUES ('user.update','success','client',${clients.custom},'user',1,'iam','{"historical":true}')`;
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
    'roles',(SELECT jsonb_agg(jsonb_build_object('role_type','client') || to_jsonb(t) ORDER BY id) FROM role t),
    'assignments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM role_assignment t),
    'employments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM employment t),
    'responsibilities',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM organization_responsibility_assignment t),
    'delegations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM client_delegation t),
    'audits',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_log t WHERE id <= ${auditUpperId})
  ) AS inventory`;
  return createHmac("sha256", fingerprintKey).update(JSON.stringify(row?.inventory)).digest("hex");
}
