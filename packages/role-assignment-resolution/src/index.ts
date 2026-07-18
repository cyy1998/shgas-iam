import type { DbClient } from "@iam/db";
import { createResolver } from "./internal/resolver.ts";

export interface EffectiveRole {
  readonly id: number;
  readonly roleCode: string;
}

export interface ResolveEffectiveRolesInput {
  readonly employmentIds: readonly number[];
  readonly clientId?: number;
}

export interface ResolveAffectedUserIdsInput {
  readonly roleIds: readonly number[];
}

export interface RoleAssignmentResolver {
  readonly resolveEffectiveRoles: (
    input: ResolveEffectiveRolesInput,
  ) => Promise<ReadonlyMap<number, readonly EffectiveRole[]>>;
  readonly resolveAffectedUserIds: (input: ResolveAffectedUserIdsInput) => Promise<readonly number[]>;
}

export function createRoleAssignmentResolver(db: DbClient): RoleAssignmentResolver {
  return createResolver(db);
}
