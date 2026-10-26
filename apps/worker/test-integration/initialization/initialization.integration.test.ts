import { expect, test } from "bun:test";
import {
  initializeSourceFacts,
  verifyInitializationSource,
} from "../../src/commands/initialization/initialization-source";
import { createWorkerPostgresTestHarness } from "../support/postgres-test-harness";
import { fixtureInput } from "./fixtures";

test("空库迁移后建立最小真实授权事实，重复初始化不重置账号/凭据/关系", async () => {
  const pg = await createWorkerPostgresTestHarness();
  try {
    const { input, secrets } = fixtureInput();
    const first = await initializeSourceFacts(pg.db, input, secrets);
    expect(first.created).toBe(true);
    const before = [
      ...(await pg.sql`select jsonb_build_object('user',to_jsonb(u),'employment',to_jsonb(e),'role',to_jsonb(r),'assignment',to_jsonb(a)) as record
      from "user" u join employment e on e.user_id=u.id join role_assignment a on a.target_id=e.id and a.target_type='employment'
      join role r on r.id=a.role_id where u.id=${first.userId}`),
    ];
    expect(before).toHaveLength(1);
    expect(before[0]!.record.role.role_code).toBe("iam:admin");
    expect(before[0]!.record.assignment.include_descendants).toBe(false);
    expect(before[0]!.record.employment.is_primary).toBe(true);
    const credentials = [
      ...(await pg.sql`select client_code,client_secret,sso_secret,sso_credential_id,sso_secret_updated_at from client order by client_code`),
    ];
    expect(credentials.map((row) => row.client_code)).toEqual(["gds", "iam", "iam-admin"]);
    const repeated = await initializeSourceFacts(pg.db, input, secrets);
    expect(repeated).toEqual({ ...first, created: false });
    const verified = await verifyInitializationSource(pg.db, input, secrets);
    expect(verified).toEqual({ userId: first.userId, subjectIdentifier: first.subjectIdentifier });
    const after = [
      ...(await pg.sql`select jsonb_build_object('user',to_jsonb(u),'employment',to_jsonb(e),'role',to_jsonb(r),'assignment',to_jsonb(a)) as record
      from "user" u join employment e on e.user_id=u.id join role_assignment a on a.target_id=e.id and a.target_type='employment'
      join role r on r.id=a.role_id where u.id=${first.userId}`),
    ];
    expect(after).toEqual(before);
    const credentialsAfter = [
      ...(await pg.sql`select client_code,client_secret,sso_secret,sso_credential_id,sso_secret_updated_at from client order by client_code`),
    ];
    expect(credentialsAfter).toEqual(credentials);
    const [closure] =
      await pg.sql`select c.depth,o.path,o.id from organization_closure c join organization o on c.ancestor_id=o.id and c.descendant_id=o.id`;
    expect(closure!.depth).toBe(0);
    expect(closure!.path).toBe(`/${closure!.id}`);
  } finally {
    await pg.close();
  }
}, 30_000);

test("授权登记的原生 PG 失败回滚所有源事实，可沿正常入口重试", async () => {
  const pg = await createWorkerPostgresTestHarness();
  try {
    const { input, secrets } = fixtureInput();
    await pg.sql.unsafe(
      "create function reject_initial_assignment() returns trigger language plpgsql as $$ begin raise exception 'controlled assignment failure'; end $$",
    );
    await pg.sql.unsafe(
      "create trigger reject_initial_assignment before insert on role_assignment for each row execute function reject_initial_assignment()",
    );
    let failure: unknown;
    try {
      await initializeSourceFacts(pg.db, input, secrets);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const counts = [
      ...(await pg.sql`select (select count(*)::int from "user") as users,(select count(*)::int from client) as clients,
      (select count(*)::int from organization) as organizations,(select count(*)::int from position) as positions,
      (select count(*)::int from employment) as employments,(select count(*)::int from role) as roles,
      (select count(*)::int from organization_closure) as closures,(select count(*)::int from role_assignment) as assignments`),
    ];
    expect(counts).toEqual([
      { users: 0, clients: 0, organizations: 0, positions: 0, employments: 0, roles: 0, closures: 0, assignments: 0 },
    ]);
    await pg.sql.unsafe("drop trigger reject_initial_assignment on role_assignment");
    const retried = await initializeSourceFacts(pg.db, input, secrets);
    expect(retried.created).toBe(true);
  } finally {
    await pg.close();
  }
}, 30_000);

test("未知已有 Client 不是空库，初始化不会接管或补出半套管理员", async () => {
  const pg = await createWorkerPostgresTestHarness();
  try {
    const { input, secrets } = fixtureInput();
    await pg.sql`insert into client(client_code,client_name,client_secret,ext_attributes) values ('unrelated','已有 Client','controlled-unchanged','{}')`;
    let failure: unknown;
    try {
      await initializeSourceFacts(pg.db, input, secrets);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const existing = [...(await pg.sql`select client_code,client_name,client_secret from client`)];
    expect(existing).toEqual([
      { client_code: "unrelated", client_name: "已有 Client", client_secret: "controlled-unchanged" },
    ]);
    const users = [...(await pg.sql`select id from "user"`)];
    const organizations = [...(await pg.sql`select id from organization`)];
    expect(users).toEqual([]);
    expect(organizations).toEqual([]);
  } finally {
    await pg.close();
  }
}, 30_000);

test("并发首次初始化只产生一套事实，失败调用可以同输入重试", async () => {
  const pg = await createWorkerPostgresTestHarness();
  try {
    const { input, secrets } = fixtureInput();
    const attempts = await Promise.allSettled([
      initializeSourceFacts(pg.db, input, secrets),
      initializeSourceFacts(pg.db, input, secrets),
    ]);
    expect(attempts.some((item) => item.status === "fulfilled")).toBe(true);
    const counts = [
      ...(await pg.sql`select (select count(*)::int from "user") as users,(select count(*)::int from client) as clients,(select count(*)::int from role_assignment) as assignments`),
    ];
    expect(counts).toEqual([{ users: 1, clients: 3, assignments: 1 }]);
    const retried = await initializeSourceFacts(pg.db, input, secrets);
    expect(retried.created).toBe(false);
  } finally {
    await pg.close();
  }
}, 30_000);
