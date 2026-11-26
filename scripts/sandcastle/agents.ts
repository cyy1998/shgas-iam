import { type AgentRoles, implementerNames } from "./adapters/codex-roles.ts";

export {
  type AgentRole,
  type AgentRoles,
  type ImplementerName,
  implementerNames,
  isImplementer,
  loadAgentRoles,
  parseAgentRole,
  type RoleName,
  researcherNames,
  reviewerNames,
} from "./adapters/codex-roles.ts";

export function implementerCatalog(roles: AgentRoles): string {
  return JSON.stringify(
    implementerNames.map((name) => {
      const { description, model, effort } = roles[name];
      return { name, description, model, effort };
    }),
  );
}
