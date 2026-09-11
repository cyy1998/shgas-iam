import type { OrganizationResponsibilityReadScope } from "@admin-api/services/admin-authorization/admin-organization-responsibility-authorization.type";
import type { EmploymentStatus, OrganizationStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import type { OrganizationResponsibilityAssignmentRecordCreate } from "@iam/domain/organization-responsibility";
import type {
  OrganizationResponsibilityAssignmentLifecycleChange,
  OrganizationResponsibilityAssignmentWriteTarget,
} from "./organization-responsibility-parent-lifecycle.type";
import type {
  OrganizationResponsibilityAssignmentData,
  OrganizationResponsibilityAssignmentLifecycle,
} from "./organization-responsibility.schema";
import {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
} from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import { firstRow } from "@iam/db/query-utils";
import {
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  users,
} from "@iam/db/schema";
import {
  getOrganizationResponsibilityOpenCardinalityViolation,
  getOrganizationResponsibilityParentLifecycleViolation,
  OrganizationResponsibilityAssignmentCardinalityConflictError,
  OrganizationResponsibilityAssignmentDuplicateOpenError,
  OrganizationResponsibilityAssignmentUnmanageableConflictError,
} from "@iam/domain/organization-responsibility";
import { and, asc, desc, eq, inArray, isNull, lt, ne, notInArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const OPEN_ASSIGNMENT_STATUSES = [
  OrganizationResponsibilityAssignmentStatus.Enable,
  OrganizationResponsibilityAssignmentStatus.Pause,
] as const;

export function createOrganizationResponsibilityRepository(db: DbClient) {
  async function lockAssignmentsByIds(
    ids: readonly number[],
  ): Promise<OrganizationResponsibilityAssignmentWriteTarget[]> {
    if (ids.length === 0)
      return [];
    const selectedIds = [...new Set(ids)];
    const rows = await db.select({
      id: organizationResponsibilityAssignments.id,
      employmentId: organizationResponsibilityAssignments.employmentId,
      targetOrganizationId: organizationResponsibilityAssignments.targetOrganizationId,
      typeCode: organizationResponsibilityAssignments.typeCode,
      status: organizationResponsibilityAssignments.status,
      startTime: organizationResponsibilityAssignments.startTime,
      endTime: organizationResponsibilityAssignments.endTime,
    }).from(organizationResponsibilityAssignments).where(inArray(organizationResponsibilityAssignments.id, selectedIds)).orderBy(asc(organizationResponsibilityAssignments.id)).for("update");
    if (rows.length !== selectedIds.length)
      throw new Error("Selected Organization Responsibility Assignment disappeared before locking");
    return rows;
  }

  async function lockAssignmentsForEmployment(input: { employmentId: number; command: "pause" | "end" }) {
    return lockAssignmentsForEmployments({ employmentIds: [input.employmentId], command: input.command });
  }

  async function lockAssignmentsForEmployments(input: { employmentIds: readonly number[]; command: "pause" | "end" }) {
    if (input.employmentIds.length === 0)
      return [];
    // Select once, then lock by identity: a concurrent lifecycle change must be
    // rechecked on the returned row instead of removing it from the write set.
    const selected = await db.select({ id: organizationResponsibilityAssignments.id })
      .from(organizationResponsibilityAssignments)
      .where(and(
        inArray(organizationResponsibilityAssignments.employmentId, [...input.employmentIds]),
        input.command === "pause"
          ? eq(organizationResponsibilityAssignments.status, OrganizationResponsibilityAssignmentStatus.Enable)
          : inArray(organizationResponsibilityAssignments.status, [...OPEN_ASSIGNMENT_STATUSES]),
      ));
    return lockAssignmentsByIds(selected.map(row => row.id));
  }

  async function updateLockedAssignmentLifecycle(input: {
    assignment: OrganizationResponsibilityAssignmentWriteTarget;
    status: OrganizationResponsibilityAssignmentStatus;
    endTime: Date | null;
  }): Promise<OrganizationResponsibilityAssignmentLifecycleChange> {
    const { assignment } = input;
    const updated = firstRow(await db.update(organizationResponsibilityAssignments)
      .set({ status: input.status, endTime: input.endTime })
      .where(eq(organizationResponsibilityAssignments.id, assignment.id))
      .returning({
        afterStatus: organizationResponsibilityAssignments.status,
        afterEndTime: organizationResponsibilityAssignments.endTime,
      }));
    if (updated === null)
      throw new Error("Locked Organization Responsibility Assignment update affected no row");
    return {
      id: assignment.id,
      employmentId: assignment.employmentId,
      targetOrganizationId: assignment.targetOrganizationId,
      typeCode: assignment.typeCode,
      startTime: assignment.startTime,
      beforeStatus: assignment.status,
      beforeEndTime: assignment.endTime,
      ...updated,
    };
  }
  function isEndpointPairWithinReadScope(input: {
    readScope: OrganizationResponsibilityReadScope;
    holderOrganizationId: number;
    targetOrganizationId: number;
  }) {
    return input.readScope.kind === "full"
      || (
        input.readScope.organizationIds.includes(input.holderOrganizationId)
        && input.readScope.organizationIds.includes(input.targetOrganizationId)
      );
  }

  async function hasOpenAssignmentTargetingOrganizationSubtree(
    organizationId: number,
  ) {
    const row = firstRow(
      await db
        .select({ id: organizationResponsibilityAssignments.id })
        .from(organizationResponsibilityAssignments)
        .innerJoin(
          organizationClosures,
          eq(
            organizationResponsibilityAssignments.targetOrganizationId,
            organizationClosures.descendantId,
          ),
        )
        .where(
          and(
            eq(organizationClosures.ancestorId, organizationId),
            inArray(organizationResponsibilityAssignments.status, [
              ...OPEN_ASSIGNMENT_STATUSES,
            ]),
          ),
        )
        .limit(1),
    );
    return row !== null;
  }

  async function hasOpenAssignmentTargetingOrganizationSubtreeOutsideScope(
    organizationId: number,
    organizationIds: readonly number[],
  ) {
    if (organizationIds.length === 0)
      return await hasOpenAssignmentTargetingOrganizationSubtree(organizationId);
    const holderOrganization = alias(
      organizations,
      "responsibility_blocker_holder_organization",
    );
    const row = firstRow(
      await db
        .select({ id: organizationResponsibilityAssignments.id })
        .from(organizationResponsibilityAssignments)
        .innerJoin(
          organizationClosures,
          eq(
            organizationResponsibilityAssignments.targetOrganizationId,
            organizationClosures.descendantId,
          ),
        )
        .leftJoin(
          employments,
          eq(
            organizationResponsibilityAssignments.employmentId,
            employments.id,
          ),
        )
        .leftJoin(
          holderOrganization,
          eq(employments.orgId, holderOrganization.id),
        )
        .where(and(
          eq(organizationClosures.ancestorId, organizationId),
          inArray(organizationResponsibilityAssignments.status, [
            ...OPEN_ASSIGNMENT_STATUSES,
          ]),
          or(
            isNull(employments.id),
            eq(employments.isDelete, true),
            isNull(holderOrganization.id),
            eq(holderOrganization.isDelete, true),
            notInArray(holderOrganization.id, [...organizationIds]),
            notInArray(
              organizationResponsibilityAssignments.targetOrganizationId,
              [...organizationIds],
            ),
          ),
        ))
        .limit(1),
    );
    return row !== null;
  }

  async function findOpenAssignmentForSlot(input: {
    employmentId: number;
    targetOrganizationId: number;
    typeCode: OrganizationResponsibilityTypeCode;
    excludeAssignmentId?: number;
    readScope?: OrganizationResponsibilityReadScope;
  }) {
    const row = firstRow(await db
      .select({
        id: organizationResponsibilityAssignments.id,
        employmentId: organizationResponsibilityAssignments.employmentId,
        holderOrganizationId: employments.orgId,
      })
      .from(organizationResponsibilityAssignments)
      .leftJoin(
        employments,
        eq(organizationResponsibilityAssignments.employmentId, employments.id),
      )
      .where(and(
        eq(
          organizationResponsibilityAssignments.targetOrganizationId,
          input.targetOrganizationId,
        ),
        eq(organizationResponsibilityAssignments.typeCode, input.typeCode),
        inArray(organizationResponsibilityAssignments.status, [
          ...OPEN_ASSIGNMENT_STATUSES,
        ]),
        input.excludeAssignmentId === undefined
          ? undefined
          : ne(
              organizationResponsibilityAssignments.id,
              input.excludeAssignmentId,
            ),
        input.typeCode === OrganizationResponsibilityTypeCode.Supervising
          ? eq(
              organizationResponsibilityAssignments.employmentId,
              input.employmentId,
            )
          : undefined,
      ))
      .limit(1));
    if (row === null)
      return null;
    return {
      id: row.id,
      employmentId: row.employmentId,
      isManageable: input.readScope === undefined
        ? true
        : row.holderOrganizationId !== null
          && isEndpointPairWithinReadScope({
            readScope: input.readScope,
            holderOrganizationId: row.holderOrganizationId,
            targetOrganizationId: input.targetOrganizationId,
          }),
    };
  }

  async function readAssignmentViews(input: {
    readScope: OrganizationResponsibilityReadScope;
    targetOrganizationCode?: string;
    employmentId?: number;
    typeCode?: OrganizationResponsibilityTypeCode;
    lifecycle: OrganizationResponsibilityAssignmentLifecycle;
    id?: number;
    cursorId?: number;
    limit: number;
    offset?: number;
  }): Promise<{ items: OrganizationResponsibilityAssignmentData[]; total: number }> {
    const holderOrganization = alias(
      organizations,
      "responsibility_holder_organization",
    );
    const targetOrganization = alias(
      organizations,
      "responsibility_target_organization",
    );
    const orphanTargetOrganization = alias(
      organizations,
      "responsibility_orphan_target_organization",
    );
    if (
      input.readScope.kind === "full"
      && input.targetOrganizationCode !== undefined
    ) {
      const orphanTarget = firstRow(
        await db
          .select({ id: organizationResponsibilityAssignments.id })
          .from(organizationResponsibilityAssignments)
          .leftJoin(
            orphanTargetOrganization,
            eq(
              organizationResponsibilityAssignments.targetOrganizationId,
              orphanTargetOrganization.id,
            ),
          )
          .where(
            and(
              inArray(organizationResponsibilityAssignments.status, [
                ...OPEN_ASSIGNMENT_STATUSES,
              ]),
              isNull(orphanTargetOrganization.id),
            ),
          )
          .limit(1),
      );
      if (orphanTarget !== null) {
        throw new Error(
          `Organization responsibility assignment ${orphanTarget.id} has no valid target Organization`,
        );
      }
    }
    const query = db
      .select({
        id: organizationResponsibilityAssignments.id,
        typeCode: organizationResponsibilityAssignments.typeCode,
        status: organizationResponsibilityAssignments.status,
        startTime: organizationResponsibilityAssignments.startTime,
        endTime: organizationResponsibilityAssignments.endTime,
        employmentId: employments.id,
        holderEmploymentStatus: employments.status,
        holderEmploymentIsDelete: employments.isDelete,
        userId: users.id,
        username: users.username,
        userName: users.name,
        holderOrganizationId: holderOrganization.id,
        holderOrganizationCode: holderOrganization.orgCode,
        holderOrganizationName: holderOrganization.orgName,
        holderOrganizationPath: holderOrganization.path,
        positionId: positions.id,
        positionCode: positions.posCode,
        positionName: positions.posName,
        targetOrganizationId: targetOrganization.id,
        targetOrganizationCode: targetOrganization.orgCode,
        targetOrganizationName: targetOrganization.orgName,
        targetOrganizationPath: targetOrganization.path,
        targetOrganizationStatus: targetOrganization.status,
        targetOrganizationIsDelete: targetOrganization.isDelete,
      })
      .from(organizationResponsibilityAssignments)
      .leftJoin(
        employments,
        and(
          eq(
            organizationResponsibilityAssignments.employmentId,
            employments.id,
          ),
          eq(employments.isDelete, false),
        ),
      )
      .leftJoin(
        users,
        and(eq(employments.userId, users.id), eq(users.isDelete, false)),
      )
      .leftJoin(
        holderOrganization,
        and(
          eq(employments.orgId, holderOrganization.id),
          eq(holderOrganization.isDelete, false),
        ),
      )
      .leftJoin(
        positions,
        and(eq(employments.posId, positions.id), eq(positions.isDelete, false)),
      )
      .leftJoin(
        targetOrganization,
        eq(
          organizationResponsibilityAssignments.targetOrganizationId,
          targetOrganization.id,
        ),
      )
      .where(
        and(
          input.id === undefined
            ? input.targetOrganizationCode === undefined
              ? undefined
              : eq(targetOrganization.orgCode, input.targetOrganizationCode)
            : eq(organizationResponsibilityAssignments.id, input.id),
          input.readScope.kind === "scoped"
            ? and(
                inArray(
                  holderOrganization.id,
                  [...input.readScope.organizationIds],
                ),
                inArray(
                  targetOrganization.id,
                  [...input.readScope.organizationIds],
                ),
              )
            : undefined,
          input.employmentId === undefined
            ? undefined
            : eq(
                organizationResponsibilityAssignments.employmentId,
                input.employmentId,
              ),
          input.typeCode === undefined
            ? undefined
            : eq(
                organizationResponsibilityAssignments.typeCode,
                input.typeCode,
              ),
          input.cursorId === undefined
            ? undefined
            : lt(organizationResponsibilityAssignments.id, input.cursorId),
          input.id === undefined && input.lifecycle === "open"
            ? inArray(organizationResponsibilityAssignments.status, [
                ...OPEN_ASSIGNMENT_STATUSES,
              ])
            : undefined,
          input.id === undefined && input.lifecycle === "ended"
            ? eq(
                organizationResponsibilityAssignments.status,
                OrganizationResponsibilityAssignmentStatus.Disable,
              )
            : undefined,
        ),
      );
    const total = input.offset === undefined
      ? 0
      : await db.$count(query.as("filtered_assignments"));
    const rows = await query.orderBy(desc(organizationResponsibilityAssignments.id))
      .limit(input.limit)
      .offset(input.offset ?? 0);

    if (input.id !== undefined && rows[0] !== undefined) {
      const targetOrganizationCode = requireValue(
        rows[0].targetOrganizationCode,
        rows[0].id,
        "target Organization code",
      );
      if (
        input.targetOrganizationCode !== undefined
        && targetOrganizationCode !== input.targetOrganizationCode
      ) {
        return { items: [], total };
      }
    }

    const openTargetOrganizationIds = [
      ...new Set(
        rows
          .filter(row => isOpenAssignmentStatus(row.status))
          .map(row =>
            requireValue(
              row.targetOrganizationId,
              row.id,
              "target Organization",
            ),
          ),
      ),
    ];
    if (openTargetOrganizationIds.length > 0) {
      const openSlots = await db
        .select({
          id: organizationResponsibilityAssignments.id,
          targetOrganizationId:
            organizationResponsibilityAssignments.targetOrganizationId,
          typeCode: organizationResponsibilityAssignments.typeCode,
          employmentId: organizationResponsibilityAssignments.employmentId,
          assignmentStatus: organizationResponsibilityAssignments.status,
          holderEmploymentStatus: employments.status,
          holderEmploymentIsDelete: employments.isDelete,
          targetOrganizationStatus: targetOrganization.status,
          targetOrganizationIsDelete: targetOrganization.isDelete,
        })
        .from(organizationResponsibilityAssignments)
        .innerJoin(
          targetOrganization,
          eq(
            organizationResponsibilityAssignments.targetOrganizationId,
            targetOrganization.id,
          ),
        )
        .leftJoin(
          employments,
          eq(
            organizationResponsibilityAssignments.employmentId,
            employments.id,
          ),
        )
        .where(
          and(
            inArray(
              organizationResponsibilityAssignments.targetOrganizationId,
              openTargetOrganizationIds,
            ),
            inArray(organizationResponsibilityAssignments.status, [
              ...OPEN_ASSIGNMENT_STATUSES,
            ]),
          ),
        );
      const slotsByTarget = new Map<number, typeof openSlots>();
      for (const row of openSlots) {
        assertAssignmentParentLifecycle(row);
        const targetRows = slotsByTarget.get(row.targetOrganizationId) ?? [];
        targetRows.push(row);
        slotsByTarget.set(row.targetOrganizationId, targetRows);
      }
      for (const targetRows of slotsByTarget.values())
        assertOpenCardinality(targetRows);
    }

    const organizationIds = rows.flatMap(row => [
      requireValue(row.holderOrganizationId, row.id, "holder Organization"),
      requireValue(row.targetOrganizationId, row.id, "target Organization"),
    ]);
    const paths = await readOrganizationPaths(organizationIds);

    const items = rows.map((row) => {
      assertAssignmentParentLifecycle({
        id: row.id,
        assignmentStatus: row.status,
        holderEmploymentStatus: row.holderEmploymentStatus,
        holderEmploymentIsDelete: row.holderEmploymentIsDelete,
        targetOrganizationStatus: row.targetOrganizationStatus,
        targetOrganizationIsDelete: row.targetOrganizationIsDelete,
      });
      return {
        id: row.id,
        typeCode: row.typeCode,
        status: row.status,
        startTime: row.startTime.toISOString(),
        endTime: row.endTime?.toISOString() ?? null,
        holder: {
          employmentId: requireValue(row.employmentId, row.id, "Employment"),
          user: {
            id: requireValue(row.userId, row.id, "User"),
            username: requireValue(row.username, row.id, "User username"),
            name: requireValue(row.userName, row.id, "User name"),
          },
          organization: {
            id: requireValue(
              row.holderOrganizationId,
              row.id,
              "holder Organization",
            ),
            orgCode: requireValue(
              row.holderOrganizationCode,
              row.id,
              "holder Organization code",
            ),
            orgName: requireValue(
              row.holderOrganizationName,
              row.id,
              "holder Organization name",
            ),
            fullPath: requirePath(
              paths,
              row.holderOrganizationId,
              row.holderOrganizationPath,
              row.id,
              "holder Organization",
            ),
          },
          position: {
            id: requireValue(row.positionId, row.id, "Position"),
            posCode: requireValue(row.positionCode, row.id, "Position code"),
            posName: requireValue(row.positionName, row.id, "Position name"),
          },
        },
        targetOrganization: {
          id: requireValue(
            row.targetOrganizationId,
            row.id,
            "target Organization",
          ),
          orgCode: requireValue(
            row.targetOrganizationCode,
            row.id,
            "target Organization code",
          ),
          orgName: requireValue(
            row.targetOrganizationName,
            row.id,
            "target Organization name",
          ),
          fullPath: requirePath(
            paths,
            row.targetOrganizationId,
            row.targetOrganizationPath,
            row.id,
            "target Organization",
          ),
        },
      };
    });
    return { items, total };
  }

  async function readOrganizationPaths(orgIds: number[]) {
    if (orgIds.length === 0) {
      return new Map<
        number,
        { id: number; orgCode: string; orgName: string }[]
      >();
    }
    const ancestor = alias(organizations, "responsibility_path_ancestor");
    const rows = await db
      .select({
        descendantId: organizationClosures.descendantId,
        depth: organizationClosures.depth,
        id: ancestor.id,
        orgCode: ancestor.orgCode,
        orgName: ancestor.orgName,
      })
      .from(organizationClosures)
      .innerJoin(
        ancestor,
        and(
          eq(organizationClosures.ancestorId, ancestor.id),
          eq(ancestor.isDelete, false),
        ),
      )
      .where(inArray(organizationClosures.descendantId, [...new Set(orgIds)]));
    const result = new Map<
      number,
      { id: number; orgCode: string; orgName: string; depth: number }[]
    >();
    for (const { descendantId, ...node } of rows) {
      const path = result.get(descendantId) ?? [];
      path.push(node);
      result.set(descendantId, path);
    }
    return new Map(
      [...result].map(([id, path]) => [
        id,
        path
          .sort((a, b) => b.depth - a.depth || a.id - b.id)
          .map(({ depth: _depth, ...node }) => node),
      ]),
    );
  }

  return {
    lockAssignmentsByIds,
    lockAssignmentsForEmployment,
    lockAssignmentsForEmployments,
    updateLockedAssignmentLifecycle,
    hasOpenAssignmentTargetingOrganizationSubtree,
    hasOpenAssignmentTargetingOrganizationSubtreeOutsideScope,
    async getEmploymentForResponsibilityById(id: number) {
      const row = await db
        .select({
          id: employments.id,
          userId: employments.userId,
          organizationId: employments.orgId,
          status: employments.status,
          isDelete: employments.isDelete,
        })
        .from(employments)
        .where(eq(employments.id, id))
        .limit(1);
      return firstRow(row) ?? null;
    },
    async getOrganizationForResponsibilityByCode(orgCode: string) {
      const row = await db
        .select({
          id: organizations.id,
          orgCode: organizations.orgCode,
          status: organizations.status,
          isDelete: organizations.isDelete,
        })
        .from(organizations)
        .where(eq(organizations.orgCode, orgCode))
        .limit(1);
      return firstRow(row) ?? null;
    },
    findOpenAssignmentForSlot,
    isEndpointPairWithinReadScope,
    async lockAssignmentLifecycleContextById(id: number) {
      const selected = firstRow(await db.select({ id: organizationResponsibilityAssignments.id })
        .from(organizationResponsibilityAssignments)
        .where(eq(organizationResponsibilityAssignments.id, id)));
      if (selected === null)
        return null;
      await lockAssignmentsByIds([selected.id]);
      const row = firstRow(
        await db
          .select({
            assignmentId: organizationResponsibilityAssignments.id,
            employmentId: organizationResponsibilityAssignments.employmentId,
            targetOrganizationId:
              organizationResponsibilityAssignments.targetOrganizationId,
            typeCode: organizationResponsibilityAssignments.typeCode,
            assignmentStatus: organizationResponsibilityAssignments.status,
            startTime: organizationResponsibilityAssignments.startTime,
            endTime: organizationResponsibilityAssignments.endTime,
            holderEmploymentId: employments.id,
            holderUserId: employments.userId,
            holderOrganizationId: employments.orgId,
            holderEmploymentStatus: employments.status,
            holderEmploymentIsDelete: employments.isDelete,
            targetOrganizationRowId: organizations.id,
            targetOrganizationStatus: organizations.status,
            targetOrganizationIsDelete: organizations.isDelete,
          })
          .from(organizationResponsibilityAssignments)
          .leftJoin(
            employments,
            eq(
              organizationResponsibilityAssignments.employmentId,
              employments.id,
            ),
          )
          .leftJoin(
            organizations,
            eq(
              organizationResponsibilityAssignments.targetOrganizationId,
              organizations.id,
            ),
          )
          .where(eq(organizationResponsibilityAssignments.id, id))
          .limit(1),
      );
      if (row === null)
        return null;
      return {
        assignment: {
          id: row.assignmentId,
          employmentId: row.employmentId,
          targetOrganizationId: row.targetOrganizationId,
          typeCode: row.typeCode,
          status: row.assignmentStatus,
          startTime: row.startTime,
          endTime: row.endTime,
        },
        employment:
          row.holderEmploymentId === null
            ? null
            : {
                userId: requireValue(
                  row.holderUserId,
                  row.assignmentId,
                  "holder User",
                ),
                organizationId: requireValue(
                  row.holderOrganizationId,
                  row.assignmentId,
                  "holder Organization",
                ),
                status: requireValue(
                  row.holderEmploymentStatus,
                  row.assignmentId,
                  "holder Employment status",
                ),
                isDelete: requireValue(
                  row.holderEmploymentIsDelete,
                  row.assignmentId,
                  "holder Employment deletion state",
                ),
              },
        targetOrganization:
          row.targetOrganizationRowId === null
            ? null
            : {
                status: requireValue(
                  row.targetOrganizationStatus,
                  row.assignmentId,
                  "target Organization status",
                ),
                isDelete: requireValue(
                  row.targetOrganizationIsDelete,
                  row.assignmentId,
                  "target Organization deletion state",
                ),
              },
      };
    },
    async listAssignmentsForAdmin(input: {
      targetOrganizationCode?: string;
      employmentId?: number;
      typeCode?: OrganizationResponsibilityTypeCode;
      lifecycle: OrganizationResponsibilityAssignmentLifecycle;
      cursorId?: number;
      limit: number;
    }, readScope: OrganizationResponsibilityReadScope) {
      if (
        readScope.kind === "scoped"
        && readScope.organizationIds.length === 0
      ) {
        return [];
      }
      return (await readAssignmentViews({ ...input, readScope })).items;
    },
    async searchAssignmentPageForAdmin(input: {
      targetOrganizationCode?: string;
      employmentId?: number;
      typeCode?: OrganizationResponsibilityTypeCode;
      lifecycle: OrganizationResponsibilityAssignmentLifecycle;
      pageNum: number;
      pageSize: number;
    }, readScope: OrganizationResponsibilityReadScope) {
      if (readScope.kind === "scoped" && readScope.organizationIds.length === 0)
        return { items: [], total: 0 };
      return await readAssignmentViews({
        ...input,
        readScope,
        limit: input.pageSize,
        offset: (input.pageNum - 1) * input.pageSize,
      });
    },
    async getAssignmentDetailForAdmin(
      input: { orgCode?: string; id: number },
      readScope: OrganizationResponsibilityReadScope,
    ) {
      if (
        readScope.kind === "scoped"
        && readScope.organizationIds.length === 0
      ) {
        return null;
      }
      return (
        firstRow(
          (await readAssignmentViews({
            readScope,
            targetOrganizationCode: input.orgCode,
            id: input.id,
            lifecycle: "all",
            limit: 1,
          })).items,
        ) ?? null
      );
    },
    async createAssignmentRecord(
      data: OrganizationResponsibilityAssignmentRecordCreate,
      readScope: OrganizationResponsibilityReadScope,
    ) {
      try {
        const created = firstRow(await db.insert(organizationResponsibilityAssignments)
          .values(data)
          .returning({ id: organizationResponsibilityAssignments.id }));
        if (created === null)
          throw new Error("Organization Responsibility Assignment insert affected no row");
        return created;
      }
      catch (error) {
        const detail = extractPostgresError(error);
        if (detail?.code === "23505") {
          if (detail.constraint === "org_resp_assignment_open_head_unique_idx") {
            if (readScope.kind === "scoped")
              throw new OrganizationResponsibilityAssignmentUnmanageableConflictError();
            throw new OrganizationResponsibilityAssignmentCardinalityConflictError();
          }
          if (detail.constraint === "org_resp_assignment_open_supervising_unique_idx")
            throw new OrganizationResponsibilityAssignmentDuplicateOpenError();
        }
        throw error;
      }
    },
  };
}

function isOpenAssignmentStatus(
  status: OrganizationResponsibilityAssignmentStatus,
) {
  return (
    status === OrganizationResponsibilityAssignmentStatus.Enable
    || status === OrganizationResponsibilityAssignmentStatus.Pause
  );
}

function requireValue<T>(
  value: T | null,
  assignmentId: number,
  relation: string,
): T {
  if (value === null) {
    throw new Error(
      `Organization responsibility assignment ${assignmentId} has no valid ${relation}`,
    );
  }
  return value;
}

function assertTargetOrganizationAvailable(
  isDelete: boolean | null,
  assignmentId: number,
) {
  if (isDelete !== false) {
    throw new Error(
      `Organization responsibility assignment ${assignmentId} has no valid target Organization`,
    );
  }
}

function assertAssignmentParentLifecycle(input: {
  id: number;
  assignmentStatus: OrganizationResponsibilityAssignmentStatus;
  holderEmploymentStatus: EmploymentStatus | null;
  holderEmploymentIsDelete: boolean | null;
  targetOrganizationStatus: OrganizationStatus | null;
  targetOrganizationIsDelete: boolean | null;
}) {
  assertTargetOrganizationAvailable(input.targetOrganizationIsDelete, input.id);
  const violation = getOrganizationResponsibilityParentLifecycleViolation({
    assignmentStatus: input.assignmentStatus,
    holderEmploymentStatus:
      input.holderEmploymentIsDelete === false
        ? input.holderEmploymentStatus
        : null,
    targetOrganizationStatus: input.targetOrganizationStatus,
  });
  if (violation !== null) {
    throw new Error(
      `Organization responsibility assignment ${input.id} parent lifecycle is invalid: ${violation}`,
    );
  }
}

function requirePath(
  paths: Map<number, { id: number; orgCode: string; orgName: string }[]>,
  organizationIdValue: number | null,
  organizationPathValue: string | null,
  assignmentId: number,
  relation: string,
) {
  const organizationId = requireValue(
    organizationIdValue,
    assignmentId,
    relation,
  );
  const path = paths.get(organizationId);
  const persistedPath = requireValue(
    organizationPathValue,
    assignmentId,
    `${relation} path`,
  );
  const expectedIds = persistedPath.split("/").filter(Boolean).map(Number);
  if (
    path === undefined
    || expectedIds.length === 0
    || expectedIds.some(id => !Number.isSafeInteger(id) || id <= 0)
    || expectedIds.length !== path.length
    || expectedIds.some((id, index) => path[index]?.id !== id)
  ) {
    throw new Error(
      `Organization responsibility assignment ${assignmentId} has no valid ${relation} path`,
    );
  }
  return path;
}

function assertOpenCardinality(
  rows: readonly {
    id: number;
    typeCode: OrganizationResponsibilityTypeCode;
    employmentId: number | null;
  }[],
) {
  const violation = getOrganizationResponsibilityOpenCardinalityViolation(rows);
  if (violation !== null) {
    throw new Error(
      `Organization responsibility Open cardinality is invalid: ${violation}`,
    );
  }
}

export type OrganizationResponsibilityRepository = ReturnType<
  typeof createOrganizationResponsibilityRepository
>;
