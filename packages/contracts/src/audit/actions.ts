export const auditActionCatalog = [
  {
    action: "auth.login",
    label: "登录",
    legacyAliases: ["auth.login.success"],
  },
  {
    action: "auth.login.password",
    label: "密码登录",
    legacyAliases: ["auth.login.password.success", "auth.login.password.failure"],
  },
  {
    action: "auth.login.mobile",
    label: "手机登录",
    legacyAliases: ["auth.login.mobile.success", "auth.login.mobile.failure"],
  },
  {
    action: "auth.login.local",
    label: "本地会话登录",
    legacyAliases: ["auth.login.local.success"],
  },
  {
    action: "auth.login.oa",
    label: "OA 登录",
    legacyAliases: ["auth.login.oa.success"],
  },
  {
    action: "auth.login.wechat",
    label: "微信登录",
    legacyAliases: ["auth.login.wechat.success"],
  },
  {
    action: "auth.sms_code.send",
    label: "发送验证码",
    legacyAliases: [],
  },
  {
    action: "auth.sms_code.verify",
    label: "校验验证码",
    legacyAliases: [],
  },
  {
    action: "auth.password.reset",
    label: "重置密码",
    legacyAliases: [],
  },
  {
    action: "self.password.change",
    label: "自助改密",
    legacyAliases: [],
  },
  {
    action: "self.mobile.bind",
    label: "绑定手机号",
    legacyAliases: [],
  },
  {
    action: "admin.user.create",
    label: "创建用户",
    legacyAliases: [],
  },
  {
    action: "admin.user.update",
    label: "更新用户",
    legacyAliases: [],
  },
  {
    action: "admin.user.status_update",
    label: "更新用户状态",
    legacyAliases: [],
  },
  {
    action: "admin.user.delete",
    label: "删除用户",
    legacyAliases: [],
  },
  {
    action: "admin.user.reset_password",
    label: "管理员重置密码",
    legacyAliases: [],
  },
  {
    action: "admin.client.create",
    label: "创建应用",
    legacyAliases: [],
  },
  {
    action: "admin.client.update",
    label: "更新应用",
    legacyAliases: [],
  },
  {
    action: "admin.client.status_update",
    label: "更新应用状态",
    legacyAliases: [],
  },
  {
    action: "admin.client.delete",
    label: "删除应用",
    legacyAliases: [],
  },
  {
    action: "admin.client.rotate_secret",
    label: "轮换应用密钥",
    legacyAliases: [],
  },
  {
    action: "admin.client.oidc.configure",
    label: "配置 OIDC",
    legacyAliases: [],
  },
  {
    action: "admin.client.oidc.enable",
    label: "启用 OIDC",
    legacyAliases: [],
  },
  {
    action: "admin.client.oidc.disable",
    label: "禁用 OIDC",
    legacyAliases: [],
  },
  {
    action: "admin.client.oidc.remove",
    label: "移除 OIDC",
    legacyAliases: [],
  },
  {
    action: "admin.client.oidc.rotate_secret",
    label: "轮换 OIDC 密钥",
    legacyAliases: [],
  },
  {
    action: "admin.organization.create",
    label: "创建组织",
    legacyAliases: [],
  },
  {
    action: "admin.organization.update",
    label: "更新组织",
    legacyAliases: [],
  },
  {
    action: "admin.organization.status_update",
    label: "更新组织状态",
    legacyAliases: [],
  },
  {
    action: "admin.organization.delete",
    label: "删除组织",
    legacyAliases: [],
  },
  {
    action: "admin.position.create",
    label: "创建职位",
    legacyAliases: [],
  },
  {
    action: "admin.position.update",
    label: "更新职位",
    legacyAliases: [],
  },
  {
    action: "admin.position.status_update",
    label: "更新职位状态",
    legacyAliases: [],
  },
  {
    action: "admin.position.delete",
    label: "删除职位",
    legacyAliases: [],
  },
  {
    action: "admin.employment.create",
    label: "创建任职",
    legacyAliases: [],
  },
  {
    action: "admin.employment.update",
    label: "更新任职",
    legacyAliases: [],
  },
  {
    action: "admin.employment.status_update",
    label: "更新任职状态",
    legacyAliases: [],
  },
  {
    action: "admin.employment.delete",
    label: "删除任职",
    legacyAliases: [],
  },
  {
    action: "admin.employment.transfer",
    label: "转岗",
    legacyAliases: [],
  },
  {
    action: "admin.employment.set_primary",
    label: "设置主岗",
    legacyAliases: [],
  },
  {
    action: "admin.employment.resign_user",
    label: "办理离职",
    legacyAliases: [],
  },
  {
    action: "internal.delegation.create",
    label: "创建权限委派",
    legacyAliases: [],
  },
  {
    action: "internal.delegation.update",
    label: "更新权限委派",
    legacyAliases: [],
  },
  {
    action: "internal.purveyor.register",
    label: "注册供应商组织",
    legacyAliases: [],
  },
  {
    action: "internal.purveyor_contact.register",
    label: "注册供应商联系人",
    legacyAliases: [],
  },
] as const;

type AuditActionCatalogItem = typeof auditActionCatalog[number];
type LegacyAliasOf<T> = T extends { readonly legacyAliases: readonly (infer Alias)[] } ? Alias : never;

export type CanonicalAuditAction = AuditActionCatalogItem["action"];
export type LegacyAuditActionAlias = LegacyAliasOf<AuditActionCatalogItem>;
export type KnownAuditAction = CanonicalAuditAction | LegacyAuditActionAlias;

export const AuditActions = Object.fromEntries(
  auditActionCatalog.map(item => [item.action, item.action]),
) as { readonly [Action in CanonicalAuditAction]: Action };

export type AuditActionOption = {
  label: string;
  value: CanonicalAuditAction;
};

export const auditActionLabels = Object.fromEntries(
  auditActionCatalog.map(item => [item.action, item.label]),
) as Record<CanonicalAuditAction, string>;

export const auditActionLegacyAliases = Object.fromEntries(
  auditActionCatalog
    .filter(item => item.legacyAliases.length > 0)
    .map(item => [item.action, item.legacyAliases]),
) as Partial<Record<CanonicalAuditAction, readonly LegacyAuditActionAlias[]>>;

export const legacyAuditActionToCanonical = Object.fromEntries(
  auditActionCatalog.flatMap(item => item.legacyAliases.map(alias => [alias, item.action])),
) as Partial<Record<LegacyAuditActionAlias, CanonicalAuditAction>>;

export const auditActionOptions: AuditActionOption[] = auditActionCatalog.map(item => ({
  label: item.label,
  value: item.action,
}));

export function canonicalizeAuditAction(action: string): string {
  return legacyAuditActionToCanonical[action as LegacyAuditActionAlias] ?? action;
}

export function getAuditActionLabel(action: string): string {
  const canonicalAction = canonicalizeAuditAction(action);
  return auditActionLabels[canonicalAction as CanonicalAuditAction] ?? action;
}

export function expandAuditActionAliases(actions: readonly string[]): string[] {
  return Array.from(new Set(actions.flatMap((action) => {
    const canonicalAction = canonicalizeAuditAction(action);
    const aliases = auditActionLegacyAliases[canonicalAction as CanonicalAuditAction] ?? [];
    return [canonicalAction, ...aliases];
  })));
}
