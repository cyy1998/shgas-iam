import { expect, test } from "bun:test";
import {
  DelegationCreateSchema,
  DelegationResolveSchema,
  DelegationSearchSchema,
  DelegationUpdateSchema,
} from "../wire";

test("Client Delegation inputs reject changing bindings and unknown authority fields", () => {
  const create = {
    delegateeUsername: "bob",
    clientId: 1,
    orgCode: "ROOT",
    startTime: "2026-01-01",
    endTime: "2027-01-01",
  };
  expect(DelegationCreateSchema.parse(create)).toMatchObject({ startTime: new Date("2026-01-01"), clientId: 1 });
  expect(DelegationCreateSchema.safeParse({ ...create, privilegeCodes: ["read"] }).success).toBe(false);
  expect(DelegationUpdateSchema.safeParse({ delegatorUsername: "mallory" }).success).toBe(false);
  expect(DelegationUpdateSchema.safeParse({ organizationScopeId: 2 }).success).toBe(false);
  expect(DelegationSearchSchema.safeParse({ privCodes: ["read"] }).success).toBe(false);
  expect(DelegationResolveSchema.safeParse({ usernames: ["alice", "alice"], orgCode: "ROOT" }).success).toBe(false);
  expect(DelegationResolveSchema.safeParse({ usernames: ["alice"], orgCode: "ROOT", clientId: 2 }).success).toBe(false);
});
