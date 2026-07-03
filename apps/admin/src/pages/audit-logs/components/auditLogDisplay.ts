import type { AuditLogVo } from '@admin/services/audit';
import {
  auditActionOptions as sharedAuditActionOptions,
  getAuditActionLabel,
} from '@iam/contracts';

export const auditActionOptions = sharedAuditActionOptions;

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
  role: '角色',
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
  return getAuditActionLabel(action);
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
      'roleName',
      'orgName',
      'posName',
      'purveyorName',
      'contactName',
    ]),
    typeLabel: targetTypeLabels[row.targetType] ?? row.targetType,
  };
}
