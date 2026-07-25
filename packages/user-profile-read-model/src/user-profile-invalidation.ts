import type {
  RebuildUserProfileJobPayload,
  RoleAssignmentTargetType,
  UserProfileDirtyReason,
} from "@iam/contracts";
import type { DbClient } from "@iam/db";
import {
  RoleAssignmentTargetType as RoleAssignmentTargetTypeValue,
  UserProfileDirtyReason as UserProfileDirtyReasonValue,
} from "@iam/contracts";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { createUserProfileAffectedUserRepository } from "./affected-user.repository";
import { createUserProfileDirtyWorkflow } from "./dirty-workflow";
import { createUserProfileDirtyRepository } from "./dirty.repository";

export type UserProfileSourceChange
  = | {
    readonly kind: "user";
    readonly userId: number;
  }
  | {
    readonly kind: "employment";
    readonly userId: number;
  }
  | {
    readonly kind: "organization";
    readonly organizationId: number;
  }
  | {
    readonly kind: "position";
    readonly positionId: number;
  }
  | {
    readonly kind: "role";
    readonly roleId: number;
  }
  | {
    readonly kind: "role-assignment";
    readonly targetType: RoleAssignmentTargetType;
    readonly targetId: number;
  };

const CANONICAL_DIRTY_REASON_ORDER: readonly UserProfileDirtyReason[] = [
  UserProfileDirtyReasonValue.UserUpdated,
  UserProfileDirtyReasonValue.EmploymentUpdated,
  UserProfileDirtyReasonValue.OrganizationUpdated,
  UserProfileDirtyReasonValue.PositionUpdated,
  UserProfileDirtyReasonValue.RoleUpdated,
  UserProfileDirtyReasonValue.PrivilegeUpdated,
  UserProfileDirtyReasonValue.ManualRebuild,
  UserProfileDirtyReasonValue.Backfill,
];

export interface CreateUserProfileInvalidationDeps {
  db: DbClient;
  jobProducer: {
    enqueueRebuildJobs: (
      inputs: RebuildUserProfileJobPayload[],
    ) => Promise<{ enqueued: number; jobIds: string[] }>;
  };
  lifecycle: {
    afterCommit: {
      bestEffort: (name: string, callback: () => Promise<void> | void) => void;
    };
    observability: {
      requestId?: string | null;
      traceId?: string | null;
    } | null;
  };
  clock: {
    nowDate: () => Date;
  };
}

export function createUserProfileInvalidation(deps: CreateUserProfileInvalidationDeps) {
  const roleAssignmentResolver = createRoleAssignmentResolver(deps.db);
  const affectedUserRepository = createUserProfileAffectedUserRepository(deps.db, roleAssignmentResolver);
  const delivery = createAfterCommitDelivery(deps);
  const dirtyWorkflow = createUserProfileDirtyWorkflow({
    dirtyRepository: createUserProfileDirtyRepository(deps.db),
    delivery,
    clock: deps.clock,
  });

  return {
    async recordChanges(changes: readonly UserProfileSourceChange[]): Promise<void> {
      const reasonsByUserId = new Map<number, Set<UserProfileDirtyReason>>();
      const organizationIds = new Set<number>();
      const positionIds = new Set<number>();
      const roleIds = new Set<number>();
      const roleAssignmentOrganizationIds = new Set<number>();
      const roleAssignmentPositionIds = new Set<number>();
      const roleAssignmentEmploymentIds = new Set<number>();
      for (const change of changes) {
        switch (change.kind) {
          case "user":
          case "employment":
            if (isValidId(change.userId))
              addReason(reasonsByUserId, change.userId, reasonForChangeKind(change.kind));
            break;
          case "organization":
            if (isValidId(change.organizationId))
              organizationIds.add(change.organizationId);
            break;
          case "position":
            if (isValidId(change.positionId))
              positionIds.add(change.positionId);
            break;
          case "role":
            if (isValidId(change.roleId))
              roleIds.add(change.roleId);
            break;
          case "role-assignment":
            if (isValidId(change.targetId)) {
              switch (change.targetType) {
                case RoleAssignmentTargetTypeValue.Organization:
                  roleAssignmentOrganizationIds.add(change.targetId);
                  break;
                case RoleAssignmentTargetTypeValue.Position:
                  roleAssignmentPositionIds.add(change.targetId);
                  break;
                case RoleAssignmentTargetTypeValue.Employment:
                  roleAssignmentEmploymentIds.add(change.targetId);
                  break;
              }
            }
            break;
        }
      }

      const organizationUserIds = await affectedUserRepository.findByOrganizationIds([...organizationIds]);
      for (const userId of organizationUserIds)
        addReason(reasonsByUserId, userId, reasonForChangeKind("organization"));
      const positionUserIds = await affectedUserRepository.findByPositionIds([...positionIds]);
      for (const userId of positionUserIds)
        addReason(reasonsByUserId, userId, reasonForChangeKind("position"));
      const roleUserIds = await affectedUserRepository.findByRoleIds([...roleIds]);
      for (const userId of roleUserIds)
        addReason(reasonsByUserId, userId, reasonForChangeKind("role"));
      const roleAssignmentOrganizationUserIds = await affectedUserRepository.findByOrganizationIds(
        [...roleAssignmentOrganizationIds],
      );
      for (const userId of roleAssignmentOrganizationUserIds)
        addReason(reasonsByUserId, userId, reasonForChangeKind("role-assignment"));
      const roleAssignmentPositionUserIds = await affectedUserRepository.findByPositionIds(
        [...roleAssignmentPositionIds],
      );
      for (const userId of roleAssignmentPositionUserIds)
        addReason(reasonsByUserId, userId, reasonForChangeKind("role-assignment"));
      const roleAssignmentEmploymentUserIds = await affectedUserRepository.findByEmploymentIds(
        [...roleAssignmentEmploymentIds],
      );
      for (const userId of roleAssignmentEmploymentUserIds)
        addReason(reasonsByUserId, userId, reasonForChangeKind("role-assignment"));

      await dirtyWorkflow.markDirty(
        [...reasonsByUserId]
          .sort(([leftUserId], [rightUserId]) => leftUserId - rightUserId)
          .map(([userId, reasons]) => ({
            userId,
            reasonCodes: CANONICAL_DIRTY_REASON_ORDER.filter(reason => reasons.has(reason)),
          })),
        {
          requestId: deps.lifecycle.observability?.requestId ?? undefined,
          traceId: deps.lifecycle.observability?.traceId ?? undefined,
        },
      );
    },
  };
}

export type UserProfileInvalidation = ReturnType<typeof createUserProfileInvalidation>;

function reasonForChangeKind(kind: UserProfileSourceChange["kind"]): UserProfileDirtyReason {
  switch (kind) {
    case "user":
      return UserProfileDirtyReasonValue.UserUpdated;
    case "employment":
      return UserProfileDirtyReasonValue.EmploymentUpdated;
    case "organization":
      return UserProfileDirtyReasonValue.OrganizationUpdated;
    case "position":
      return UserProfileDirtyReasonValue.PositionUpdated;
    case "role":
    case "role-assignment":
      return UserProfileDirtyReasonValue.RoleUpdated;
  }
}

function addReason(
  reasonsByUserId: Map<number, Set<UserProfileDirtyReason>>,
  userId: number,
  reason: UserProfileDirtyReason,
) {
  const reasons = reasonsByUserId.get(userId) ?? new Set<UserProfileDirtyReason>();
  reasons.add(reason);
  reasonsByUserId.set(userId, reasons);
}

function isValidId(id: number) {
  return Number.isSafeInteger(id) && id > 0;
}

function createAfterCommitDelivery(deps: CreateUserProfileInvalidationDeps) {
  const pendingByUserId = new Map<number, RebuildUserProfileJobPayload>();
  let registered = false;

  return {
    deliver(payloads: RebuildUserProfileJobPayload[]) {
      for (const payload of payloads)
        pendingByUserId.set(payload.userId, payload);

      if (registered)
        return;

      deps.lifecycle.afterCommit.bestEffort("user_profile.rebuild.wake_up", async () => {
        await deps.jobProducer.enqueueRebuildJobs(
          [...pendingByUserId.values()]
            .sort((left, right) => left.userId - right.userId)
            .map(payload => payload),
        );
      });
      registered = true;
    },
  };
}
