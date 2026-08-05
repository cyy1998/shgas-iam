import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { createCustomSsoClientRepository } from "@api/services/client/custom-sso-client.repository";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { describe, expect, test } from "bun:test";

const independentConfig = {
  mode: CustomSsoClientMode.Independent,
  validRedirectUrls: ["https://client.example/callback"],
  subjectClaimCatalogVersion: 1 as const,
  subjectClaims: [SubjectClaim.SubjectIdentifier],
  callbackEndpoint: "https://client.example/callback",
  logoutEndpoint: "https://client.example/logout",
} satisfies NonNullable<CustomSsoClientRuntimeDto["customSsoConfig"]>;

function createSelectDb(row: unknown) {
  let selectedColumns: string[] = [];
  return {
    db: {
      select(selection: Record<string, unknown>) {
        selectedColumns = Object.keys(selection);
        return {
          from() {
            return {
              where() {
                return {
                  limit: async () => row === null ? [] : [row],
                };
              },
            };
          },
        };
      },
    },
    getSelectedColumns: () => selectedColumns,
  };
}

describe("Custom SSO client repository", () => {
  test("reads runtime configuration through a Custom SSO-only projection", async () => {
    const row = {
      id: 7,
      clientCode: "independent-client",
      clientName: "Independent Client",
      status: ClientStatus.Enable,
      isDelete: false,
      customSsoEnabled: true,
      customSsoConfig: independentConfig,
      customSsoConfigVersion: 3,
    };
    const fake = createSelectDb(row);
    const repository = createCustomSsoClientRepository(fake.db as never);

    await expect(repository.findRuntimeRecord("independent-client")).resolves.toEqual(row);
    expect(fake.getSelectedColumns()).toEqual([
      "id",
      "clientCode",
      "clientName",
      "status",
      "isDelete",
      "customSsoEnabled",
      "customSsoConfig",
      "customSsoConfigVersion",
    ]);
  });

  test("reads an enabled Independent secret record through a separate narrow projection", async () => {
    const row = {
      id: 7,
      clientCode: "independent-client",
      status: ClientStatus.Enable,
      isDelete: false,
      customSsoEnabled: true,
      customSsoConfig: independentConfig,
      customSsoSecretHash: "strong-hash",
      customSsoConfigVersion: 3,
    };
    const fake = createSelectDb(row);
    const repository = createCustomSsoClientRepository(fake.db as never);

    await expect(repository.findSecretRecord("independent-client")).resolves.toEqual(row);
    expect(fake.getSelectedColumns()).toEqual([
      "id",
      "clientCode",
      "status",
      "isDelete",
      "customSsoEnabled",
      "customSsoConfig",
      "customSsoSecretHash",
      "customSsoConfigVersion",
    ]);
  });
});
