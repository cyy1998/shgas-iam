import type { AuditLogVo } from '@admin/services/audit';

export const auditActionLabels: Record<string, string> = {
  'auth.login.success': '登录成功',
  'auth.login.password.success': '密码登录成功',
  'auth.login.password.failure': '密码登录失败',
  'auth.login.mobile.success': '手机登录成功',
  'auth.login.mobile.failure': '手机登录失败',
  'auth.login.oa.success': 'OA 登录成功',
  'auth.login.wechat.success': '微信登录成功',
  'auth.login.local.success': '本地会话登录',
  'auth.sms_code.send': '发送验证码',
  'auth.sms_code.verify': '校验验证码',
  'auth.password.reset': '重置密码',
  'self.password.change': '自助改密',
  'self.mobile.bind': '绑定手机号',
  'admin.user.create': '创建用户',
  'admin.user.update': '更新用户',
  'admin.user.status_update': '更新用户状态',
  'admin.user.delete': '删除用户',
  'admin.user.reset_password': '管理员重置密码',
  'admin.client.create': '创建应用',
  'admin.client.update': '更新应用',
  'admin.client.status_update': '更新应用状态',
  'admin.client.delete': '删除应用',
  'admin.client.rotate_secret': '轮换应用密钥',
  'admin.organization.create': '创建组织',
  'admin.organization.update': '更新组织',
  'admin.organization.status_update': '更新组织状态',
  'admin.organization.delete': '删除组织',
  'admin.position.create': '创建职位',
  'admin.position.update': '更新职位',
  'admin.position.status_update': '更新职位状态',
  'admin.position.delete': '删除职位',
  'admin.employment.create': '创建任职',
  'admin.employment.update': '更新任职',
  'admin.employment.status_update': '更新任职状态',
  'admin.employment.delete': '删除任职',
  'admin.employment.transfer': '转岗',
  'admin.employment.set_primary': '设置主岗',
  'admin.employment.resign_user': '办理离职',
  'internal.delegation.create': '创建权限委派',
  'internal.delegation.update': '更新权限委派',
  'internal.purveyor.register': '注册供应商组织',
  'internal.purveyor_contact.register': '注册供应商联系人',
};

export const auditActionOptions = Object.entries(auditActionLabels).map(
  ([value, label]) => ({ label, value }),
);

export const actorTypeLabels: Record<string, string> = {
  admin: '管理员',
  user: '用户',
  client: '客户端',
  system: '系统',
  anonymous: '匿名',
};

export const targetTypeLabels: Record<string, string> = {
  user: '用户',
  employment: '任职',
  organization: '组织',
  position: '职位',
  client: '应用',
  delegation: '权限委派',
  mobile: '手机号',
};

export const outcomeLabels: Record<string, string> = {
  success: '成功',
  failure: '失败',
};

function getDetails(row: AuditLogVo) {
  return (row.details ?? {}) as Record<string, unknown>;
}

function readString(details: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function getActionLabel(action: string) {
  return auditActionLabels[action] ?? action;
}

export function getActorCode(row: AuditLogVo) {
  if (row.actorUsername) return row.actorUsername;
  if (row.actorUserId) return `#${row.actorUserId}`;
  if (row.actorClientCode) return row.actorClientCode;
  if (row.actorSystemKey) return row.actorSystemKey;
  return '—';
}

export function getActorDisplay(row: AuditLogVo) {
  const details = getDetails(row);
  return {
    code: getActorCode(row),
    name: readString(details, ['actorName']),
    typeLabel: actorTypeLabels[row.actorType] ?? row.actorType,
  };
}

export function getTargetCode(row: AuditLogVo) {
  if (row.targetCode) return row.targetCode;
  if (row.targetId) return `#${row.targetId}`;
  return '—';
}

export function getTargetDisplay(row: AuditLogVo) {
  const details = getDetails(row);
  return {
    code: getTargetCode(row),
    name: readString(details, [
      'targetName',
      'userName',
      'clientName',
      'orgName',
      'posName',
      'purveyorName',
      'contactName',
    ]),
    typeLabel: targetTypeLabels[row.targetType] ?? row.targetType,
  };
}
