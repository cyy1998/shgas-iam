import type { DbClient, db as database } from "@iam/db";
import { organizationClosures, organizations } from "@iam/db/schema";
import { desc, eq } from "drizzle-orm";
import { type OrganizationDocument, OrganizationDocumentSchema } from "../schema";

export class OrganizationDocumentSourceIntegrityError extends Error {}

/** A transaction-bound reader; maintenance can reuse it within one complete read-only snapshot. */
export function createOrganizationDocumentSourceReader(db: DbClient) {
  return {
    async readDocument(organizationId: number, signal?: AbortSignal): Promise<OrganizationDocument | null> {
      signal?.throwIfAborted();
      const [target] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
      signal?.throwIfAborted();
      if (!target) throw new OrganizationDocumentSourceIntegrityError("Organization Document source is missing");
      if (target.isDelete) return null;
      const ancestors = await db
        .select({ ancestor: organizations, depth: organizationClosures.depth })
        .from(organizationClosures)
        .leftJoin(organizations, eq(organizationClosures.ancestorId, organizations.id))
        .where(eq(organizationClosures.descendantId, organizationId))
        .orderBy(desc(organizationClosures.depth));
      signal?.throwIfAborted();
      if (ancestors.length !== target.level || target.level < 1 || target.level > 5)
        throw new OrganizationDocumentSourceIntegrityError("Incomplete Organization Search path");
      const pathIds: number[] = [];
      const path = ancestors.map(({ ancestor, depth }, index) => {
        if (
          !ancestor ||
          ancestor.level !== index + 1 ||
          depth !== target.level - index - 1 ||
          ancestor.parentId !== (pathIds.at(-1) ?? -1)
        ) {
          throw new OrganizationDocumentSourceIntegrityError("Inconsistent Organization Search path");
        }
        pathIds.push(ancestor.id);
        if (ancestor.path !== `/${pathIds.join("/")}`)
          throw new OrganizationDocumentSourceIntegrityError("Inconsistent Organization Search source path");
        return {
          code: ancestor.orgCode,
          name: ancestor.orgName,
          type: ancestor.orgType,
          level: ancestor.level,
          distanceToTarget: depth,
        };
      });
      if (pathIds.at(-1) !== target.id)
        throw new OrganizationDocumentSourceIntegrityError("Organization Search path does not end at target");
      return OrganizationDocumentSchema.parse({
        code: target.orgCode,
        name: target.orgName,
        type: target.orgType,
        status: target.status,
        level: target.level,
        isVirtual: target.isVirtual,
        isEntity: target.isEntity,
        path,
      });
    },
  };
}

export async function readOrganizationDocumentSourceSnapshot(db: typeof database, organizationId: number) {
  return await db.transaction(
    async (tx) => await createOrganizationDocumentSourceReader(tx).readDocument(organizationId),
    {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    },
  );
}
