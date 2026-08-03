import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { analyzeRepositoryArchitecture } from "../architecture-guard";

const fixtureRoots: string[] = [];
const architectureGuardCli = join(import.meta.dirname, "..", "check-architecture.ts");

afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("repository architecture guard", () => {
  test("reports locatable violations when a production port imports a concrete repository", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.port.ts": [
        "// Consumer contract.",
        "import type { UserRepository } from \"./user.repository\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "consumer-owned-port",
        file: "apps/api/src/services/user/user.port.ts",
        line: 2,
        message: "Consumer-owned ports must not import concrete repository module \"./user.repository\"; "
          + "declare the required protocol locally.",
      },
    ]);
  });

  test("reports provider ownership inherited through repository directories and Pick", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin-api/src/use-cases/find-user/find-user.port.ts": [
        "import type { UserRepository } from \"../../repositories/user\";",
        "interface UserService { findUser: () => Promise<unknown> }",
        "type UserReader = Pick<UserRepository, \"findUser\">;",
        "type UserLookup = Pick<UserService, \"findUser\">;",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "consumer-owned-port",
        file: "apps/admin-api/src/use-cases/find-user/find-user.port.ts",
        line: 1,
        message: "Consumer-owned ports must not import concrete repository module \"../../repositories/user\"; "
          + "declare the required protocol locally.",
      },
      {
        ruleId: "consumer-owned-port",
        file: "apps/admin-api/src/use-cases/find-user/find-user.port.ts",
        line: 3,
        message: "Consumer-owned ports must not derive their interface from provider type \"UserRepository\" with Pick; "
          + "declare the required members directly.",
      },
      {
        ruleId: "consumer-owned-port",
        file: "apps/admin-api/src/use-cases/find-user/find-user.port.ts",
        line: 4,
        message: "Consumer-owned ports must not derive their interface from provider type \"UserService\" with Pick; "
          + "declare the required members directly.",
      },
    ]);
  });

  test("allows consumer and platform narrowing while excluding non-production sources", () => {
    const allowedPort = [
      "import type { IncomingMessage } from \"node:http\";",
      "import type { UserProfile } from \"@iam/domain/user\";",
      "interface UserProfilePort { find: (id: string) => Promise<UserProfile> }",
      "type HeaderRequest = Pick<IncomingMessage, \"headers\">;",
      "type UserProfileReader = Pick<UserProfilePort, \"find\">;",
    ].join("\n");
    const forbiddenPort = "import type { UserRepository } from \"./user.repository\";";
    const repoRoot = createFixtureRepository({
      "apps/worker/src/modules/user-profile/user-profile.port.ts": allowedPort,
      "apps/worker/src/modules/__tests__/test.port.ts": forbiddenPort,
      "apps/worker/src/modules/testing/helper.port.ts": forbiddenPort,
      "apps/worker/src/modules/generated/client.port.ts": forbiddenPort,
      "apps/worker/src/dist/output.port.ts": forbiddenPort,
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("rejects dedicated Role Assignment schema dependencies outside its owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/employment/employment.repository.ts":
        "import { roleAssignments } from \"@iam/db/schema/role-assignments\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "role-resolution-owner",
        file: "apps/api/src/services/employment/employment.repository.ts",
        line: 1,
        message: "Only Role Assignment Resolver implementation and the Admin Role Management repository "
          + "may import dedicated Role Assignment schema entry \"@iam/db/schema/role-assignments\".",
      },
    ]);
  });

  test("allows dedicated schema owners and leaves broad shared surfaces unrestricted", () => {
    const repoRoot = createFixtureRepository({
      "packages/role-assignment-resolution/src/internal/resolver.ts":
        "import { roleAssignments } from \"@iam/db/schema/role-assignments\";",
      "apps/admin-api/src/services/role/role.repository.ts":
        "export * from \"@iam/db/schema/role-assignments\";",
      "apps/api/src/services/user/user.repository.ts": [
        "import \"@iam/db/schema\";",
        "import \"@iam/contracts\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("rejects Role Assignment Resolver value dependencies outside composition and module owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        "import \"@iam/role-assignment-resolution\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "role-resolution-owner",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
        message: "Only declared composition and User Profile module owners may value-import "
          + "Role Assignment Resolver package \"@iam/role-assignment-resolution\".",
      },
    ]);
  });

  test("allows resolver type contracts and value dependencies in declared owners", () => {
    const valueImport
      = "import { createRoleAssignmentResolver } from \"@iam/role-assignment-resolution\";";
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.port.ts":
        "import type { RoleAssignmentResolver } from \"@iam/role-assignment-resolution\";",
      "apps/admin-api/src/composition/index.ts": valueImport,
      "packages/user-profile-read-model/src/user-profile-invalidation.ts": valueImport,
      "packages/user-profile-read-model/src/user-profile-worker.module.ts": valueImport,
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("rejects User Profile producer and worker dependencies outside their corresponding owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        "export type { UserProfileInvalidation } from \"@iam/user-profile-read-model/producer\";",
      "apps/admin-api/src/services/user/user.service.ts":
        "import { createUserProfileWorkerModule } from \"@iam/user-profile-read-model/worker\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "user-profile-owner",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 1,
        message: "Only Worker composition may import "
          + "User Profile worker entry \"@iam/user-profile-read-model/worker\".",
      },
      {
        ruleId: "user-profile-owner",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
        message: "Only API and Admin API composition owners may re-export "
          + "User Profile producer entry \"@iam/user-profile-read-model/producer\".",
      },
    ]);
  });

  test("rejects User Profile query repository dependencies outside API composition", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        "import type { UserProfileRepository } from \"@iam/user-profile-read-model/query/repository\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "user-profile-owner",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
        message: "Only API composition may import "
          + "User Profile query repository entry \"@iam/user-profile-read-model/query/repository\".",
      },
    ]);
  });

  test("rejects complementary User Profile owner dependency kinds", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        "import { createUserProfileJobProducer } from \"@iam/user-profile-read-model/producer\";",
      "apps/admin-api/src/services/user/user.type.ts":
        "import type { UserProfileJobProcessor } from \"@iam/user-profile-read-model/worker\";",
      "apps/admin-api/src/services/user/user.service.ts":
        "import { createUserProfileRepository } from \"@iam/user-profile-read-model/query/repository\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "user-profile-owner",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 1,
        message: "Only API composition may import "
          + "User Profile query repository entry \"@iam/user-profile-read-model/query/repository\".",
      },
      {
        ruleId: "user-profile-owner",
        file: "apps/admin-api/src/services/user/user.type.ts",
        line: 1,
        message: "Only Worker composition may import "
          + "User Profile worker entry \"@iam/user-profile-read-model/worker\".",
      },
      {
        ruleId: "user-profile-owner",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
        message: "Only API and Admin API composition owners may import "
          + "User Profile producer entry \"@iam/user-profile-read-model/producer\".",
      },
    ]);
  });

  test("allows User Profile owners plus root and query consumers", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/composition/index.ts":
        "import \"@iam/user-profile-read-model/producer\";",
      "apps/api/src/composition/repositories/index.ts":
        "import { createUserProfileRepository } from \"@iam/user-profile-read-model/query/repository\";",
      "apps/admin-api/src/composition/index.ts":
        "import type { UserProfileInvalidation } from \"@iam/user-profile-read-model/producer\";",
      "apps/worker/src/composition/index.ts":
        "import { createUserProfileWorkerModule } from \"@iam/user-profile-read-model/worker\";",
      "apps/api/src/services/user/user.service.ts":
        "import type { UserProfileQueryService } from \"@iam/user-profile-read-model\";",
      "apps/admin-api/src/services/user/user.type.ts":
        "export type { UserProfileQueryService } from \"@iam/user-profile-read-model/query\";",
      "apps/oidc-provider/src/repositories/profile.ts":
        "import \"@iam/user-profile-read-model\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("allows Projection implementation ports and Custom SSO public interface consumption", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/internal/client-subject-projection.ts":
        "import type { SubjectFactsPort } from \"../index.ts\";",
      "packages/client-subject-projection/src/custom-sso.ts": [
        "import type { ClientSubjectProjection } from \"./index.ts\";",
        "export type { ClientSubjectProjectionService } from \"@iam/client-subject-projection\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("keeps every Projection core source independent of client protocol configuration", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/catalog.ts": [
        "import type { ClientDto } from \"@iam/domain/client\";",
        "import type { RelativeClientDto } from \"../../domain/src/client/index.ts\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 1,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"@iam/domain/client\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 2,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"../../domain/src/client/index.ts\"; depend on its injected facts and safety ports.",
      },
    ]);
  });

  test("rejects Hono package subpaths from both Projection core and wire sources", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/catalog.ts":
        "import type { CookieOptions } from \"hono/cookie\";",
      "packages/client-subject-projection/src/custom-sso.ts":
        "import type { Context } from \"hono/types\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 1,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"hono/cookie\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/custom-sso.ts",
        line: 1,
        message: "Custom SSO wire adapter must not import facts persistence, configuration, runtime, "
          + "or transport module \"hono/types\"; "
          + "depend only on the root public Client Subject Projection interface.",
      },
    ]);
  });

  test("matches blocked external package roots only at exact or slash-subpath boundaries", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/catalog.ts": [
        "import type { Redis } from \"ioredis/built/Redis\";",
        "import type { RedisClient } from \"redis/client\";",
        "import type { ProviderHelper } from \"oidc-provider/lib/helpers\";",
        "import type { Honorable } from \"honorable\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 1,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"ioredis/built/Redis\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 2,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"redis/client\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 3,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"oidc-provider/lib/helpers\"; depend on its injected facts and safety ports.",
      },
    ]);
  });

  test("maps every app and Gateway workspace package to its production owner", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/catalog.ts": [
        "import \"@iam/admin/routes/client\";",
        "import \"@iam/admin-api/routes/client\";",
        "import \"@iam/api\";",
        "import \"@iam/oidc-provider/session\";",
        "import \"@iam/sso/pages/login\";",
        "import \"@iam/worker/queues\";",
      ].join("\n"),
      "packages/client-subject-projection/src/custom-sso.ts":
        "import \"@iam/gateway-apisix/planner\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 1,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"@iam/admin/routes/client\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 2,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"@iam/admin-api/routes/client\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 3,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"@iam/api\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 4,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"@iam/oidc-provider/session\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 5,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"@iam/sso/pages/login\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/catalog.ts",
        line: 6,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"@iam/worker/queues\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/custom-sso.ts",
        line: 1,
        message: "Custom SSO wire adapter must not import facts persistence, configuration, runtime, "
          + "or transport module \"@iam/gateway-apisix/planner\"; "
          + "depend only on the root public Client Subject Projection interface.",
      },
    ]);
  });

  test("keeps the Custom SSO wire mapper independent of facts and runtime owners", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/custom-sso.ts": [
        "import type { SubjectFactsReader } from \"@iam/user-profile-read-model/query\";",
        "import type { Context } from \"hono\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/custom-sso.ts",
        line: 1,
        message: "Custom SSO wire adapter must not import facts persistence, configuration, runtime, "
          + "or transport module \"@iam/user-profile-read-model/query\"; "
          + "depend only on the root public Client Subject Projection interface.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/custom-sso.ts",
        line: 2,
        message: "Custom SSO wire adapter must not import facts persistence, configuration, runtime, "
          + "or transport module \"hono\"; "
          + "depend only on the root public Client Subject Projection interface.",
      },
    ]);
  });

  test("normalizes canonical self-imports before enforcing the Projection protocol edge", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/internal/client-subject-projection.ts":
        "import type { CustomSsoSubjectProjectionV1 } "
        + "from \"@iam/client-subject-projection/custom-sso\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/internal/client-subject-projection.ts",
        line: 1,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"@iam/client-subject-projection/custom-sso\"; "
          + "depend on its injected facts and safety ports.",
      },
    ]);
  });

  test("keeps the Custom SSO wire mapper on the root public Projection interface", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/custom-sso.ts":
        "import { SUBJECT_CLAIM_CATALOG_V1 } from \"./catalog.ts\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/custom-sso.ts",
        line: 1,
        message: "Custom SSO wire adapter must not import non-root Projection module \"./catalog.ts\"; "
          + "depend only on the root public Client Subject Projection interface.",
      },
    ]);
  });

  test("keeps Projection implementation protocol-neutral and its wire adapter behind the public interface", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/internal/client-subject-projection.ts": [
        "import type { Context } from \"hono\";",
        "import type { UserProfileQuery } from \"@iam/user-profile-read-model/query\";",
        "import type { CustomSsoSubjectProjectionV1 } from \"../custom-sso.ts\";",
      ].join("\n"),
      "packages/client-subject-projection/src/custom-sso.ts":
        "import { createClientSubjectProjectionService } from \"./internal/client-subject-projection.ts\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/custom-sso.ts",
        line: 1,
        message: "Custom SSO wire adapter must not import non-root Projection module "
          + "\"./internal/client-subject-projection.ts\"; "
          + "depend only on the root public Client Subject Projection interface.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/internal/client-subject-projection.ts",
        line: 1,
        message: "Client Subject Projection implementation must not import runtime or protocol module \"hono\"; "
          + "depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/internal/client-subject-projection.ts",
        line: 2,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"@iam/user-profile-read-model/query\"; depend on its injected facts and safety ports.",
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/internal/client-subject-projection.ts",
        line: 3,
        message: "Client Subject Projection implementation must not import runtime or protocol module "
          + "\"../custom-sso.ts\"; depend on its injected facts and safety ports.",
      },
    ]);
  });

  test("keeps Custom SSO routes and use cases behind session runtime interfaces", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/sso/sso.handlers.ts": [
        "import type { SessionKernel } from \"@iam/api-core/session/kernel.ts\";",
        "import type { RedisPort } from \"@api/lib/infra/redis\";",
      ].join("\n"),
      "apps/api/src/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case.ts": [
        "import type { SessionService } from \"@iam/api-core/session\";",
        "import type { CustomSsoSessionKernelAdapter } "
        + "from \"@api/services/session/custom-sso-session-kernel.adapter.ts\";",
        "import type { OrcasClient } from \"@api/lib/integrations/orcas\";",
      ].join("\n"),
      "apps/api/src/composition/services/index.ts": [
        "import { createSessionKernel } from \"@iam/api-core/session/kernel\";",
        "import { createCustomSsoSessionKernelAdapter } "
        + "from \"@api/services/session/custom-sso-session-kernel.adapter\";",
        "import redis from \"@api/lib/infra/redis\";",
        "import { createOrcasClient } from \"@api/lib/integrations/orcas\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "session-runtime-owner",
        file: "apps/api/src/routes/sso/sso.handlers.ts",
        line: 1,
        message: "Custom SSO routes and use cases must not import session runtime module "
          + "\"@iam/api-core/session/kernel.ts\"; depend on their injected application interface.",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/api/src/routes/sso/sso.handlers.ts",
        line: 2,
        message: "Custom SSO routes and use cases must not import session runtime module "
          + "\"@api/lib/infra/redis\"; depend on their injected application interface.",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/api/src/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case.ts",
        line: 1,
        message: "Custom SSO routes and use cases must not import session runtime module "
          + "\"@iam/api-core/session\"; depend on their injected application interface.",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/api/src/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case.ts",
        line: 2,
        message: "Custom SSO routes and use cases must not import session runtime module "
          + "\"@api/services/session/custom-sso-session-kernel.adapter.ts\"; "
          + "depend on their injected application interface.",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/api/src/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case.ts",
        line: 3,
        message: "Custom SSO routes and use cases must not import session runtime module "
          + "\"@api/lib/integrations/orcas\"; depend on their injected application interface.",
      },
    ]);
  });

  test("keeps Admin user and client services behind the Session Revocation port", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin-api/src/services/client/client.service.ts": [
        "import type { OidcRuntime } from \"@iam/api-core/oidc\";",
        "import type { OidcSessionAdapter } "
        + "from \"@admin-api/services/session/oidc-session-kernel.adapter.ts\";",
        "import type { Redis } from \"@admin-api/lib/infra/redis\";",
      ].join("\n"),
      "apps/admin-api/src/services/user/user.service.ts": [
        "import type { SessionKernel } from \"@iam/api-core/session/kernel\";",
        "import type { SessionKernelKey } from \"@iam/api-core/session/kernel/keys.ts\";",
        "import type { CustomSsoSessionAdapter } "
        + "from \"@admin-api/services/session/custom-sso-session-kernel.adapter\";",
      ].join("\n"),
      "apps/admin-api/src/services/session-revocation/session-revocation.port.ts":
        "import type { SessionKernel } from \"@iam/api-core/session/kernel\";",
      "apps/admin-api/src/composition/session/index.ts": [
        "import { createSessionKernel } from \"@iam/api-core/session/kernel\";",
        "import redis from \"@admin-api/lib/infra/redis\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "session-runtime-owner",
        file: "apps/admin-api/src/services/client/client.service.ts",
        line: 1,
        message: "Admin user and client services must not import session runtime module "
          + "\"@iam/api-core/oidc\"; depend on the consumer-owned Session Revocation port.",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/admin-api/src/services/client/client.service.ts",
        line: 2,
        message: "Admin user and client services must not import session runtime module "
          + "\"@admin-api/services/session/oidc-session-kernel.adapter.ts\"; "
          + "depend on the consumer-owned Session Revocation port.",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/admin-api/src/services/client/client.service.ts",
        line: 3,
        message: "Admin user and client services must not import session runtime module "
          + "\"@admin-api/lib/infra/redis\"; depend on the consumer-owned Session Revocation port.",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 1,
        message: "Admin user and client services must not import session runtime module "
          + "\"@iam/api-core/session/kernel\"; depend on the consumer-owned Session Revocation port.",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 2,
        message: "Admin user and client services must not import session runtime module "
          + "\"@iam/api-core/session/kernel/keys.ts\"; depend on the consumer-owned Session Revocation port.",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 3,
        message: "Admin user and client services must not import session runtime module "
          + "\"@admin-api/services/session/custom-sso-session-kernel.adapter\"; "
          + "depend on the consumer-owned Session Revocation port.",
      },
    ]);
  });

  test("keeps OIDC database, Redis, and logger value edges behind their owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/oidc-provider/src/provider/claims.ts": [
        "import db from \"@iam/db\";",
        "import { users } from \"@iam/db/schema\";",
      ].join("\n"),
      "apps/oidc-provider/src/provider/create-provider.ts":
        "import { createLogger } from \"../lib/logger.ts\";",
      "apps/oidc-provider/src/provider/middleware.ts":
        "import redis from \"../lib/redis.ts\";",
      "apps/oidc-provider/src/invalidation/client-invalidation.ts":
        "import Redis from \"ioredis\";",
      "apps/oidc-provider/src/composition/index.ts": [
        "import db from \"@iam/db\";",
        "import { createLogger } from \"../lib/logger.ts\";",
        "import { createProviderRedis } from \"../lib/redis.ts\";",
      ].join("\n"),
      "apps/oidc-provider/src/composition/provider/index.ts":
        "import type { Redis } from \"ioredis\";",
      "apps/oidc-provider/src/repositories/account.repository.ts": [
        "import type { DbClient } from \"@iam/db\";",
        "import { users } from \"@iam/db/schema\";",
      ].join("\n"),
      "apps/oidc-provider/src/stores/client.store.ts":
        "import Redis from \"ioredis\";",
      "apps/oidc-provider/src/storage/redis-adapter.ts":
        "import { Redis } from \"ioredis\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/invalidation/client-invalidation.ts",
        line: 1,
        message: "Only OIDC stores and storage modules may value-import Redis client \"ioredis\".",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/provider/claims.ts",
        line: 1,
        message: "Only OIDC composition may value-import runtime infrastructure module \"@iam/db\".",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/provider/claims.ts",
        line: 2,
        message: "Only OIDC repository implementations may value-import database schema \"@iam/db/schema\".",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/provider/create-provider.ts",
        line: 1,
        message: "Only OIDC composition may value-import runtime infrastructure module \"../lib/logger.ts\".",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/provider/middleware.ts",
        line: 1,
        message: "Only OIDC composition may value-import runtime infrastructure module \"../lib/redis.ts\".",
      },
    ]);
  });

  test("keeps OIDC implementation materialization in its corresponding composition owner", () => {
    const repoRoot = createFixtureRepository({
      "apps/oidc-provider/src/provider/claims.ts":
        "import { createOidcAccountRepository } from \"../repositories/account.repository.ts\";",
      "apps/oidc-provider/src/provider/create-provider.ts":
        "import { createOidcAdapterFactory } from \"../storage/redis-adapter.ts\";",
      "apps/oidc-provider/src/provider/middleware.ts": [
        "import { createClientAuthRateLimiter } from \"../security/client-auth-rate-limit.ts\";",
        "import { createOidcClientSecretVerifier } from \"../security/client-secret-verifier.ts\";",
        "import { createSessionKernel } from \"@iam/api-core/session/kernel\";",
      ].join("\n"),
      "apps/oidc-provider/src/interaction/handler.ts":
        "import { createOidcSessionKernelAdapter } from \"../session/oidc-session-kernel.adapter.ts\";",
      "apps/oidc-provider/src/session/oidc-session-kernel.adapter.ts":
        "import { sessionOk } from \"@iam/api-core/session/kernel\";",
      "apps/oidc-provider/src/composition/repositories/index.ts":
        "import { createOidcAccountRepository } from \"../../repositories/account.repository.ts\";",
      "apps/oidc-provider/src/composition/provider/index.ts":
        "import { createOidcAdapterFactory } from \"../../storage/redis-adapter.ts\";",
      "apps/oidc-provider/src/composition/stores/index.ts":
        "import { createOidcProtocolObjectStore } from \"../../storage/redis-adapter.ts\";",
      "apps/oidc-provider/src/composition/security/index.ts": [
        "import { createClientAuthRateLimiter } from \"../../security/client-auth-rate-limit.ts\";",
        "import { createOidcClientSecretVerifier } from \"../../security/client-secret-verifier.ts\";",
      ].join("\n"),
      "apps/oidc-provider/src/composition/session/index.ts": [
        "import { createSessionKernel } from \"@iam/api-core/session/kernel\";",
        "import { createOidcSessionKernelAdapter } from \"../../session/oidc-session-kernel.adapter.ts\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/interaction/handler.ts",
        line: 1,
        message: "Only OIDC session composition may value-import session implementation "
          + "\"../session/oidc-session-kernel.adapter.ts\".",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/provider/claims.ts",
        line: 1,
        message: "Only OIDC repository composition may value-import concrete repository "
          + "\"../repositories/account.repository.ts\".",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/provider/create-provider.ts",
        line: 1,
        message: "Only declared OIDC storage composition owners may value-import storage implementation "
          + "\"../storage/redis-adapter.ts\".",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/provider/middleware.ts",
        line: 1,
        message: "Only OIDC security composition may value-import security implementation "
          + "\"../security/client-auth-rate-limit.ts\".",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/provider/middleware.ts",
        line: 2,
        message: "Only OIDC security composition may value-import security implementation "
          + "\"../security/client-secret-verifier.ts\".",
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/oidc-provider/src/provider/middleware.ts",
        line: 3,
        message: "Only OIDC session composition and its Kernel adapter may value-import Session Kernel module "
          + "\"@iam/api-core/session/kernel\".",
      },
    ]);
  });

  test("keeps Worker production sources off API-private aliases", () => {
    const repoRoot = createFixtureRepository({
      "apps/worker/src/modules/profile.ts": [
        "import type { ApiComposition } from \"@api\";",
        "import type { ApiUserService } from \"@api/services/user/user.service.ts\";",
      ].join("\n"),
      "apps/worker/src/composition/runtime.ts": [
        "import type { ApiRuntime } from \"~api/src\";",
        "import { createApiRuntime } from \"~api/src/composition/runtime/index.ts\";",
      ].join("\n"),
      "apps/worker/src/http/server.ts": [
        "import { createApp } from \"@iam/api-core\";",
        "import type { UserProfileQueryService } from \"@iam/user-profile-read-model\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "worker-ownership",
        file: "apps/worker/src/composition/runtime.ts",
        line: 1,
        message: "Worker production sources must not import API-private module \"~api/src\"; "
          + "depend on a public workspace package.",
      },
      {
        ruleId: "worker-ownership",
        file: "apps/worker/src/composition/runtime.ts",
        line: 2,
        message: "Worker production sources must not import API-private module "
          + "\"~api/src/composition/runtime/index.ts\"; depend on a public workspace package.",
      },
      {
        ruleId: "worker-ownership",
        file: "apps/worker/src/modules/profile.ts",
        line: 1,
        message: "Worker production sources must not import API-private module \"@api\"; "
          + "depend on a public workspace package.",
      },
      {
        ruleId: "worker-ownership",
        file: "apps/worker/src/modules/profile.ts",
        line: 2,
        message: "Worker production sources must not import API-private module "
          + "\"@api/services/user/user.service.ts\"; depend on a public workspace package.",
      },
    ]);
  });

  test("reports missing Docker COPY inputs for consumed architecture workspaces", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/package.json": JSON.stringify({
        name: "@iam/api",
        dependencies: {
          "@iam/role-assignment-resolution": "workspace:*",
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "apps/api/Dockerfile": [
        "FROM node:24-alpine",
        "COPY packages/role-assignment-resolution/package.json ./packages/role-assignment-resolution/",
        "COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/",
      ].join("\n"),
      "packages/role-assignment-resolution/package.json": JSON.stringify({
        name: "@iam/role-assignment-resolution",
      }),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/api/Dockerfile",
        line: 1,
        message: "Docker image @iam/api consumes @iam/role-assignment-resolution but does not COPY "
          + "\"packages/role-assignment-resolution/\" from the workspace.",
      },
      {
        ruleId: "docker-build-closure",
        file: "apps/api/Dockerfile",
        line: 1,
        message: "Docker image @iam/api consumes @iam/user-profile-read-model but does not COPY "
          + "\"packages/user-profile-read-model/package.json\" from the workspace.",
      },
    ]);
  });

  test("follows workspace dependencies when checking Docker build closure", () => {
    const repoRoot = createFixtureRepository({
      "apps/worker/package.json": JSON.stringify({
        name: "@iam/worker",
        dependencies: {
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "apps/worker/Dockerfile": [
        "FROM node:24-alpine",
        "COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/",
        "COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/",
      ].join("\n"),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
        dependencies: {
          "@iam/role-assignment-resolution": "workspace:*",
        },
      }),
      "packages/role-assignment-resolution/package.json": JSON.stringify({
        name: "@iam/role-assignment-resolution",
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/worker/Dockerfile",
        line: 1,
        message: "Docker image @iam/worker consumes @iam/role-assignment-resolution but does not COPY "
          + "\"packages/role-assignment-resolution/\" from the workspace.",
      },
      {
        ruleId: "docker-build-closure",
        file: "apps/worker/Dockerfile",
        line: 1,
        message: "Docker image @iam/worker consumes @iam/role-assignment-resolution but does not COPY "
          + "\"packages/role-assignment-resolution/package.json\" from the workspace.",
      },
    ]);
  });

  test("follows arbitrary intermediate workspaces when checking Docker build closure", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/package.json": JSON.stringify({
        name: "@iam/api",
        dependencies: {
          "@iam/domain": "workspace:*",
        },
      }),
      "apps/api/Dockerfile": [
        "FROM node:24-alpine",
        "COPY packages/domain/package.json ./packages/domain/",
        "COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/",
      ].join("\n"),
      "packages/domain/package.json": JSON.stringify({
        name: "@iam/domain",
        dependencies: {
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/api/Dockerfile",
        line: 1,
        message: "Docker image @iam/api consumes @iam/user-profile-read-model but does not COPY "
          + "\"packages/user-profile-read-model/\" from the workspace.",
      },
    ]);
  });

  test("requires a copied manifest for a devDependency path to protected architecture workspaces", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin/package.json": JSON.stringify({
        name: "@iam/admin",
        devDependencies: {
          "@iam/admin-api": "workspace:*",
        },
      }),
      "apps/admin/Dockerfile": [
        "FROM node:24-alpine",
        "COPY apps/admin-api/ ./apps/admin-api/",
        "COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/",
        "COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/",
      ].join("\n"),
      "apps/admin-api/package.json": JSON.stringify({
        name: "@iam/admin-api",
        dependencies: {
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/admin/Dockerfile",
        line: 1,
        message: "Docker image @iam/admin reaches protected architecture workspaces through @iam/admin-api "
          + "but does not COPY \"apps/admin-api/package.json\" from the workspace.",
      },
    ]);
  });

  test("allows a complete devDependency path to protected architecture workspaces", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin/package.json": JSON.stringify({
        name: "@iam/admin",
        devDependencies: {
          "@iam/admin-api": "workspace:*",
        },
      }),
      "apps/admin/Dockerfile": [
        "FROM node:24-alpine",
        "COPY apps/admin-api/package.json ./apps/admin-api/",
        "COPY apps/admin-api/ ./apps/admin-api/",
        "COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/",
        "COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/",
      ].join("\n"),
      "apps/admin-api/package.json": JSON.stringify({
        name: "@iam/admin-api",
        dependencies: {
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("requires a copied manifest for an optionalDependency path to protected architecture workspaces", () => {
    const repoRoot = createFixtureRepository({
      "apps/worker/package.json": JSON.stringify({
        name: "@iam/worker",
        optionalDependencies: {
          "@iam/optional-profile-bridge": "workspace:*",
        },
      }),
      "apps/worker/Dockerfile": [
        "FROM node:24-alpine",
        "COPY packages/optional-profile-bridge/ ./packages/optional-profile-bridge/",
        "COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/",
        "COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/",
      ].join("\n"),
      "packages/optional-profile-bridge/package.json": JSON.stringify({
        name: "@iam/optional-profile-bridge",
        dependencies: {
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/worker/Dockerfile",
        line: 1,
        message: "Docker image @iam/worker reaches protected architecture workspaces "
          + "through @iam/optional-profile-bridge but does not COPY "
          + "\"packages/optional-profile-bridge/package.json\" from the workspace.",
      },
    ]);
  });

  test("allows a complete optionalDependency path to protected architecture workspaces", () => {
    const repoRoot = createFixtureRepository({
      "apps/worker/package.json": JSON.stringify({
        name: "@iam/worker",
        optionalDependencies: {
          "@iam/optional-profile-bridge": "workspace:*",
        },
      }),
      "apps/worker/Dockerfile": [
        "FROM node:24-alpine",
        "COPY packages/optional-profile-bridge/package.json ./packages/optional-profile-bridge/",
        "COPY packages/optional-profile-bridge/ ./packages/optional-profile-bridge/",
        "COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/",
        "COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/",
      ].join("\n"),
      "packages/optional-profile-bridge/package.json": JSON.stringify({
        name: "@iam/optional-profile-bridge",
        dependencies: {
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("ignores peer-only workspace contracts when computing package-owned Docker closure", () => {
    const repoRoot = createFixtureRepository({
      "apps/worker/package.json": JSON.stringify({
        name: "@iam/worker",
        peerDependencies: {
          "@iam/peer-profile-bridge": "workspace:*",
        },
      }),
      "apps/worker/Dockerfile": "FROM node:24-alpine",
      "packages/peer-profile-bridge/package.json": JSON.stringify({
        name: "@iam/peer-profile-bridge",
        dependencies: {
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("follows explicitly copied workspace manifests in every app Docker image", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin/package.json": JSON.stringify({
        name: "@iam/admin",
      }),
      "apps/admin/Dockerfile": [
        "FROM node:24-alpine",
        "COPY apps/admin-api/package.json ./apps/admin-api/",
        "COPY apps/admin-api/ ./apps/admin-api/",
        "COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/",
        "COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/",
      ].join("\n"),
      "apps/admin-api/package.json": JSON.stringify({
        name: "@iam/admin-api",
        dependencies: {
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "packages/client-subject-projection/package.json": JSON.stringify({
        name: "@iam/client-subject-projection",
      }),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
        dependencies: {
          "@iam/client-subject-projection": "workspace:*",
        },
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/admin/Dockerfile",
        line: 1,
        message: "Docker image @iam/admin consumes @iam/client-subject-projection but does not COPY "
          + "\"packages/client-subject-projection/\" from the workspace.",
      },
      {
        ruleId: "docker-build-closure",
        file: "apps/admin/Dockerfile",
        line: 1,
        message: "Docker image @iam/admin consumes @iam/client-subject-projection but does not COPY "
          + "\"packages/client-subject-projection/package.json\" from the workspace.",
      },
    ]);
  });

  test("allows a complete closure rooted in an explicitly copied workspace manifest", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin/package.json": JSON.stringify({
        name: "@iam/admin",
      }),
      "apps/admin/Dockerfile": [
        "FROM node:24-alpine",
        "COPY apps/admin-api/package.json ./apps/admin-api/",
        "COPY packages/client-subject-projection/package.json ./packages/client-subject-projection/",
        "COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/",
        "COPY apps/admin-api/ ./apps/admin-api/",
        "COPY packages/client-subject-projection/ ./packages/client-subject-projection/",
        "COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/",
      ].join("\n"),
      "apps/admin-api/package.json": JSON.stringify({
        name: "@iam/admin-api",
        dependencies: {
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "packages/client-subject-projection/package.json": JSON.stringify({
        name: "@iam/client-subject-projection",
      }),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
        dependencies: {
          "@iam/client-subject-projection": "workspace:*",
        },
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("allows Docker build contexts closed over direct and transitive architecture workspaces", () => {
    const repoRoot = createFixtureRepository({
      "apps/worker/package.json": JSON.stringify({
        name: "@iam/worker",
        dependencies: {
          "@iam/user-profile-read-model": "workspace:*",
        },
      }),
      "apps/worker/Dockerfile": [
        "FROM node:24-alpine",
        "COPY packages/role-assignment-resolution/package.json ./packages/role-assignment-resolution/",
        "COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/",
        "COPY packages/role-assignment-resolution/ ./packages/role-assignment-resolution/",
        "COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/",
      ].join("\n"),
      "packages/user-profile-read-model/package.json": JSON.stringify({
        name: "@iam/user-profile-read-model",
        dependencies: {
          "@iam/role-assignment-resolution": "workspace:*",
        },
      }),
      "packages/role-assignment-resolution/package.json": JSON.stringify({
        name: "@iam/role-assignment-resolution",
      }),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("rejects API route dependencies on app-local repositories", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/public/user.handlers.ts":
        "import type { UserRepository } from \"../../services/user/user.repository\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/public/user.handlers.ts",
        line: 1,
        message: "Route modules must not import app-local repository "
          + "\"../../services/user/user.repository\"; depend on an injected use case or service facade.",
      },
    ]);
  });

  test("rejects Admin API route dependencies on app-local repositories", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin-api/src/routes/admin/user/user.adapter.ts":
        "import { createUserRepository } from \"@admin-api/services/user/user.repository\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/routes/admin/user/user.adapter.ts",
        line: 1,
        message: "Route modules must not import app-local repository "
          + "\"@admin-api/services/user/user.repository\"; depend on an injected use case or service facade.",
      },
    ]);
  });

  test("rejects type and value route repository aliases with explicit TypeScript extensions", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/public/user.handlers.ts":
        "import type { UserRepository } from \"@api/services/user/user.repository.ts\";",
      "apps/admin-api/src/routes/admin/user/user.adapter.ts":
        "import { createUserRepository } from \"@admin-api/services/user/user.repository.ts\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/routes/admin/user/user.adapter.ts",
        line: 1,
        message: "Route modules must not import app-local repository "
          + "\"@admin-api/services/user/user.repository.ts\"; depend on an injected use case or service facade.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/public/user.handlers.ts",
        line: 1,
        message: "Route modules must not import app-local repository "
          + "\"@api/services/user/user.repository.ts\"; depend on an injected use case or service facade.",
      },
    ]);
  });

  test("rejects route dependencies on UnitOfWork even when imported as a type", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/auth/auth.handlers.ts":
        "import type { UnitOfWork } from \"@iam/api-core/uow\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/auth/auth.handlers.ts",
        line: 1,
        message: "Route modules must not import UnitOfWork from \"@iam/api-core/uow\"; "
          + "delegate transaction workflows to an injected use case or service facade.",
      },
    ]);
  });

  test("rejects API and Admin API services that reverse-depend on application use cases", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        "import { resetPassword } from \"@api/use-cases/account-recovery/reset-password\";",
      "apps/admin-api/src/services/employment/employment.service.ts":
        "import type { ResignUserUseCase } from \"../../use-cases/employment/resign-user/resign-user.use-case\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/services/employment/employment.service.ts",
        line: 1,
        message: "Service modules must not import application use case "
          + "\"../../use-cases/employment/resign-user/resign-user.use-case\"; "
          + "use cases may depend on services, not the reverse.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
        message: "Service modules must not import application use case "
          + "\"@api/use-cases/account-recovery/reset-password\"; "
          + "use cases may depend on services, not the reverse.",
      },
    ]);
  });

  test("rejects API and Admin API services that import application use-case barrels", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        "import type { UseCases } from \"@api/use-cases\";",
      "apps/admin-api/src/services/employment/employment.service.ts":
        "import { createAdminApiUseCases } from \"@admin-api/use-cases\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/services/employment/employment.service.ts",
        line: 1,
        message: "Service modules must not import application use case "
          + "\"@admin-api/use-cases\"; use cases may depend on services, not the reverse.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
        message: "Service modules must not import application use case "
          + "\"@api/use-cases\"; use cases may depend on services, not the reverse.",
      },
    ]);
  });

  test("rejects ordinary production modules that value-import the database singleton", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/use-cases/authentication/login/login.use-case.ts":
        "import db from \"@iam/db\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/use-cases/authentication/login/login.use-case.ts",
        line: 1,
        message: "Production modules must not value-import database singleton \"@iam/db\"; "
          + "only composition and repository implementations own database wiring.",
      },
    ]);
  });

  test("allows database ownership in composition and repository implementations plus type-only protocols", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/composition/index.ts": "import db from \"@iam/db\";",
      "apps/admin-api/src/services/user/user.repository.ts": "import db from \"@iam/db\";",
      "apps/api/src/use-cases/authentication/login/login.port.ts":
        "import type { DbClient } from \"@iam/db\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("rejects ordinary modules that value-import app singletons or concrete providers", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/public/public.handlers.ts":
        "import { createUserService } from \"@api/services/user/user.service\";",
      "apps/api/src/use-cases/authentication/login/login.use-case.ts":
        "import redis from \"@api/lib/infra/redis\";",
      "apps/admin-api/src/services/user/user.service.ts":
        "import { logger } from \"@admin-api/lib/logger\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 1,
        message: "Production modules must not value-import app logger singleton "
          + "\"@admin-api/lib/logger\"; only composition, app assembly, and infrastructure owners may wire it.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/public/public.handlers.ts",
        line: 1,
        message: "Production modules must not value-import concrete provider "
          + "\"@api/services/user/user.service\"; "
          + "only composition owners may wire concrete providers.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/use-cases/authentication/login/login.use-case.ts",
        line: 1,
        message: "Production modules must not value-import app Redis singleton "
          + "\"@api/lib/infra/redis\"; only composition and Redis infrastructure owners may wire it.",
      },
    ]);
  });

  test("allows singleton and provider wiring in declared owners plus type-only imports elsewhere", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/composition/runtime/create-runtime.ts":
        "import redis from \"@api/lib/infra/redis\";",
      "apps/admin-api/src/composition/index.ts":
        "import { logger } from \"@admin-api/lib/logger\";",
      "apps/api/src/composition/services/index.ts":
        "import { createUserService } from \"@api/services/user/user.service\";",
      "apps/api/src/app.ts":
        "import { logger } from \"@api/lib/logger\";",
      "apps/admin-api/src/lib/infra/cache.ts":
        "import redis from \"@admin-api/lib/infra/redis\";",
      "apps/api/src/lib/logger/request.ts":
        "import { logger } from \"@api/lib/logger\";",
      "apps/api/src/routes/public/public.handlers.ts": [
        "import type { UserService } from \"@api/services/user/user.service.ts\";",
        "import type { IncomingMessage } from \"node:http\";",
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("rejects concrete provider wiring from app assembly and infrastructure modules", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/app.ts":
        "import { createUserService } from \"@api/services/user/user.service\";",
      "apps/admin-api/src/lib/infra/user-store.ts":
        "import { createUserRepository } from \"@admin-api/services/user/user.repository\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/lib/infra/user-store.ts",
        line: 1,
        message: "Production modules must not value-import concrete provider "
          + "\"@admin-api/services/user/user.repository\"; "
          + "only composition owners may wire concrete providers.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/app.ts",
        line: 1,
        message: "Production modules must not value-import concrete provider "
          + "\"@api/services/user/user.service\"; "
          + "only composition owners may wire concrete providers.",
      },
    ]);
  });

  test("allows app-local audit context helper modules outside wiring owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/public/public.handlers.ts":
        "import { getApiAuditRequestContext, getApiUserAuditActor } "
        + "from \"../../services/audit/audit.context\";",
      "apps/admin-api/src/services/user/user.service.ts":
        "import { adminAuditTransactionOptions } from \"@admin-api/services/audit/audit.context\";",
      "apps/admin-api/src/routes/admin/role/audit.ts":
        "export { resolveAdminAuditContext } from \"@admin-api/services/audit/audit.context\";",
      "apps/api/src/composition/index.ts":
        "import { createApiAuditLogWriter } from \"@api/services/audit/audit.service\";",
      "apps/admin-api/src/composition/index.ts":
        "export { createAdminAuditService } from \"@admin-api/services/audit/audit.service\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("rejects audit service value bindings outside composition owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/use-cases/account-recovery/reset-password/reset-password.use-case.ts":
        "import { withApiRequestContext } from \"@api/services/audit/audit.service\";",
      "apps/admin-api/src/routes/admin/audit/audit.ts":
        "export { createAdminAuditService } from \"@admin-api/services/audit/audit.service\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/routes/admin/audit/audit.ts",
        line: 1,
        message: "Production modules must not value-re-export concrete provider "
          + "\"@admin-api/services/audit/audit.service\"; "
          + "only composition owners may wire concrete providers.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/use-cases/account-recovery/reset-password/reset-password.use-case.ts",
        line: 1,
        message: "Production modules must not value-import concrete provider "
          + "\"@api/services/audit/audit.service\"; "
          + "only composition owners may wire concrete providers.",
      },
    ]);
  });

  test("rejects relative imports of app Redis and logger singletons from ordinary modules", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        "import { logger } from \"../../lib/logger\";",
      "apps/admin-api/src/use-cases/session/revoke/revoke.use-case.ts":
        "import redis from \"../../../lib/infra/redis\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/use-cases/session/revoke/revoke.use-case.ts",
        line: 1,
        message: "Production modules must not value-import app Redis singleton "
          + "\"../../../lib/infra/redis\"; only composition and Redis infrastructure owners may wire it.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
        message: "Production modules must not value-import app logger singleton "
          + "\"../../lib/logger\"; only composition, app assembly, and infrastructure owners may wire it.",
      },
    ]);
  });

  test("rejects extended and index-shaped aliases for app singletons and concrete providers", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin-api/src/services/user/user.service.ts":
        "import { logger } from \"@admin-api/lib/logger.ts\";",
      "apps/admin-api/src/use-cases/employment/resign-user/resign-user.use-case.ts":
        "import { createUserService } from \"@admin-api/services/user/user.service.ts\";",
      "apps/api/src/services/client/client.service.ts":
        "import { logger } from \"@api/lib/logger/index.ts\";",
      "apps/api/src/use-cases/authentication/login/login.use-case.ts":
        "import redis from \"@api/lib/infra/redis.ts\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 1,
        message: "Production modules must not value-import app logger singleton "
          + "\"@admin-api/lib/logger.ts\"; "
          + "only composition, app assembly, and infrastructure owners may wire it.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/use-cases/employment/resign-user/resign-user.use-case.ts",
        line: 1,
        message: "Production modules must not value-import concrete provider "
          + "\"@admin-api/services/user/user.service.ts\"; "
          + "only composition owners may wire concrete providers.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/services/client/client.service.ts",
        line: 1,
        message: "Production modules must not value-import app logger singleton "
          + "\"@api/lib/logger/index.ts\"; "
          + "only composition, app assembly, and infrastructure owners may wire it.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/use-cases/authentication/login/login.use-case.ts",
        line: 1,
        message: "Production modules must not value-import app Redis singleton "
          + "\"@api/lib/infra/redis.ts\"; only composition and Redis infrastructure owners may wire it.",
      },
    ]);
  });

  test("normalizes tsconfig root aliases across dependency-direction rules", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/public/user.index.ts": [
        "import type { UserRepository } from \"~api/src/services/user/user.repository.ts\";",
        "export type { UnitOfWork } from \"@iam/api-core/uow\";",
      ].join("\n"),
      "apps/admin-api/src/routes/admin/user/user.index.ts":
        "export { createUserRepository } from \"~admin-api/src/services/user/user.repository/index.ts\";",
      "apps/api/src/services/user/user.service.ts":
        "import type { UseCases } from \"~api/src/use-cases/index.ts\";",
      "apps/admin-api/src/services/employment/employment.service.ts":
        "export { resignUser } from \"~admin-api/src/use-cases/employment/resign-user/index.ts\";",
      "apps/api/src/use-cases/authentication/login/login.use-case.ts":
        "import redis from \"~api/src/lib/infra/redis.ts\";",
      "apps/admin-api/src/services/user/user.service.ts":
        "import { logger } from \"~admin-api/src/lib/logger/index.ts\";",
      "apps/api/src/use-cases/account-recovery/reset-password/reset-password.use-case.ts":
        "import { createUserService } from \"~api/src/services/user/user.service.ts\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/routes/admin/user/user.index.ts",
        line: 1,
        message: "Route modules must not re-export app-local repository "
          + "\"~admin-api/src/services/user/user.repository/index.ts\"; "
          + "depend on an injected use case or service facade.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/services/employment/employment.service.ts",
        line: 1,
        message: "Service modules must not re-export application use case "
          + "\"~admin-api/src/use-cases/employment/resign-user/index.ts\"; "
          + "use cases may depend on services, not the reverse.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 1,
        message: "Production modules must not value-import app logger singleton "
          + "\"~admin-api/src/lib/logger/index.ts\"; "
          + "only composition, app assembly, and infrastructure owners may wire it.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/public/user.index.ts",
        line: 1,
        message: "Route modules must not import app-local repository "
          + "\"~api/src/services/user/user.repository.ts\"; "
          + "depend on an injected use case or service facade.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/public/user.index.ts",
        line: 2,
        message: "Route modules must not re-export UnitOfWork from \"@iam/api-core/uow\"; "
          + "delegate transaction workflows to an injected use case or service facade.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
        message: "Service modules must not import application use case "
          + "\"~api/src/use-cases/index.ts\"; use cases may depend on services, not the reverse.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/use-cases/account-recovery/reset-password/reset-password.use-case.ts",
        line: 1,
        message: "Production modules must not value-import concrete provider "
          + "\"~api/src/services/user/user.service.ts\"; "
          + "only composition owners may wire concrete providers.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/use-cases/authentication/login/login.use-case.ts",
        line: 1,
        message: "Production modules must not value-import app Redis singleton "
          + "\"~api/src/lib/infra/redis.ts\"; only composition and Redis infrastructure owners may wire it.",
      },
    ]);
  });

  test("allows tsconfig root aliases in declared owners and type-only provider protocols", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/composition/runtime/create-runtime.ts":
        "import redis from \"~api/src/lib/infra/redis.ts\";",
      "apps/admin-api/src/composition/index.ts":
        "export { createUserService } from \"~admin-api/src/services/user/user.service/index.ts\";",
      "apps/api/src/app.ts":
        "import { logger } from \"~api/src/lib/logger/index.ts\";",
      "apps/admin-api/src/lib/infra/cache.ts":
        "import redis from \"~admin-api/src/lib/infra/redis/index.ts\";",
      "apps/api/src/routes/public/public.handlers.ts":
        "import type { UserService } from \"~api/src/services/user/user.service.ts\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([]);
  });

  test("applies dependency direction to static re-exports while allowing type-only provider protocols", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/public/user.index.ts": [
        "export type { UserRepository } from \"@api/services/user/user.repository.ts\";",
        "export type { UnitOfWork } from \"@iam/api-core/uow\";",
      ].join("\n"),
      "apps/admin-api/src/routes/admin/user/user.index.ts":
        "export { createUserRepository } from \"@admin-api/services/user/user.repository\";",
      "apps/admin-api/src/services/employment/employment.service.ts":
        "export type { UseCases } from \"@admin-api/use-cases\";",
      "apps/admin-api/src/use-cases/employment/resign-user/resign-user.use-case.ts":
        "export { createUserService } from \"@admin-api/services/user/user.service\";",
      "apps/api/src/use-cases/authentication/login/login.port.ts":
        "export type { UserService } from \"@api/services/user/user.service.ts\";",
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/routes/admin/user/user.index.ts",
        line: 1,
        message: "Route modules must not re-export app-local repository "
          + "\"@admin-api/services/user/user.repository\"; depend on an injected use case or service facade.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/services/employment/employment.service.ts",
        line: 1,
        message: "Service modules must not re-export application use case "
          + "\"@admin-api/use-cases\"; use cases may depend on services, not the reverse.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/use-cases/employment/resign-user/resign-user.use-case.ts",
        line: 1,
        message: "Production modules must not value-re-export concrete provider "
          + "\"@admin-api/services/user/user.service\"; "
          + "only composition owners may wire concrete providers.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/public/user.index.ts",
        line: 1,
        message: "Route modules must not re-export app-local repository "
          + "\"@api/services/user/user.repository.ts\"; depend on an injected use case or service facade.",
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/public/user.index.ts",
        line: 2,
        message: "Route modules must not re-export UnitOfWork from \"@iam/api-core/uow\"; "
          + "delegate transaction workflows to an injected use case or service facade.",
      },
    ]);
  });

  test("exits nonzero and prints stable diagnostics for repository violations", () => {
    const repoRoot = createFixtureRepository({
      "apps/oidc-provider/src/session/session.port.ts": [
        "interface SessionService { find: () => Promise<unknown> }",
        "type SessionReader = Pick<SessionService, \"find\">;",
      ].join("\n"),
    });

    const result = Bun.spawnSync([process.execPath, architectureGuardCli, repoRoot], {
      cwd: repoRoot,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    });

    expect({
      exitCode: result.exitCode,
      stderr: result.stderr.toString(),
      stdout: result.stdout.toString(),
    }).toEqual({
      exitCode: 1,
      stderr: [
        "Architecture guard failed with 1 violation:",
        "- [consumer-owned-port] apps/oidc-provider/src/session/session.port.ts:2 "
        + "Consumer-owned ports must not derive their interface from provider type \"SessionService\" with Pick; "
        + "declare the required members directly.",
        "",
      ].join("\n"),
      stdout: "",
    });
  });
});

function createFixtureRepository(files: Record<string, string>) {
  const repoRoot = mkdtempSync(join(tmpdir(), "iam-architecture-guard-"));
  fixtureRoots.push(repoRoot);

  for (const [file, content] of Object.entries(files)) {
    const absoluteFile = join(repoRoot, ...file.split("/"));
    mkdirSync(join(absoluteFile, ".."), { recursive: true });
    writeFileSync(absoluteFile, `${content}\n`, "utf8");
  }

  return repoRoot;
}
