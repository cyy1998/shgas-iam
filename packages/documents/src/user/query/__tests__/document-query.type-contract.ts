import type { UserDocumentFilter } from "../../document-query";

const organizationFilter: UserDocumentFilter = {
  exists: {
    path: "employments",
    where: { exists: { path: "organization.path", where: { field: "code", op: "eq", value: "root" } } },
  },
};
const roleFilter: UserDocumentFilter = {
  exists: { path: "employments", where: { field: "roles", op: "containsAll", value: ["reader"] } },
};
// @ts-expect-error Ownership is not a public field.
const ownershipFilter: UserDocumentFilter = { field: "clientCode", op: "eq", value: "alpha" };
// @ts-expect-error Employment fields require an element scope.
const unscopedRoleFilter: UserDocumentFilter = { field: "employments.roles", op: "containsAny", value: ["reader"] };

void [organizationFilter, roleFilter, ownershipFilter, unscopedRoleFilter];
