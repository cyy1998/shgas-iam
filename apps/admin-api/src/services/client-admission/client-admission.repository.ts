import type { DbClient } from "@iam/db";
import { clients, users } from "@iam/db/schema";
import type { UserDocumentFilter } from "@iam/documents/user/document/query";
import { and, eq } from "drizzle-orm";

const columns = {
  id: clients.id,
  clientCode: clients.clientCode,
  clientName: clients.clientName,
  enabled: clients.admissionEnabled,
  filter: clients.admissionFilter,
};
const activeClient = (clientCode: string) => and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false));

export function createClientAdmissionRepository(db: DbClient) {
  async function update(
    clientCode: string,
    patch: { admissionFilter: UserDocumentFilter } | { admissionEnabled: boolean },
  ) {
    const rows = await db.update(clients).set(patch).where(activeClient(clientCode)).returning({ id: clients.id });
    return rows.length === 1;
  }

  return {
    async findSubjectIdentifier(userId: number) {
      const [row] = await db
        .select({ subjectIdentifier: users.subjectIdentifier })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.isDelete, false)));
      return row?.subjectIdentifier ?? null;
    },
    async get(clientCode: string) {
      const [row] = await db.select(columns).from(clients).where(activeClient(clientCode));
      return row ?? null;
    },
    async lock(clientCode: string) {
      const [row] = await db.select(columns).from(clients).where(activeClient(clientCode)).for("update");
      return row ?? null;
    },
    save(clientCode: string, filter: UserDocumentFilter) {
      return update(clientCode, { admissionFilter: filter });
    },
    setEnabled(clientCode: string, enabled: boolean) {
      return update(clientCode, { admissionEnabled: enabled });
    },
  };
}
