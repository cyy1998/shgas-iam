export const auditActionCatalog = [
  {
    action: "auth.login",
    label: "登录",
  },
  {
    action: "auth.login.password",
    label: "密码登录",
  },
  {
    action: "auth.login.mobile",
    label: "手机登录",
  },
  {
    action: "auth.login.local",
    label: "本地会话登录",
  },
  {
    action: "auth.login.oa",
    label: "OA 登录",
  },
  {
    action: "auth.login.wechat",
    label: "微信登录",
  },
  {
    action: "auth.sms_code.send",
    label: "发送验证码",
  },
  {
    action: "auth.sms_code.verify",
    label: "校验验证码",
  },
  {
    action: "auth.password.reset",
    label: "重置密码",
  },
  {
    action: "self.password.change",
    label: "自助改密",
  },
  {
    action: "self.mobile.bind",
    label: "绑定手机号",
  },
  {
    action: "admin.user.create",
    label: "创建用户",
  },
  {
    action: "admin.user.update",
    label: "更新用户",
  },
  {
    action: "admin.user.status_update",
    label: "更新用户状态",
  },
  {
    action: "admin.user.delete",
    label: "删除用户",
  },
  {
    action: "admin.user.reset_password",
    label: "管理员重置密码",
  },
  {
    action: "admin.session.revoke",
    label: "强制下线单个会话",
  },
  {
    action: "admin.session.revoke_user",
    label: "下线用户全部会话",
  },
  {
    action: "admin.login_restriction.release",
    label: "解除临时登录限制",
  },
  {
    action: "admin.client.create",
    label: "创建应用",
  },
  {
    action: "admin.client.update",
    label: "更新应用",
  },
  {
    action: "admin.client.status_update",
    label: "更新应用状态",
  },
  {
    action: "admin.client.delete",
    label: "删除应用",
  },
  {
    action: "admin.client.rotate_secret",
    label: "轮换应用密钥",
  },
  {
    action: "admin.client.oidc.configure",
    label: "配置 OIDC",
  },
  {
    action: "admin.client.oidc.enable",
    label: "启用 OIDC",
  },
  {
    action: "admin.client.oidc.disable",
    label: "禁用 OIDC",
  },
  {
    action: "admin.client.oidc.remove",
    label: "移除 OIDC",
  },
  {
    action: "admin.client.oidc.rotate_secret",
    label: "轮换 OIDC 密钥",
  },
  {
    action: "admin.client.custom_sso.configure",
    label: "配置 Custom SSO",
  },
  {
    action: "admin.client.custom_sso.enable",
    label: "启用 Custom SSO",
  },
  {
    action: "admin.client.custom_sso.disable",
    label: "禁用 Custom SSO",
  },
  {
    action: "admin.client.custom_sso.remove",
    label: "移除 Custom SSO",
  },
  {
    action: "admin.client.custom_sso.rotate_secret",
    label: "轮换 Custom SSO 密钥",
  },
  {
    action: "admin.organization.create",
    label: "创建组织",
  },
  {
    action: "admin.organization.update",
    label: "更新组织",
  },
  {
    action: "admin.organization.status_update",
    label: "更新组织状态",
  },
  {
    action: "admin.organization.delete",
    label: "删除组织",
  },
  {
    action: "admin.position.create",
    label: "创建职位",
  },
  {
    action: "admin.position.update",
    label: "更新职位",
  },
  {
    action: "admin.position.status_update",
    label: "更新职位状态",
  },
  {
    action: "admin.position.delete",
    label: "删除职位",
  },
  {
    action: "admin.employment.create",
    label: "创建任职",
  },
  {
    action: "admin.employment.update",
    label: "更新任职",
  },
  {
    action: "admin.employment.status_update",
    label: "更新任职状态",
  },
  {
    action: "admin.employment.delete",
    label: "删除任职",
  },
  {
    action: "admin.employment.transfer",
    label: "转岗",
  },
  {
    action: "admin.employment.set_primary",
    label: "设置主岗",
  },
  {
    action: "admin.employment.clear_primary",
    label: "取消主岗",
  },
  {
    action: "admin.employment.resign_user",
    label: "办理离职",
  },
  {
    action: "admin.organization_responsibility_assignment.create",
    label: "创建组织责任任命",
  },
  {
    action: "admin.organization_responsibility_assignment.pause",
    label: "暂停组织责任任命",
  },
  {
    action: "admin.organization_responsibility_assignment.resume",
    label: "恢复组织责任任命",
  },
  {
    action: "admin.organization_responsibility_assignment.end",
    label: "结束组织责任任命",
  },
  {
    action: "internal.delegation.create",
    label: "创建权限委派",
  },
  {
    action: "internal.delegation.update",
    label: "更新权限委派",
  },
  {
    action: "internal.purveyor.register",
    label: "注册供应商组织",
  },
  {
    action: "internal.purveyor_contact.register",
    label: "注册供应商联系人",
  },
] as const;

type AuditActionCatalogItem = (typeof auditActionCatalog)[number];
export type CanonicalAuditAction = AuditActionCatalogItem["action"];

export const AuditActions = Object.fromEntries(
  auditActionCatalog.map(item => [item.action, item.action]),
) as { readonly [Action in CanonicalAuditAction]: Action };

export const ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS = {
  create: AuditActions["admin.organization_responsibility_assignment.create"],
  pause: AuditActions["admin.organization_responsibility_assignment.pause"],
  resume: AuditActions["admin.organization_responsibility_assignment.resume"],
  end: AuditActions["admin.organization_responsibility_assignment.end"],
} as const;

export interface AuditActionOption {
  label: string;
  value: CanonicalAuditAction;
}

export const auditActionLabels = Object.fromEntries(
  auditActionCatalog.map(item => [item.action, item.label]),
) as Record<CanonicalAuditAction, string>;

export const auditActionOptions: AuditActionOption[] = auditActionCatalog.map(
  item => ({
    label: item.label,
    value: item.action,
  }),
);

export function getAuditActionLabel(action: string): string {
  return Object.hasOwn(auditActionLabels, action)
    ? auditActionLabels[action as CanonicalAuditAction]
    : action;
}
