import type {
  PrivilegeDelegationResolutionIntegrityViolation,
  PrivilegeDelegationResolutionObservation,
  PrivilegeDelegationResolutionQuery,
  PrivilegeDelegationResolutionResult,
} from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.type";
import type { DbClient } from "@iam/db";
import { PrivilegeDelegationStatus } from "@iam/contracts";
import {
  delegationDetails,
  organizationClosures,
  organizations,
  privilegeDelegations,
  privileges,
  users,
} from "@iam/db/schema";
import { sql } from "drizzle-orm";

interface PrivilegeDelegationResolutionRow
  extends PrivilegeDelegationResolutionResult, Record<string, unknown> {
  delegationId: number | null;
  delegatorUserId: number | null;
  delegateeUserId: number | null;
  organizationScopeId: number | null;
  delegateeRecognized: boolean;
  scopeOrganizationRecognized: boolean;
  invalidPrivilegeIds: number[];
  userRecognized: boolean;
  organizationRecognized: boolean;
  privilegeRecognized: boolean;
}

export function createPrivilegeDelegationResolutionRepository(
  db: DbClient,
) {
  return {
    async resolveCurrent(
      query: PrivilegeDelegationResolutionQuery,
    ): Promise<PrivilegeDelegationResolutionObservation> {
      const requestedUsernames = sql.join(
        query.usernames.map(username => sql`${username}`),
        sql`, `,
      );
      const observedAt = query.observedAt.toISOString();
      const rows = await db.execute<PrivilegeDelegationResolutionRow>(sql`
        WITH requested_users AS (
          SELECT requested.username, requested.ordinality::int AS ordinal
          FROM unnest(ARRAY[${requestedUsernames}]::text[])
            WITH ORDINALITY AS requested(username, ordinality)
        ),
        requested_context AS (
          SELECT
            (
              SELECT requested_organization.id
              FROM ${organizations} AS requested_organization
              WHERE requested_organization.org_code = ${query.orgCode}
                AND requested_organization.is_delete = false
            ) AS organization_id,
            (
              SELECT requested_privilege.id
              FROM ${privileges} AS requested_privilege
              WHERE requested_privilege.privilege_code = ${query.privilegeCode}
                AND requested_privilege.is_delete = false
            ) AS privilege_id,
            ${observedAt}::timestamp AS observed_at
        )
        SELECT
          requested.username AS "username",
          delegation.id AS "delegationId",
          delegation.delegator_user_id AS "delegatorUserId",
          delegation.delegatee_user_id AS "delegateeUserId",
          delegation.organization_scope_id AS "organizationScopeId",
          delegatee.username AS "delegateeUsername",
          delegatee.id IS NOT NULL AS "delegateeRecognized",
          scope_organization.id IS NOT NULL AS "scopeOrganizationRecognized",
          ARRAY(
            SELECT checked_detail.privilege_id
            FROM ${delegationDetails} AS checked_detail
            LEFT JOIN ${privileges} AS checked_privilege
              ON checked_privilege.id = checked_detail.privilege_id
              AND checked_privilege.is_delete = false
            WHERE checked_detail.delegation_id = delegation.id
              AND checked_privilege.id IS NULL
            ORDER BY checked_detail.privilege_id
          ) AS "invalidPrivilegeIds",
          delegator.id IS NOT NULL AS "userRecognized",
          context.organization_id IS NOT NULL AS "organizationRecognized",
          context.privilege_id IS NOT NULL AS "privilegeRecognized"
        FROM requested_users AS requested
        LEFT JOIN ${users} AS delegator
          ON delegator.username = requested.username
          AND delegator.is_delete = false
        CROSS JOIN requested_context AS context
        LEFT JOIN ${privilegeDelegations} AS delegation
          ON delegation.delegator_user_id = delegator.id
          AND delegation.is_delete = false
          AND delegation.status = ${PrivilegeDelegationStatus.Enable}
          AND delegation.start_time <= context.observed_at
          AND delegation.end_time >= context.observed_at
          AND EXISTS (
            SELECT 1
            FROM ${organizationClosures} AS scope_closure
            WHERE scope_closure.ancestor_id = delegation.organization_scope_id
              AND scope_closure.descendant_id = context.organization_id
          )
          AND EXISTS (
            SELECT 1
            FROM ${delegationDetails} AS delegation_detail
            WHERE delegation_detail.delegation_id = delegation.id
              AND delegation_detail.privilege_id = context.privilege_id
          )
        LEFT JOIN ${users} AS delegatee
          ON delegatee.id = delegation.delegatee_user_id
          AND delegatee.is_delete = false
        LEFT JOIN ${organizations} AS scope_organization
          ON scope_organization.id = delegation.organization_scope_id
          AND scope_organization.is_delete = false
        ORDER BY requested.ordinal, delegation.id
      `);

      const context = rows[0];
      const delegationIdsByUsername = new Map<string, number[]>();
      for (const row of rows) {
        if (row.delegationId === null)
          continue;
        const delegationIds = delegationIdsByUsername.get(row.username) ?? [];
        delegationIds.push(row.delegationId);
        delegationIdsByUsername.set(row.username, delegationIds);
      }
      const integrityViolations: PrivilegeDelegationResolutionIntegrityViolation[]
        = [...delegationIdsByUsername]
          .filter(([, delegationIds]) => delegationIds.length > 1)
          .map(([username, delegationIds]) => ({
            category: "ambiguous-delegation",
            username,
            delegationIds,
          }));
      for (const row of rows) {
        if (row.delegationId === null)
          continue;
        if (row.delegatorUserId === row.delegateeUserId) {
          integrityViolations.push({
            category: "self-delegation",
            username: row.username,
            delegationId: row.delegationId,
          });
        }
        if (!row.delegateeRecognized) {
          integrityViolations.push({
            category: "invalid-reference",
            username: row.username,
            delegationId: row.delegationId,
            relation: "delegatee-user",
            referencedIds: [row.delegateeUserId!],
          });
        }
        if (!row.scopeOrganizationRecognized) {
          integrityViolations.push({
            category: "invalid-reference",
            username: row.username,
            delegationId: row.delegationId,
            relation: "scope-organization",
            referencedIds: [row.organizationScopeId!],
          });
        }
        if (row.invalidPrivilegeIds.length > 0) {
          integrityViolations.push({
            category: "invalid-reference",
            username: row.username,
            delegationId: row.delegationId,
            relation: "privilege",
            referencedIds: row.invalidPrivilegeIds,
          });
        }
      }
      return {
        results: rows
          .filter(row => row.userRecognized)
          .map(row => ({
            username: row.username,
            delegateeUsername: row.delegateeUsername,
          })),
        missingInputs: {
          usernames: rows
            .filter(row => !row.userRecognized)
            .map(row => row.username),
          orgCodes: context?.organizationRecognized ? [] : [query.orgCode],
          privilegeCodes: context?.privilegeRecognized
            ? []
            : [query.privilegeCode],
        },
        integrityViolations,
      };
    },
  };
}

export type PrivilegeDelegationResolutionRepository = ReturnType<
  typeof createPrivilegeDelegationResolutionRepository
>;
