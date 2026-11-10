export enum RoleType {
  Client = "client",
  Global = "global",
}

export const GLOBAL_ROLE_NAMESPACE = "global";
export const GLOBAL_ROLE_PREFIX = `${GLOBAL_ROLE_NAMESPACE}:`;

export const roleTypeToString: Record<RoleType, string> = {
  [RoleType.Client]: "应用角色",
  [RoleType.Global]: "全局角色",
};

export const roleTypeOptions = Object.values(RoleType).map((value) => ({ label: roleTypeToString[value], value }));

export function isGlobalRoleCode(code: string) {
  return code.startsWith(GLOBAL_ROLE_PREFIX) && code.slice(GLOBAL_ROLE_PREFIX.length).trim().length > 0;
}
