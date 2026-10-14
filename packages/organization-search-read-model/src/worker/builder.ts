import type { DbClient, db as database } from "@iam/db";
import { organizationClosures, organizations } from "@iam/db/schema";
import { desc, eq } from "drizzle-orm";
import { type OrganizationSearchDocument, OrganizationSearchDocumentSchema } from "../schema";

export class OrganizationSearchSourceIntegrityError extends Error {}

/** A transaction-bound reader; maintenance can reuse it within one complete read-only snapshot. */
export function createOrganizationSearchSourceReader(db: DbClient) {
  return {
    async readDocument(organizationId: number, signal?: AbortSignal): Promise<OrganizationSearchDocument | null> {
      signal?.throwIfAborted();
      const [target] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
      signal?.throwIfAborted();
      if (!target || target.isDelete) return null;
      const ancestors = await db
        .select({ ancestor: organizations, depth: organizationClosures.depth })
        .from(organizationClosures)
        .leftJoin(organizations, eq(organizationClosures.ancestorId, organizations.id))
        .where(eq(organizationClosures.descendantId, organizationId))
        .orderBy(desc(organizationClosures.depth));
      signal?.throwIfAborted();
      if (ancestors.length !== target.level || target.level < 1 || target.level > 5)
        throw new OrganizationSearchSourceIntegrityError("Incomplete Organization Search path");
      const pathIds: number[] = [];
      const path = ancestors.map(({ ancestor, depth }, index) => {
        if (
          !ancestor ||
          ancestor.level !== index + 1 ||
          depth !== target.level - index - 1 ||
          ancestor.parentId !== (pathIds.at(-1) ?? -1)
        ) {
          throw new OrganizationSearchSourceIntegrityError("Inconsistent Organization Search path");
        }
        pathIds.push(ancestor.id);
        if (ancestor.path !== `/${pathIds.join("/")}`)
          throw new OrganizationSearchSourceIntegrityError("Inconsistent Organization Search source path");
        return {
          code: ancestor.orgCode,
          name: ancestor.orgName,
          type: ancestor.orgType,
          level: ancestor.level,
          distanceToTarget: depth,
        };
      });
      if (pathIds.at(-1) !== target.id)
        throw new OrganizationSearchSourceIntegrityError("Organization Search path does not end at target");
      return OrganizationSearchDocumentSchema.parse({
        organization: {
          code: target.orgCode,
          name: target.orgName,
          type: target.orgType,
          status: target.status,
          level: target.level,
          isVirtual: target.isVirtual,
          isEntity: target.isEntity,
          path,
        },
      });
    },
  };
}

export async function readOrganizationSearchSourceSnapshot(db: typeof database, organizationId: number) {
  return await db.transaction(
    async (tx) => await createOrganizationSearchSourceReader(tx).readDocument(organizationId),
    {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    },
  );
}
