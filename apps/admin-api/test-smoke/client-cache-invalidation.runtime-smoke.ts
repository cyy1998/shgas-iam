import type { AdminClientRecord } from "../src/services/client/client.type";
import process from "node:process";
import { ClientStatus, CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { createAdminApiRuntime } from "../src/composition/runtime";
import { createClientService } from "../src/services/client/client.service";
import { createAdminSessionRevocationPort } from "../src/services/session-revocation/session-revocation.port";
import { createImmediateUnitOfWork } from "../src/testing/fakes";

type CacheCommand
  = | {
    clientCode: string;
    clientSecret: string;
    mode: "invalidate";
  }
  | {
    clientCode: string;
    mode: "custom-sso-disable";
  }
  | {
    mode: "update";
    newClientCode: string;
    newClientSecret: string;
    oldClientCode: string;
    oldClientSecret: string;
  };

async function runRuntimeSmoke() {
  const command = parseCommand(process.argv.slice(2));
  const runtime = createAdminApiRuntime();
  try {
    const cache = runtime.integrations.clientCache;
    if (command.mode === "invalidate") {
      await cache.invalidateClient(command);
    }
    else if (command.mode === "update") {
      await cache.invalidateUpdatedClient(
        {
          clientCode: command.oldClientCode,
          clientSecret: command.oldClientSecret,
        },
        {
          clientCode: command.newClientCode,
          clientSecret: command.newClientSecret,
        },
      );
    }
    else if (command.mode === "custom-sso-disable") {
      const service = createCustomSsoMutationService(runtime, command.clientCode);
      await service.disableClientCustomSso(command.clientCode);
    }
  }
  finally {
    runtime.redis.disconnect();
  }
  process.stdout.write("CLIENT_CACHE_INVALIDATION_OK\n");
}

function parseCommand(args: string[]): CacheCommand {
  if (args[0] === "invalidate" && args.length === 3) {
    return {
      mode: "invalidate",
      clientCode: args[1]!,
      clientSecret: args[2]!,
    };
  }
  if (args[0] === "update" && args.length === 5) {
    return {
      mode: "update",
      oldClientCode: args[1]!,
      oldClientSecret: args[2]!,
      newClientCode: args[3]!,
      newClientSecret: args[4]!,
    };
  }
  if (args[0] === "custom-sso-disable" && args.length === 2) {
    return {
      mode: "custom-sso-disable",
      clientCode: args[1]!,
    };
  }
  throw new TypeError("Invalid client cache runtime smoke arguments");
}

function createCustomSsoMutationService(
  runtime: ReturnType<typeof createAdminApiRuntime>,
  clientCode: string,
) {
  let client = customSsoAdminClient(clientCode);
  const tx = {
    auditService: { recordAuditLog: async () => undefined },
    clientRepository: {
      lockClientByCode: async () => client,
      updateClientCustomSsoByCode: async (
        _clientCode: string,
        update: Partial<AdminClientRecord>,
      ) => {
        client = {
          ...client,
          ...update,
          customSsoConfigVersion: client.customSsoConfigVersion + 1,
        };
        return client;
      },
    },
  };
  const emptySummary = async () => ({
    principalSessions: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    credentials: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    artifacts: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    cleanup: { attempted: 0, succeeded: 0, failed: 0, failures: [] },
  });
  const revocation = createAdminSessionRevocationPort({
    sessionKernel: {
      revokeClientProtocol: emptySummary,
      revokeClient: emptySummary,
      prepareUserSessionRevocation: async () => ({ revoke: emptySummary }),
      revokeUserSessions: emptySummary,
    },
    logger: {
      logClientAllProtocolsRevocation: () => undefined,
      logClientProtocolRevocation: () => undefined,
      logUserRevocation: () => undefined,
    },
  });
  return createClientService({
    clientRepository: {
      getClientByCode: async () => client,
      searchClientsPaged: async () => ({ rows: [client], total: 1 }),
    },
    clientCache: runtime.integrations.clientCache,
    clientRuntimeInvalidation: runtime.integrations.clientRuntimeInvalidation,
    clientMutationLogger: runtime.logger,
    sessionRevocation: revocation,
    passwordHasher: runtime.passwordHasher,
    random: runtime.random,
    uow: createImmediateUnitOfWork(tx as never),
  });
}

function customSsoAdminClient(clientCode: string): AdminClientRecord {
  return {
    id: 7,
    clientCode,
    clientName: clientCode,
    clientSecret: `secret-${clientCode}`,
    url: "https://client.example.com",
    status: ClientStatus.Enable,
    description: null,
    isDelete: false,
    createTime: new Date("2026-09-03T00:00:00Z"),
    updateTime: new Date("2026-09-03T00:00:00Z"),
    extAttributes: {},
    oidcEnabled: false,
    oidcConfig: null,
    oidcSecretHash: null,
    oidcConfigVersion: 0,
    customSsoEnabled: true,
    customSsoConfig: {
      mode: CustomSsoClientMode.Gateway,
      orcas: { enabled: false },
      subjectClaims: [SubjectClaim.SubjectIdentifier],
      validRedirectUrls: ["https://gateway.example.com/*"],
    },
    customSsoSecretHash: null,
    customSsoConfigVersion: 3,
  };
}

runRuntimeSmoke().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
