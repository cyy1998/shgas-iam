import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeRepositoryArchitecture } from "../../architecture-guard";

const fixtureRoots: string[] = [];
const architectureGuardCli = join(import.meta.dirname, "..", "..", "check-architecture.ts");

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("repository architecture guard", () => {
  test("protects Gateway HTTP and consumer ports while allowing composition wiring", () => {
    const repoRoot = createFixtureRepository({
      "apps/gateway/src/http/app.ts": 'import type { Reader } from "../repositories/client-credential.repository";',
      "apps/gateway/src/services/gateway/gateway.port.ts":
        'import type { Reader } from "../../repositories/client-credential.repository";',
      "apps/gateway/src/composition/index.ts": 'import { reader } from "../repositories/client-credential.repository";',
    });
    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "consumer-owned-port",
        file: "apps/gateway/src/services/gateway/gateway.port.ts",
        line: 1,
      },
      { ruleId: "dependency-direction", file: "apps/gateway/src/http/app.ts", line: 1 },
    ]);
  });
  test("keeps new OIDC independent of protocol, transport, app and database owners while allowing composition", () => {
    const repoRoot = createFixtureRepository({
      "packages/oidc/src/authorization.ts": [
        'import type { Kernel } from "@iam/session-kernel";',
        'import type { Reader } from "@iam/api-core/client-snapshot";',
        'import { custom } from "@iam/custom-sso";',
        'import { Provider } from "oidc-provider";',
        'import { Hono } from "hono";',
        'import { provider } from "../../../apps/api/src/provider";',
        'import { db } from "@iam/db";',
      ].join("\n"),
      "apps/api/src/composition/oidc.ts": [
        'import { createOidcAuthorization } from "@iam/oidc";',
        'import type { DbClient } from "@iam/db";',
      ].join("\n"),
    });
    expect(violationLocations(repoRoot)).toEqual(
      [3, 4, 5, 6, 7].map((line) => ({
        ruleId: "session-runtime-owner",
        file: "packages/oidc/src/authorization.ts",
        line,
      })),
    );
  });
  test("keeps Session Kernel independent of protocol and runtime owners", () => {
    const repoRoot = createFixtureRepository({
      "packages/session-kernel/src/facade.ts": [
        'import { z } from "zod";',
        'import { randomUUID } from "node:crypto";',
        'import type { CleanupAdapter } from "./cleanup/cleanup";',
        'import { SystemLogEvent } from "@iam/api-core/logger";',
        'import type { CustomSso } from "@iam/custom-sso";',
        'import { provider } from "../../../apps/api/src/provider";',
        'import type { OidcAuthorization } from "@iam/oidc";',
      ].join("\n"),
    });
    expect(violationLocations(repoRoot)).toEqual(
      [4, 5, 6, 7].map((line) => ({
        ruleId: "session-runtime-owner",
        file: "packages/session-kernel/src/facade.ts",
        line,
      })),
    );
  });

  test("keeps Projection independent of the Session Kernel runtime", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/internal/projection.ts":
        'import type { SessionKernel } from "@iam/session-kernel";',
      "packages/custom-sso/src/wire.ts": 'import type { Projection } from "@iam/client-subject-projection";',
    });
    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/internal/projection.ts",
        line: 1,
      },
    ]);
  });

  test("keeps Custom SSO application independent of app providers and HTTP", () => {
    const repoRoot = createFixtureRepository({
      "packages/custom-sso/src/internal/application.ts": [
        'import type { UserService } from "@api/services/user/user.service";',
        'import type { Context } from "hono";',
        'import type { CustomSsoDeps } from "../custom-sso.port";',
        'import type { SessionKernel } from "@iam/session-kernel";',
        'import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";',
      ].join("\n"),
      "apps/api/src/composition/services/index.ts": 'import { createCustomSso } from "@iam/custom-sso";',
    });
    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "session-runtime-owner",
        file: "packages/custom-sso/src/internal/application.ts",
        line: 1,
      },
      {
        ruleId: "session-runtime-owner",
        file: "packages/custom-sso/src/internal/application.ts",
        line: 2,
      },
    ]);
  });
  test("reports locatable violations when a production port imports a concrete repository", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.port.ts": [
        "// Consumer contract.",
        'import type { UserRepository } from "./user.repository";',
      ].join("\n"),
    });

    expect(analyzeRepositoryArchitecture(repoRoot)).toEqual([
      {
        ruleId: "consumer-owned-port",
        file: "apps/api/src/services/user/user.port.ts",
        line: 2,
        message:
          'Consumer-owned ports must not import concrete repository module "./user.repository"; ' +
          "declare the required protocol locally.",
      },
    ]);
  });

  test("reports provider ownership inherited through repository directories and Pick", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin-api/src/use-cases/find-user/find-user.port.ts": [
        'import type { UserRepository } from "../../repositories/user";',
        "interface UserService { findUser: () => Promise<unknown> }",
        'type UserReader = Pick<UserRepository, "findUser">;',
        'type UserLookup = Pick<UserService, "findUser">;',
      ].join("\n"),
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "consumer-owned-port",
        file: "apps/admin-api/src/use-cases/find-user/find-user.port.ts",
        line: 1,
      },
      {
        ruleId: "consumer-owned-port",
        file: "apps/admin-api/src/use-cases/find-user/find-user.port.ts",
        line: 3,
      },
      {
        ruleId: "consumer-owned-port",
        file: "apps/admin-api/src/use-cases/find-user/find-user.port.ts",
        line: 4,
      },
    ]);
  });

  test("allows consumer and platform narrowing while excluding non-production sources", () => {
    const allowedPort = [
      'import type { IncomingMessage } from "node:http";',
      'import type { UserProfile } from "@iam/domain/user";',
      "interface UserProfilePort { find: (id: string) => Promise<UserProfile> }",
      'type HeaderRequest = Pick<IncomingMessage, "headers">;',
      'type UserProfileReader = Pick<UserProfilePort, "find">;',
    ].join("\n");
    const forbiddenPort = 'import type { UserRepository } from "./user.repository";';
    const repoRoot = createFixtureRepository({
      "apps/worker/src/modules/user-profile/user-profile.port.ts": allowedPort,
      "apps/worker/src/modules/__tests__/test.port.ts": forbiddenPort,
      "apps/worker/src/modules/testing/helper.port.ts": forbiddenPort,
      "apps/worker/src/modules/generated/client.port.ts": forbiddenPort,
      "apps/worker/src/dist/output.port.ts": forbiddenPort,
    });

    expect(violationLocations(repoRoot)).toEqual([]);
  });

  test("rejects dedicated Role Assignment schema dependencies outside its owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/employment/employment.repository.ts":
        'import { roleAssignments } from "@iam/db/schema/role-assignments";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "role-resolution-owner",
        file: "apps/api/src/services/employment/employment.repository.ts",
        line: 1,
      },
    ]);
  });

  test("allows dedicated schema owners and leaves broad shared surfaces unrestricted", () => {
    const repoRoot = createFixtureRepository({
      "packages/role-assignment-resolution/src/internal/resolver.ts":
        'import { roleAssignments } from "@iam/db/schema/role-assignments";',
      "apps/admin-api/src/services/role/role.repository.ts": 'export * from "@iam/db/schema/role-assignments";',
      "apps/api/src/services/user/user.repository.ts": ['import "@iam/db/schema";', 'import "@iam/contracts";'].join(
        "\n",
      ),
    });

    expect(violationLocations(repoRoot)).toEqual([]);
  });

  test("rejects Role Assignment Resolver value dependencies outside composition and module owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts": 'import "@iam/role-assignment-resolution";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "role-resolution-owner",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
      },
    ]);
  });

  test("allows resolver type contracts and value dependencies in declared owners", () => {
    const valueImport = 'import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";';
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.port.ts":
        'import type { RoleAssignmentResolver } from "@iam/role-assignment-resolution";',
      "apps/admin-api/src/composition/index.ts": valueImport,
      "packages/user-profile-read-model/src/invalidation/user-profile-invalidation.ts": valueImport,
      "packages/user-profile-read-model/src/worker/user-profile-worker.module.ts": valueImport,
    });

    expect(violationLocations(repoRoot)).toEqual([]);
  });

  test("rejects User Profile producer and worker dependencies outside their corresponding owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        'export type { UserProfileInvalidation } from "@iam/user-profile-read-model/producer";',
      "apps/admin-api/src/services/user/user.service.ts":
        'import { createUserProfileWorkerModule } from "@iam/user-profile-read-model/worker";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "user-profile-owner",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 1,
      },
      {
        ruleId: "user-profile-owner",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
      },
    ]);
  });

  test("rejects User Profile query repository dependencies outside API composition", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        'import type { UserProfileRepository } from "@iam/user-profile-read-model/query/repository";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "user-profile-owner",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
      },
    ]);
  });

  test("rejects complementary User Profile owner dependency kinds", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        'import { createUserProfileJobProducer } from "@iam/user-profile-read-model/producer";',
      "apps/admin-api/src/services/user/user.type.ts":
        'import type { UserProfileJobProcessor } from "@iam/user-profile-read-model/worker";',
      "apps/admin-api/src/services/user/user.service.ts":
        'import { createUserProfileRepository } from "@iam/user-profile-read-model/query/repository";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "user-profile-owner",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 1,
      },
      {
        ruleId: "user-profile-owner",
        file: "apps/admin-api/src/services/user/user.type.ts",
        line: 1,
      },
      {
        ruleId: "user-profile-owner",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
      },
    ]);
  });

  test("allows User Profile owners plus root and query consumers", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/composition/index.ts": 'import "@iam/user-profile-read-model/producer";',
      "apps/api/src/composition/repositories/index.ts":
        'import { createUserProfileRepository } from "@iam/user-profile-read-model/query/repository";',
      "apps/admin-api/src/composition/index.ts":
        'import type { UserProfileInvalidation } from "@iam/user-profile-read-model/producer";',
      "apps/worker/src/composition/index.ts":
        'import { createUserProfileWorkerModule } from "@iam/user-profile-read-model/worker";',
      "apps/api/src/services/user/user.service.ts":
        'import type { UserProfileQueryService } from "@iam/user-profile-read-model";',
      "apps/admin-api/src/services/user/user.type.ts":
        'export type { UserProfileQueryService } from "@iam/user-profile-read-model/query";',
      "apps/api/src/composition/repositories/profile.ts": 'import "@iam/user-profile-read-model";',
    });

    expect(violationLocations(repoRoot)).toEqual([]);
  });

  test("allows Projection implementation ports and Custom SSO public interface consumption", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/internal/projection.ts":
        'import type { SubjectFactsPort } from "../index.ts";',
      "packages/custom-sso/src/wire.ts": [
        'import type { ClientSubjectProjection } from "@iam/client-subject-projection";',
        'export type { ClientSubjectProjectionService } from "@iam/client-subject-projection";',
      ].join("\n"),
    });

    expect(violationLocations(repoRoot)).toEqual([]);
  });

  test("keeps every Projection core source independent of client protocol configuration", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/internal/catalog.ts": [
        'import type { ClientDto } from "@iam/domain/client";',
        'import type { RelativeClientDto } from "../../../domain/src/client/index.ts";',
      ].join("\n"),
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/internal/catalog.ts",
        line: 1,
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/internal/catalog.ts",
        line: 2,
      },
    ]);
  });

  test("rejects Hono package subpaths from both Projection core and wire sources", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/internal/catalog.ts": 'import type { CookieOptions } from "hono/cookie";',
      "packages/custom-sso/src/wire.ts": 'import type { Context } from "hono/types";',
    });

    expect(violationLocations(repoRoot)).toEqual(
      [
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/custom-sso/src/wire.ts",
          line: 1,
        },
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/client-subject-projection/src/internal/catalog.ts",
          line: 1,
        },
      ].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    );
  });

  test("matches blocked external package roots only at exact or slash-subpath boundaries", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/internal/catalog.ts": [
        'import type { Redis } from "ioredis/built/Redis";',
        'import type { RedisClient } from "redis/client";',
        'import type { ProviderHelper } from "oidc-provider/lib/helpers";',
        'import type { Honorable } from "honorable";',
      ].join("\n"),
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/internal/catalog.ts",
        line: 1,
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/internal/catalog.ts",
        line: 2,
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/internal/catalog.ts",
        line: 3,
      },
    ]);
  });

  test("maps every app and Gateway workspace package to its production owner", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/internal/catalog.ts": [
        'import "@iam/admin/routes/client";',
        'import "@iam/admin-api/routes/client";',
        'import "@iam/api";',
        'import "@iam/api/session";',
        'import "@iam/sso/pages/login";',
        'import "@iam/worker/queues";',
      ].join("\n"),
      "packages/custom-sso/src/wire.ts": 'import "@iam/gateway-apisix/planner";',
    });

    expect(violationLocations(repoRoot)).toEqual(
      [
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/custom-sso/src/wire.ts",
          line: 1,
        },
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/client-subject-projection/src/internal/catalog.ts",
          line: 1,
        },
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/client-subject-projection/src/internal/catalog.ts",
          line: 2,
        },
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/client-subject-projection/src/internal/catalog.ts",
          line: 3,
        },
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/client-subject-projection/src/internal/catalog.ts",
          line: 4,
        },
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/client-subject-projection/src/internal/catalog.ts",
          line: 5,
        },
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/client-subject-projection/src/internal/catalog.ts",
          line: 6,
        },
      ].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    );
  });

  test("keeps the Custom SSO wire mapper independent of facts and runtime owners", () => {
    const repoRoot = createFixtureRepository({
      "packages/custom-sso/src/wire.ts": [
        'import type { SubjectFactsReader } from "@iam/user-profile-read-model/query";',
        'import type { Context } from "hono";',
      ].join("\n"),
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/custom-sso/src/wire.ts",
        line: 1,
      },
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/custom-sso/src/wire.ts",
        line: 2,
      },
    ]);
  });

  test("keeps the wire entry independent of protocol runtime and Kernel", () => {
    for (const module of ["@iam/custom-sso", "./internal/application", "@iam/session-kernel", "ioredis"]) {
      const repoRoot = createFixtureRepository({
        "packages/custom-sso/src/wire.ts": `import "${module}";`,
      });

      expect(violationLocations(repoRoot)).toEqual([
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/custom-sso/src/wire.ts",
          line: 1,
        },
      ]);
    }
  });

  test("keeps the Custom SSO wire mapper on the root public Projection interface", () => {
    const repoRoot = createFixtureRepository({
      "packages/custom-sso/src/wire.ts":
        'import { SUBJECT_CLAIM_CATALOG } from "@iam/client-subject-projection/internal/catalog";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "client-subject-projection-owner",
        file: "packages/custom-sso/src/wire.ts",
        line: 1,
      },
    ]);
  });

  test("keeps Projection implementation protocol-neutral and its wire adapter behind the public interface", () => {
    const repoRoot = createFixtureRepository({
      "packages/client-subject-projection/src/internal/projection.ts": [
        'import type { Context } from "hono";',
        'import type { UserProfileQuery } from "@iam/user-profile-read-model/query";',
        'import type { CustomSsoSubjectProjection } from "../../../custom-sso/src/wire.ts";',
      ].join("\n"),
      "packages/custom-sso/src/wire.ts":
        'import { createClientSubjectProjectionService } from "../../client-subject-projection/src/internal/projection.ts";',
    });

    expect(violationLocations(repoRoot)).toEqual(
      [
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/custom-sso/src/wire.ts",
          line: 1,
        },
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/client-subject-projection/src/internal/projection.ts",
          line: 1,
        },
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/client-subject-projection/src/internal/projection.ts",
          line: 2,
        },
        {
          ruleId: "client-subject-projection-owner",
          file: "packages/client-subject-projection/src/internal/projection.ts",
          line: 3,
        },
      ].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    );
  });

  test("keeps Custom SSO routes and use cases behind session runtime interfaces", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/sso/sso.handlers.ts": [
        'import type { SessionKernel } from "@iam/session-kernel.ts";',
        'import type { RedisPort } from "@api/lib/infra/redis";',
      ].join("\n"),
      "apps/api/src/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case.ts": [
        'import type { SessionService } from "@iam/session-kernel";',
        "import type { CustomSsoSessionKernelAdapter } " + 'from "@iam/custom-sso/internal/session.ts";',
        'import type { SmsClient } from "@api/lib/integrations/sms";',
      ].join("\n"),
      "apps/api/src/composition/services/index.ts": [
        'import { createSessionKernel } from "@iam/session-kernel";',
        "import { createCustomSsoSessionKernelAdapter } " + 'from "@iam/custom-sso/internal/session";',
        'import redis from "@api/lib/infra/redis";',
        'import { createSmsClient } from "@api/lib/integrations/sms";',
      ].join("\n"),
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "session-runtime-owner",
        file: "apps/api/src/routes/sso/sso.handlers.ts",
        line: 1,
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/api/src/routes/sso/sso.handlers.ts",
        line: 2,
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/api/src/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case.ts",
        line: 1,
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/api/src/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case.ts",
        line: 2,
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/api/src/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case.ts",
        line: 3,
      },
    ]);
  });

  test("keeps Admin user and client services behind the Session Revocation port", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin-api/src/services/client/client.service.ts":
        'import type { Redis } from "@admin-api/lib/infra/redis";',
      "apps/admin-api/src/services/user/user.service.ts": 'import type { SessionKernel } from "@iam/session-kernel";',
      "apps/admin-api/src/composition/session/index.ts": [
        'import { createSessionKernel } from "@iam/session-kernel";',
        'import redis from "@admin-api/lib/infra/redis";',
      ].join("\n"),
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "session-runtime-owner",
        file: "apps/admin-api/src/services/client/client.service.ts",
        line: 1,
      },
      {
        ruleId: "session-runtime-owner",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 1,
      },
    ]);
  });

  test("keeps Worker production sources off API-private aliases", () => {
    const repoRoot = createFixtureRepository({
      "apps/worker/src/modules/profile.ts": [
        'import type { ApiComposition } from "@api";',
        'import type { ApiUserService } from "@api/services/user/user.service.ts";',
      ].join("\n"),
      "apps/worker/src/composition/runtime.ts": [
        'import type { ApiRuntime } from "~api/src";',
        'import { createApiRuntime } from "~api/src/composition/runtime/index.ts";',
      ].join("\n"),
      "apps/worker/src/http/server.ts": [
        'import { createApp } from "@iam/api-core";',
        'import type { UserProfileQueryService } from "@iam/user-profile-read-model";',
      ].join("\n"),
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "worker-ownership",
        file: "apps/worker/src/composition/runtime.ts",
        line: 1,
      },
      {
        ruleId: "worker-ownership",
        file: "apps/worker/src/composition/runtime.ts",
        line: 2,
      },
      {
        ruleId: "worker-ownership",
        file: "apps/worker/src/modules/profile.ts",
        line: 1,
      },
      {
        ruleId: "worker-ownership",
        file: "apps/worker/src/modules/profile.ts",
        line: 2,
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
        message:
          "Docker image @iam/api consumes @iam/role-assignment-resolution but does not COPY " +
          '"packages/role-assignment-resolution/" from the workspace.',
      },
      {
        ruleId: "docker-build-closure",
        file: "apps/api/Dockerfile",
        line: 1,
        message:
          "Docker image @iam/api consumes @iam/user-profile-read-model but does not COPY " +
          '"packages/user-profile-read-model/package.json" from the workspace.',
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

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/worker/Dockerfile",
        line: 1,
      },
      {
        ruleId: "docker-build-closure",
        file: "apps/worker/Dockerfile",
        line: 1,
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

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/api/Dockerfile",
        line: 1,
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

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/admin/Dockerfile",
        line: 1,
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

    expect(violationLocations(repoRoot)).toEqual([]);
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

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/worker/Dockerfile",
        line: 1,
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

    expect(violationLocations(repoRoot)).toEqual([]);
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

    expect(violationLocations(repoRoot)).toEqual([]);
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

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "docker-build-closure",
        file: "apps/admin/Dockerfile",
        line: 1,
      },
      {
        ruleId: "docker-build-closure",
        file: "apps/admin/Dockerfile",
        line: 1,
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

    expect(violationLocations(repoRoot)).toEqual([]);
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

    expect(violationLocations(repoRoot)).toEqual([]);
  });

  test("rejects API route dependencies on app-local repositories", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/public/user.handlers.ts":
        'import type { UserRepository } from "../../services/user/user.repository";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/public/user.handlers.ts",
        line: 1,
      },
    ]);
  });

  test("rejects Admin API route dependencies on app-local repositories", () => {
    const repoRoot = createFixtureRepository({
      "apps/admin-api/src/routes/admin/user/user.adapter.ts":
        'import { createUserRepository } from "@admin-api/services/user/user.repository";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/routes/admin/user/user.adapter.ts",
        line: 1,
      },
    ]);
  });

  test("rejects route dependencies on UnitOfWork even when imported as a type", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/auth/auth.handlers.ts": 'import type { UnitOfWork } from "@iam/api-core/uow";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/auth/auth.handlers.ts",
        line: 1,
      },
    ]);
  });

  test("rejects API and Admin API services that reverse-depend on application use cases", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts":
        'import { resetPassword } from "@api/use-cases/account-recovery/reset-password";',
      "apps/admin-api/src/services/employment/employment.service.ts":
        'import type { ResignUserUseCase } from "../../use-cases/employment/resign-user/resign-user.use-case";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/services/employment/employment.service.ts",
        line: 1,
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
      },
    ]);
  });

  test("rejects API and Admin API services that import application use-case barrels", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/user/user.service.ts": 'import type { UseCases } from "@api/use-cases";',
      "apps/admin-api/src/services/employment/employment.service.ts":
        'import { createAdminApiUseCases } from "@admin-api/use-cases";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/services/employment/employment.service.ts",
        line: 1,
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/services/user/user.service.ts",
        line: 1,
      },
    ]);
  });

  test("rejects ordinary production modules that value-import the database singleton", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/use-cases/authentication/login/login.use-case.ts": 'import db from "@iam/db";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/use-cases/authentication/login/login.use-case.ts",
        line: 1,
      },
    ]);
  });

  test("allows database ownership in composition and repository implementations plus type-only protocols", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/composition/index.ts": 'import db from "@iam/db";',
      "apps/admin-api/src/services/user/user.repository.ts": 'import db from "@iam/db";',
      "apps/api/src/use-cases/authentication/login/login.port.ts": 'import type { DbClient } from "@iam/db";',
    });

    expect(violationLocations(repoRoot)).toEqual([]);
  });

  test("rejects ordinary modules that value-import app singletons or concrete providers", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/public/public.handlers.ts":
        'import { createUserService } from "@api/services/user/user.service";',
      "apps/api/src/use-cases/authentication/login/login.use-case.ts": 'import redis from "@api/lib/infra/redis";',
      "apps/admin-api/src/services/user/user.service.ts": 'import { logger } from "@admin-api/lib/logger";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/services/user/user.service.ts",
        line: 1,
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/routes/public/public.handlers.ts",
        line: 1,
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/use-cases/authentication/login/login.use-case.ts",
        line: 1,
      },
    ]);
  });

  test("allows singleton and provider wiring in declared owners plus type-only imports elsewhere", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/composition/runtime/create-runtime.ts": 'import redis from "@api/lib/infra/redis";',
      "apps/admin-api/src/composition/index.ts": 'import { logger } from "@admin-api/lib/logger";',
      "apps/api/src/composition/services/index.ts":
        'import { createUserService } from "@api/services/user/user.service";',
      "apps/api/src/app.ts": 'import { logger } from "@api/lib/logger";',
      "apps/admin-api/src/lib/infra/cache.ts": 'import redis from "@admin-api/lib/infra/redis";',
      "apps/api/src/lib/logger/request.ts": 'import { logger } from "@api/lib/logger";',
      "apps/api/src/routes/public/public.handlers.ts": [
        'import type { UserService } from "@api/services/user/user.service.ts";',
        'import type { IncomingMessage } from "node:http";',
      ].join("\n"),
    });

    expect(violationLocations(repoRoot)).toEqual([]);
  });

  test("rejects concrete provider wiring from app assembly and infrastructure modules", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/app.ts": 'import { createUserService } from "@api/services/user/user.service";',
      "apps/admin-api/src/lib/infra/user-store.ts":
        'import { createUserRepository } from "@admin-api/services/user/user.repository";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/lib/infra/user-store.ts",
        line: 1,
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/app.ts",
        line: 1,
      },
    ]);
  });

  test("allows app-local audit context helper modules outside wiring owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/routes/public/public.handlers.ts":
        "import { getApiAuditRequestContext, getApiUserAuditActor } " + 'from "../../services/audit/audit.context";',
      "apps/admin-api/src/services/user/user.service.ts":
        'import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";',
      "apps/admin-api/src/routes/admin/role/audit.ts":
        'export { resolveAdminAuditContext } from "@admin-api/services/audit/audit.context";',
      "apps/api/src/composition/index.ts":
        'import { createApiAuditLogWriter } from "@api/services/audit/audit.service";',
      "apps/admin-api/src/composition/index.ts":
        'export { createAdminAuditService } from "@admin-api/services/audit/audit.service";',
    });

    expect(violationLocations(repoRoot)).toEqual([]);
  });

  test("rejects audit service value bindings outside composition owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/use-cases/account-recovery/reset-password/reset-password.use-case.ts":
        'import { withApiRequestContext } from "@api/services/audit/audit.service";',
      "apps/admin-api/src/routes/admin/audit/audit.ts":
        'export { createAdminAuditService } from "@admin-api/services/audit/audit.service";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      {
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/routes/admin/audit/audit.ts",
        line: 1,
      },
      {
        ruleId: "dependency-direction",
        file: "apps/api/src/use-cases/account-recovery/reset-password/reset-password.use-case.ts",
        line: 1,
      },
    ]);
  });

  test("classifies type-only, mixed, side-effect, and re-export dependencies through the shared observation model", () => {
    const file = "apps/api/src/use-cases/example/example.use-case.ts";
    const repoRoot = createFixtureRepository({
      [file]: [
        'import type { DbClient } from "@iam/db";',
        'import { type DbClient } from "@iam/db";',
        'export type { DbClient } from "@iam/db";',
        'export { type DbClient } from "@iam/db";',
        'import "@iam/db";',
        'import { type DbClient, db } from "@iam/db";',
        'export { type DbClient, db } from "@iam/db";',
        'export * from "@iam/db";',
      ].join("\n"),
    });

    expect(violationLocations(repoRoot)).toEqual(
      [5, 6, 7, 8].map((line) => ({ ruleId: "dependency-direction", file, line })),
    );
  });

  test("normalizes supported aliases, relative paths, extensions, and index entries before checking owners", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/use-cases/example/example.use-case.ts": [
        'import redis from "@api/lib/infra/redis.ts";',
        'export { redis } from "~api/src/lib/infra/redis/index.ts";',
        'import { logger } from "../../lib/logger/index.ts";',
        'export { createUserService } from "@api/services/user/user.service/index.ts";',
      ].join("\n"),
      "apps/admin-api/src/use-cases/example/example.use-case.ts": [
        'import { logger } from "@admin-api/lib/logger.ts";',
        'export { createUserService } from "~admin-api/src/services/user/user.service/index.ts";',
      ].join("\n"),
      "packages/client-subject-projection/src/projection.ts": [
        'import type { CustomSso } from "@iam/custom-sso/wire.ts";',
        'export type { CustomSso } from "../../custom-sso/src/wire.ts";',
      ].join("\n"),
      "apps/api/src/composition/runtime/create-runtime.ts": 'import redis from "~api/src/lib/infra/redis.ts";',
      "apps/admin-api/src/composition/index.ts":
        'export { createUserService } from "~admin-api/src/services/user/user.service/index.ts";',
      "apps/api/src/app.ts": 'import { logger } from "~api/src/lib/logger/index.ts";',
      "apps/admin-api/src/lib/infra/cache.ts": 'import redis from "~admin-api/src/lib/infra/redis/index.ts";',
      "apps/api/src/routes/public/public.handlers.ts":
        'import type { UserService } from "~api/src/services/user/user.service.ts";',
    });

    expect(violationLocations(repoRoot)).toEqual([
      ...[1, 2].map((line) => ({
        ruleId: "client-subject-projection-owner",
        file: "packages/client-subject-projection/src/projection.ts",
        line,
      })),
      ...[1, 2].map((line) => ({
        ruleId: "dependency-direction",
        file: "apps/admin-api/src/use-cases/example/example.use-case.ts",
        line,
      })),
      ...[1, 2, 3, 4].map((line) => ({
        ruleId: "dependency-direction",
        file: "apps/api/src/use-cases/example/example.use-case.ts",
        line,
      })),
    ]);
  });

  test("exits nonzero and prints stable diagnostics for repository violations", () => {
    const repoRoot = createFixtureRepository({
      "apps/api/src/services/session/session.port.ts": [
        "interface SessionService { find: () => Promise<unknown> }",
        'type SessionReader = Pick<SessionService, "find">;',
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
        "- [consumer-owned-port] apps/api/src/services/session/session.port.ts:2 " +
          'Consumer-owned ports must not derive their interface from provider type "SessionService" with Pick; ' +
          "declare the required members directly.",
        "",
      ].join("\n"),
      stdout: "",
    });
  });
});

function violationLocations(repoRoot: string) {
  return analyzeRepositoryArchitecture(repoRoot).map(({ ruleId, file, line }) => ({ ruleId, file, line }));
}

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
