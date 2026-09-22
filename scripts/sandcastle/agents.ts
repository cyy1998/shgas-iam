import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "smol-toml";

export const implementerNames = ["implementer_light", "implementer_standard", "implementer_deep"] as const;
export type ImplementerName = typeof implementerNames[number];
export const reviewerNames = ["standards_reviewer", "spec_reviewer"] as const;
export type RoleName = ImplementerName | typeof reviewerNames[number];
export type AgentRole = {
  name: RoleName;
  description: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh";
  instructions: string;
};
export type AgentRoles = Record<RoleName, AgentRole>;

export function isImplementer(value: unknown): value is ImplementerName {
  const names: readonly unknown[] = implementerNames;
  return names.includes(value);
}

export function parseAgentRole(source: string, name: RoleName): AgentRole {
  const role = parse(source);
  const effort = role.model_reasoning_effort;
  if (role.name !== name
    || typeof role.description !== "string" || !role.description.trim()
    || typeof role.model !== "string" || !role.model.trim()
    || typeof role.developer_instructions !== "string" || !role.developer_instructions.trim()
    || (effort !== "low" && effort !== "medium" && effort !== "high" && effort !== "xhigh")) {
    throw new Error(`无效的 AFK 角色配置：${name}`);
  }
  if (!isImplementer(name) && role.sandbox_mode !== "read-only")
    throw new Error(`AFK 评审角色必须为 read-only：${name}`);
  return { name, description: role.description, model: role.model, effort, instructions: role.developer_instructions };
}

export async function loadAgentRoles(cwd: string): Promise<AgentRoles> {
  const roles = await Promise.all([...implementerNames, ...reviewerNames].map(async (name) => {
    const source = await readFile(join(cwd, ".codex", "agents", `${name.replaceAll("_", "-")}.toml`), "utf8");
    return [name, parseAgentRole(source, name)] as const;
  }));
  return Object.fromEntries(roles) as AgentRoles;
}

export function implementerCatalog(roles: AgentRoles): string {
  return JSON.stringify(implementerNames.map((name) => {
    const { description, model, effort } = roles[name];
    return { name, description, model, effort };
  }));
}
