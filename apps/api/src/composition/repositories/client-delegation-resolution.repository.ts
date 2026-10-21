import type {
  ClientDelegationResolutionIntegrityViolation,
  ClientDelegationResolutionObservation,
  ClientDelegationResolutionQuery,
  ClientDelegationResolutionResult,
} from "@api/use-cases/internal/resolve-client-delegations/resolve-client-delegations.type";
import { ClientDelegationStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { clientDelegations, organizationClosures, organizations, users } from "@iam/db/schema";
import { sql } from "drizzle-orm";

interface ClientDelegationResolutionRow extends ClientDelegationResolutionResult, Record<string, unknown> {
  delegationId: number | null;
  delegatorUserId: number | null;
  delegateeUserId: number | null;
  organizationScopeId: number | null;
  delegateeRecognized: boolean;
  scopeOrganizationRecognized: boolean;
  userRecognized: boolean;
  organizationRecognized: boolean;
}

export function createClientDelegationResolutionRepository(db: DbClient) {
  return {
    async resolveCurrent(query: ClientDelegationResolutionQuery): Promise<ClientDelegationResolutionObservation> {
      const requestedUsernames = sql.join(
        query.usernames.map((username) => sql`${username}`),
        sql`, `,
      );
      const observedAt = query.observedAt.toISOString();
      const rows = await db.execute<ClientDelegationResolutionRow>(sql`
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
          delegator.id IS NOT NULL AS "userRecognized",
          context.organization_id IS NOT NULL AS "organizationRecognized"
        FROM requested_users AS requested
        LEFT JOIN ${users} AS delegator
          ON delegator.username = requested.username
          AND delegator.is_delete = false
        CROSS JOIN requested_context AS context
        LEFT JOIN ${clientDelegations} AS delegation
          ON delegation.delegator_user_id = delegator.id
          AND delegation.client_id = ${query.clientId}
          AND delegation.status = ${ClientDelegationStatus.Enable}
          AND delegation.start_time <= context.observed_at
          AND delegation.end_time >= context.observed_at
          AND EXISTS (
            SELECT 1
            FROM ${organizationClosures} AS scope_closure
            WHERE scope_closure.ancestor_id = delegation.organization_scope_id
              AND scope_closure.descendant_id = context.organization_id
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
        if (row.delegationId === null) continue;
        const delegationIds = delegationIdsByUsername.get(row.username) ?? [];
        delegationIds.push(row.delegationId);
        delegationIdsByUsername.set(row.username, delegationIds);
      }
      const integrityViolations: ClientDelegationResolutionIntegrityViolation[] = [...delegationIdsByUsername]
        .filter(([, delegationIds]) => delegationIds.length > 1)
        .map(([username, delegationIds]) => ({
          category: "ambiguous-delegation",
          username,
          delegationIds,
        }));
      for (const row of rows) {
        if (row.delegationId === null) continue;
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
      }
      return {
        results: rows
          .filter((row) => row.userRecognized)
          .map((row) => ({
            username: row.username,
            delegateeUsername: row.delegateeUsername,
          })),
        missingInputs: {
          usernames: rows.filter((row) => !row.userRecognized).map((row) => row.username),
          orgCodes: context?.organizationRecognized ? [] : [query.orgCode],
        },
        integrityViolations,
      };
    },
  };
}

export type ClientDelegationResolutionRepository = ReturnType<typeof createClientDelegationResolutionRepository>;
