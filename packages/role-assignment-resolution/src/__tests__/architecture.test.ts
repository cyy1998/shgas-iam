import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "bun:test";
import ts from "typescript";

const workspaceRoot = join(import.meta.dir, "../../../..");
const migratedCallerRoots = [
  "apps/admin-api/src",
  "apps/api/src",
  "apps/oidc-provider/src",
  "packages/user-profile-read-model/src",
];
const approvedRoleAssignmentTableOwners = new Set([
  "apps/admin-api/src/services/role/role.repository.ts",
]);
const approvedRoleAssignmentTargetTypeOwners = [
  "apps/admin-api/src/routes/admin/role/",
  "apps/admin-api/src/services/role/",
  "apps/admin-api/src/services/audit/events/role.audit.ts",
];
const approvedAdminRoleRepositoryOperations = new Set([
  "countAssignmentsByRoleId",
  "createAssignment",
  "createRole",
  "deleteAssignment",
  "findAssignmentByRoleTarget",
  "getAnyRoleByCode",
  "getAssignableEmploymentById",
  "getAssignableOrganizationByCode",
  "getAssignablePositionByCode",
  "getAssignmentByIdForRole",
  "getClientByCode",
  "getRoleByCode",
  "searchAssignmentsPaged",
  "searchRolesPaged",
  "softDeleteRoleByCode",
  "updateAssignmentScope",
  "updateRoleByCode",
]);
const retiredApiRoleResolutionFiles = [
  "apps/api/src/services/role/role.repository.ts",
  "apps/api/src/services/user/user-detail.helper.ts",
];
const requiredDockerWorkspacePackages = {
  "apps/admin-api/Dockerfile": ["packages/role-assignment-resolution"],
  "apps/admin/Dockerfile": [
    "packages/role-assignment-resolution",
    "packages/user-profile-read-model",
  ],
  "apps/api/Dockerfile": ["packages/role-assignment-resolution"],
  "apps/oidc-provider/Dockerfile": ["packages/role-assignment-resolution"],
  "apps/worker/Dockerfile": ["packages/role-assignment-resolution"],
} satisfies Record<string, string[]>;

function toPosixPath(path: string) {
  return path.split(sep).join("/");
}

function collectProductionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory())
      return entry === "__tests__" ? [] : collectProductionTypeScriptFiles(path);
    return entry.endsWith(".ts") && !entry.endsWith(".test.ts") ? [path] : [];
  });
}

type RoleResolutionKnowledge = "organization closure" | "role assignment table" | "role assignment target type";

function collectRoleResolutionKnowledgeFromSource(file: string, content: string) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const knowledge = new Set<RoleResolutionKnowledge>();

  function visit(node: ts.Node) {
    if (ts.isIdentifier(node)) {
      if (node.text === "roleAssignments")
        knowledge.add("role assignment table");
      if (node.text === "RoleAssignmentTargetType")
        knowledge.add("role assignment target type");
      if (node.text === "organizationClosures")
        knowledge.add("organization closure");
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text === "roleAssignments" || node.text.includes("role_assignment"))
        knowledge.add("role assignment table");
      if (node.text === "organizationClosures" || node.text.includes("organization_closure"))
        knowledge.add("organization closure");
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text.includes("role-assignments"))
        knowledge.add("role assignment table");
      if (node.moduleSpecifier.text.includes("role-assignment-target-type"))
        knowledge.add("role assignment target type");
    }

    if (ts.isTaggedTemplateExpression(node) && node.template.getText(source).includes("role_assignment"))
      knowledge.add("role assignment table");
    if (ts.isTaggedTemplateExpression(node) && node.template.getText(source).includes("organization_closure"))
      knowledge.add("organization closure");

    ts.forEachChild(node, visit);
  }

  visit(source);
  return knowledge;
}

function isApprovedKnowledgeOwner(file: string, knowledge: RoleResolutionKnowledge) {
  if (knowledge === "organization closure")
    return true;
  if (knowledge === "role assignment table")
    return approvedRoleAssignmentTableOwners.has(file);
  return approvedRoleAssignmentTargetTypeOwners.some(owner =>
    owner.endsWith("/") ? file.startsWith(owner) : file === owner);
}

function inspectDirectFactoryOperations(file: string, content: string, factoryName: string) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const operations = new Set<string>();
  const unsupportedProperties: string[] = [];
  const factories = source.statements.filter((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === factoryName);
  if (factories.length !== 1 || !factories[0]?.body) {
    return { operations, shapeSupported: false, unsupportedProperties };
  }

  const returnStatements = factories[0].body.statements.filter(ts.isReturnStatement);
  const returnedExpression = returnStatements.length === 1 ? returnStatements[0]?.expression : undefined;
  if (!returnedExpression || !ts.isObjectLiteralExpression(returnedExpression)) {
    return { operations, shapeSupported: false, unsupportedProperties };
  }

  for (const property of returnedExpression.properties) {
    if (ts.isMethodDeclaration(property)
      && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
      operations.add(property.name.text);
    }
    else {
      unsupportedProperties.push(property.name?.getText(source) ?? property.getText(source));
    }
  }

  return {
    operations,
    shapeSupported: operations.size > 0 && unsupportedProperties.length === 0,
    unsupportedProperties,
  };
}

function collectArchitectureViolations(file: string, content: string) {
  const knowledge = collectRoleResolutionKnowledgeFromSource(file, content);
  const violations = [...knowledge]
    .filter(item => !isApprovedKnowledgeOwner(file, item))
    .map(item => `${file}: ${item}`);

  if (approvedRoleAssignmentTableOwners.has(file)) {
    if (knowledge.has("role assignment table") && knowledge.has("organization closure"))
      violations.push(`${file}: role management combines assignment access with organization closure`);

    const factory = inspectDirectFactoryOperations(file, content, "createRoleRepository");
    if (!factory.shapeSupported) {
      violations.push(`${file}: unsupported role repository factory shape`);
      violations.push(...factory.unsupportedProperties.map(property =>
        `${file}: unsupported role repository property ${property}`));
    }

    const unexpectedOperations = [...factory.operations]
      .filter(operation => !approvedAdminRoleRepositoryOperations.has(operation));
    violations.push(...unexpectedOperations.map(operation =>
      `${file}: unapproved role repository operation ${operation}`));
  }

  return violations;
}

function collectDockerCopySources(content: string) {
  return new Set(content.split(/\r?\n/).flatMap((line) => {
    const match = /^COPY\s+(\S+)\s+\S+\s*$/.exec(line);
    return match?.[1] ? [match[1]] : [];
  }));
}

describe("role assignment resolution architecture", () => {
  test("keeps direct assignment-table access behind the resolver and role management", () => {
    const violations = migratedCallerRoots
      .flatMap(root => collectProductionTypeScriptFiles(join(workspaceRoot, root)))
      .map(file => toPosixPath(relative(workspaceRoot, file)))
      .flatMap(file => collectArchitectureViolations(
        file,
        readFileSync(join(workspaceRoot, file), "utf8"),
      ));

    expect(violations).toEqual([]);
  });

  test("detects alternate assignment access and target-type rule reconstruction", () => {
    const directImport = collectArchitectureViolations("apps/api/src/direct.ts", `
      import { roleAssignments as assignments } from "@iam/db/schema";
      void assignments;
    `);
    const relationalQuery = collectArchitectureViolations("apps/api/src/query.ts", `
      void db.query.roleAssignments.findFirst();
    `);
    const deepImport = collectArchitectureViolations("apps/api/src/deep.ts", `
      import { roleAssignments } from "@iam/db/schema/core/role-assignments";
      void roleAssignments;
    `);
    const reconstructedTargetRule = collectArchitectureViolations("apps/oidc-provider/src/target.ts", `
      import { RoleAssignmentTargetType } from "@iam/contracts";
      import { organizationClosures } from "@iam/db/schema";
      void [RoleAssignmentTargetType.Organization, organizationClosures];
    `);

    expect(directImport).toEqual(["apps/api/src/direct.ts: role assignment table"]);
    expect(relationalQuery).toEqual(["apps/api/src/query.ts: role assignment table"]);
    expect(deepImport).toEqual(["apps/api/src/deep.ts: role assignment table"]);
    expect(reconstructedTargetRule).toEqual([
      "apps/oidc-provider/src/target.ts: role assignment target type",
    ]);
  });

  test("allows closure-only queries and only explicit role-management operations", () => {
    const closureOnly = collectArchitectureViolations("apps/api/src/organization-path.ts", `
      import { organizationClosures } from "@iam/db/schema";
      void organizationClosures;
    `);
    const roleRepositoryWithClosure = collectArchitectureViolations(
      "apps/admin-api/src/services/role/role.repository.ts",
      `
        function createRoleRepository() {
          return { async searchAssignmentsPaged() { return [roleAssignments, organizationClosures]; } };
        }
      `,
    );
    const roleRepositoryWithExtraOperation = collectArchitectureViolations(
      "apps/admin-api/src/services/role/role.repository.ts",
      `
        function createRoleRepository() {
          return { async getRolesByEmploymentId() { return roleAssignments; } };
        }
      `,
    );
    const arrowRoleRepository = collectArchitectureViolations(
      "apps/admin-api/src/services/role/role.repository.ts",
      `
        const createRoleRepository = () => ({
          searchAssignmentsPaged: async () => roleAssignments,
        });
      `,
    );
    const indirectRoleRepository = collectArchitectureViolations(
      "apps/admin-api/src/services/role/role.repository.ts",
      `
        function createRoleRepository() {
          const repository = { async searchAssignmentsPaged() { return roleAssignments; } };
          return repository;
        }
      `,
    );
    const propertyRoleRepository = collectArchitectureViolations(
      "apps/admin-api/src/services/role/role.repository.ts",
      `
        function createRoleRepository() {
          return { searchAssignmentsPaged: async () => roleAssignments };
        }
      `,
    );

    expect(closureOnly).toEqual([]);
    expect(isApprovedKnowledgeOwner(
      "apps/admin-api/src/services/role/role.repository.ts",
      "role assignment table",
    )).toBe(true);
    expect(isApprovedKnowledgeOwner(
      "apps/admin-api/src/services/role/role.service.ts",
      "role assignment target type",
    )).toBe(true);
    expect(isApprovedKnowledgeOwner(
      "apps/oidc-provider/src/repositories/authorization.repository.ts",
      "role assignment target type",
    )).toBe(false);
    expect(roleRepositoryWithClosure).toEqual([
      "apps/admin-api/src/services/role/role.repository.ts: role management combines assignment access with organization closure",
    ]);
    expect(roleRepositoryWithExtraOperation).toEqual([
      "apps/admin-api/src/services/role/role.repository.ts: unapproved role repository operation getRolesByEmploymentId",
    ]);
    expect(arrowRoleRepository).toEqual([
      "apps/admin-api/src/services/role/role.repository.ts: unsupported role repository factory shape",
    ]);
    expect(indirectRoleRepository).toEqual([
      "apps/admin-api/src/services/role/role.repository.ts: unsupported role repository factory shape",
    ]);
    expect(propertyRoleRepository).toEqual([
      "apps/admin-api/src/services/role/role.repository.ts: unsupported role repository factory shape",
      "apps/admin-api/src/services/role/role.repository.ts: unsupported role repository property searchAssignmentsPaged",
    ]);
  });

  test("keeps the retired API role resolution chain deleted", () => {
    const existingLegacyFiles = retiredApiRoleResolutionFiles.filter(file =>
      existsSync(join(workspaceRoot, file)));

    expect(existingLegacyFiles).toEqual([]);
  });

  test("keeps Docker build contexts closed over resolver workspace dependencies", () => {
    const missingInputs = Object.entries(requiredDockerWorkspacePackages).flatMap(([file, packageRoots]) => {
      const copySources = collectDockerCopySources(readFileSync(join(workspaceRoot, file), "utf8"));
      const requiredSources = packageRoots.flatMap(packageRoot => [
        `${packageRoot}/package.json`,
        `${packageRoot}/`,
      ]);

      return requiredSources.filter(source => !copySources.has(source)).map(source => `${file}: ${source}`);
    });

    expect(missingInputs).toEqual([]);
  });
});
