export enum RoleKind {
  Basic = "basic",
  Composite = "composite",
}

export const roleKindToString: Record<RoleKind, string> = {
  [RoleKind.Basic]: "基本角色",
  [RoleKind.Composite]: "组合角色",
};

export const roleKindOptions = Object.values(RoleKind).map((value) => ({ label: roleKindToString[value], value }));
