import type { DbClient } from "@iam/db";
import type { SQL } from "drizzle-orm";
import {
  ClientStatus,
  UserStatus,
} from "@iam/contracts";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createOidcAccountRepository } from "../../src/repositories/account.repository.ts";
import {
  isOidcClientAvailable,
} from "../../src/repositories/availability.ts";

const activeClient = {
  status: ClientStatus.Enable,
  isDelete: false,
  oidcEnabled: true,
  oidcConfig: {},
};

describe("oIDC repository availability", () => {
  it("keeps configured clients runtime-valid during maintenance", () => {
    expect(isOidcClientAvailable({
      ...activeClient,
      status: ClientStatus.Maintenance,
    } as never)).toBe(true);
  });

  it.each([
    ["disabled", { ...activeClient, status: ClientStatus.Disable }],
    ["deleted", { ...activeClient, isDelete: true }],
    ["OIDC disabled", { ...activeClient, oidcEnabled: false }],
    ["OIDC unconfigured", { ...activeClient, oidcConfig: null }],
  ])("rejects an unavailable %s client", (_label, client) => {
    expect(isOidcClientAvailable(client as never)).toBe(false);
  });

  it("reads permitted account facts by subject without a later accessibility predicate", async () => {
    const row = {
      id: 42,
      subjectIdentifier: "52de90c1-21a1-453e-84d6-428134e85957",
      username: "permitted-user",
      name: "Permitted User",
      mobile: null,
      status: UserStatus.Disable,
      isDelete: true,
    };
    let predicate: SQL | undefined;
    const db = {
      select: () => ({
        from: () => ({
          where: (value: SQL) => {
            predicate = value;
            return { limit: async () => [row] };
          },
        }),
      }),
    } as unknown as DbClient;
    const account = await createOidcAccountRepository(db).findBySubject(row.subjectIdentifier);
    expect(account).toEqual(row);
    expect(predicate).toBeDefined();
    const query = new PgDialect().sqlToQuery(predicate!);
    expect(query.sql).toBe("\"user\".\"subject_identifier\" = $1");
    expect(query.params).toEqual([row.subjectIdentifier]);
  });
});
