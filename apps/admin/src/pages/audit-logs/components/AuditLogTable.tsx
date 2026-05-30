import type {
  AuditLogSearchConditions,
  AuditLogVo,
} from '@admin/services/audit';
import { searchAuditLogs } from '@admin/services/audit';
import type { ProColumns } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Checkbox, message, Select, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import AuditLogDetailDrawer from './AuditLogDetailDrawer';
import {
  actorTypeLabels,
  auditActionOptions,
  getActionLabel,
  getActorDisplay,
  getTargetDisplay,
  outcomeLabels,
  targetTypeLabels,
} from './auditLogDisplay';

type AuditLogTableRow = AuditLogVo & {
  actorKeyword?: string;
  actions?: string[];
  eventTimeRange?: [string, string];
  targetKeyword?: string;
};

const actorTypeValueEnum: Record<string, { text: string }> = {
  admin: { text: actorTypeLabels.admin },
  user: { text: actorTypeLabels.user },
  client: { text: actorTypeLabels.client },
  system: { text: actorTypeLabels.system },
  anonymous: { text: actorTypeLabels.anonymous },
};

const outcomeValueEnum: Record<string, { status: string; text: string }> = {
  success: { text: outcomeLabels.success, status: 'Success' },
  failure: { text: outcomeLabels.failure, status: 'Error' },
};

const targetTypeValueEnum: Record<string, { text: string }> = {
  user: { text: targetTypeLabels.user },
  employment: { text: targetTypeLabels.employment },
  organization: { text: targetTypeLabels.organization },
  position: { text: targetTypeLabels.position },
  client: { text: targetTypeLabels.client },
  delegation: { text: targetTypeLabels.delegation },
  mobile: { text: targetTypeLabels.mobile },
};

function trimValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function compactConditions(
  conditions: Partial<AuditLogSearchConditions>,
): AuditLogSearchConditions {
  return Object.fromEntries(
    Object.entries(conditions).filter(([, value]) => value !== undefined),
  ) as AuditLogSearchConditions;
}

function formatDate(value: AuditLogVo['eventTime']) {
  return value ? new Date(value).toLocaleString() : '—';
}

function renderActor(row: AuditLogVo) {
  const actor = getActorDisplay(row);
  return (
    <Space size={6} wrap>
      <Tag>{actor.typeLabel}</Tag>
      <Space direction="vertical" size={0}>
        <Typography.Text style={{ wordBreak: 'break-all' }}>
          {actor.name ?? actor.code}
        </Typography.Text>
        {actor.name && actor.code !== actor.name ? (
          <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>
            {actor.code}
          </Typography.Text>
        ) : null}
      </Space>
    </Space>
  );
}

function renderTarget(row: AuditLogVo) {
  const target = getTargetDisplay(row);
  return (
    <Space size={6} wrap>
      <Tag>{target.typeLabel}</Tag>
      <Space direction="vertical" size={0}>
        <Typography.Text style={{ wordBreak: 'break-all' }}>
          {target.name ?? target.code}
        </Typography.Text>
        {target.name && target.code !== target.name ? (
          <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>
            {target.code}
          </Typography.Text>
        ) : null}
      </Space>
    </Space>
  );
}

function buildConditions(
  params: Record<string, unknown>,
  fixedConditions: Partial<AuditLogSearchConditions>,
) {
  const range = params.eventTimeRange;
  const [from, to] = Array.isArray(range) ? range : [];
  const actions = Array.isArray(params.actions)
    ? params.actions.filter(
        (value): value is string => typeof value === 'string',
      )
    : undefined;

  return compactConditions({
    actions: actions && actions.length > 0 ? actions : undefined,
    outcome: trimValue(params.outcome) as AuditLogSearchConditions['outcome'],
    actorType: trimValue(
      params.actorType,
    ) as AuditLogSearchConditions['actorType'],
    actorKeyword: trimValue(params.actorKeyword),
    targetType: trimValue(
      params.targetType,
    ) as AuditLogSearchConditions['targetType'],
    targetKeyword: trimValue(params.targetKeyword),
    requestId: trimValue(params.requestId),
    eventTimeFrom: from ? new Date(String(from)) : undefined,
    eventTimeTo: to ? new Date(String(to)) : undefined,
    ...fixedConditions,
  });
}

type Props = {
  fixedConditions?: Partial<AuditLogSearchConditions>;
  pageSize?: number;
  search?: boolean;
  size?: 'small' | 'middle' | 'large';
};

export default function AuditLogTable({
  fixedConditions = {},
  pageSize = 20,
  search = true,
  size,
}: Props) {
  const [selectedLog, setSelectedLog] = useState<AuditLogVo | null>(null);

  const columns: ProColumns<AuditLogTableRow>[] = [
    {
      title: '时间范围',
      dataIndex: 'eventTimeRange',
      valueType: 'dateTimeRange',
      hideInTable: true,
      hideInSearch: !search,
    },
    {
      title: '动作',
      dataIndex: 'actions',
      hideInTable: true,
      hideInSearch: !search,
      renderFormItem: () => (
        <Select
          allowClear
          showSearch
          mode="multiple"
          options={auditActionOptions}
          placeholder="请选择动作"
          maxTagCount="responsive"
          optionFilterProp="label"
          menuItemSelectedIcon={({ isSelected }) => (
            <Checkbox checked={isSelected} style={{ pointerEvents: 'none' }} />
          )}
        />
      ),
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: 240,
      search: false,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{getActionLabel(row.action)}</Typography.Text>
          <Typography.Text
            code
            type="secondary"
            style={{ whiteSpace: 'normal' }}
          >
            {row.action}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '结果',
      dataIndex: 'outcome',
      width: 90,
      valueType: 'select',
      valueEnum: outcomeValueEnum,
      render: (_, row) => (
        <Tag color={row.outcome === 'success' ? 'green' : 'red'}>
          {outcomeValueEnum[row.outcome]?.text ?? row.outcome}
        </Tag>
      ),
    },
    {
      title: '操作者',
      dataIndex: 'actorKeyword',
      hideInTable: true,
      hideInSearch: !search,
      fieldProps: { placeholder: '用户名 / client / system' },
    },
    {
      title: 'Actor 类型',
      dataIndex: 'actorType',
      hideInTable: true,
      hideInSearch: !search,
      valueType: 'select',
      valueEnum: actorTypeValueEnum,
    },
    {
      title: '操作者',
      key: 'actor',
      width: 180,
      search: false,
      render: (_, row) => renderActor(row),
    },
    {
      title: '目标对象',
      dataIndex: 'targetKeyword',
      hideInTable: true,
      hideInSearch: !search,
      fieldProps: { placeholder: '目标编码 / ID' },
    },
    {
      title: '目标类型',
      dataIndex: 'targetType',
      hideInTable: true,
      hideInSearch: !search,
      valueType: 'select',
      valueEnum: targetTypeValueEnum,
    },
    {
      title: '目标对象',
      key: 'target',
      width: 180,
      search: false,
      render: (_, row) => renderTarget(row),
    },
    {
      title: '来源',
      dataIndex: 'sourceApp',
      width: 110,
      search: false,
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 140,
      search: false,
      render: (_, row) => row.ip ?? '—',
    },
    {
      title: 'Request ID',
      dataIndex: 'requestId',
      width: 180,
      render: (_, row) =>
        row.requestId ? (
          <Typography.Text code ellipsis copyable>
            {row.requestId}
          </Typography.Text>
        ) : (
          '—'
        ),
    },
    {
      title: '时间',
      dataIndex: 'eventTime',
      width: 170,
      search: false,
      render: (_, row) => formatDate(row.eventTime),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 80,
      render: (_, row) => [
        <a key="detail" onClick={() => setSelectedLog(row)}>
          详情
        </a>,
      ],
    },
  ];

  return (
    <>
      <ProTable<AuditLogTableRow>
        rowKey="id"
        size={size}
        columns={columns}
        search={search ? { labelWidth: 'auto' } : false}
        options={search ? undefined : false}
        pagination={{ defaultPageSize: pageSize, showSizeChanger: search }}
        request={async (params) => {
          try {
            const data = await searchAuditLogs({
              pageNum: params.current ?? 1,
              pageSize: params.pageSize ?? pageSize,
              conditions: buildConditions(
                params as Record<string, unknown>,
                fixedConditions,
              ),
            });
            return {
              data: data.result,
              total: data.total,
              success: true,
            };
          } catch (err) {
            message.error(err instanceof Error ? err.message : '加载日志失败');
            return { data: [], total: 0, success: false };
          }
        }}
        scroll={{ x: 1180 }}
        locale={{ emptyText: '暂无审计日志' }}
      />

      <AuditLogDetailDrawer
        open={selectedLog !== null}
        auditLog={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </>
  );
}
