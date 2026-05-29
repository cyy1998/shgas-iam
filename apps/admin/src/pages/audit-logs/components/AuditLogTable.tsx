import type {
  AuditLogSearchConditions,
  AuditLogVo,
} from '@admin/services/audit';
import { searchAuditLogs } from '@admin/services/audit';
import type { ProColumns } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { message, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import AuditLogDetailDrawer from './AuditLogDetailDrawer';

type AuditLogTableRow = AuditLogVo & {
  actorKeyword?: string;
  eventTimeRange?: [string, string];
  targetKeyword?: string;
};

const actorTypeValueEnum: Record<string, { text: string }> = {
  admin: { text: '管理员' },
  user: { text: '用户' },
  client: { text: '客户端' },
  system: { text: '系统' },
  anonymous: { text: '匿名' },
};

const outcomeValueEnum: Record<string, { status: string; text: string }> = {
  success: { text: '成功', status: 'Success' },
  failure: { text: '失败', status: 'Error' },
};

const targetTypeValueEnum: Record<string, { text: string }> = {
  user: { text: '用户' },
  employment: { text: '任职' },
  organization: { text: '组织' },
  position: { text: '岗位' },
  client: { text: '客户端' },
  delegation: { text: '权限委派' },
  mobile: { text: '手机号' },
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
  const text =
    row.actorUsername ??
    row.actorClientCode ??
    row.actorSystemKey ??
    (row.actorUserId ? `#${row.actorUserId}` : '—');
  return (
    <Space size={6} wrap>
      <Tag>{actorTypeValueEnum[row.actorType]?.text ?? row.actorType}</Tag>
      <Typography.Text style={{ wordBreak: 'break-all' }}>
        {text}
      </Typography.Text>
    </Space>
  );
}

function renderTarget(row: AuditLogVo) {
  const text = row.targetCode ?? (row.targetId ? `#${row.targetId}` : '—');
  return (
    <Space size={6} wrap>
      <Tag>{targetTypeValueEnum[row.targetType]?.text ?? row.targetType}</Tag>
      <Typography.Text style={{ wordBreak: 'break-all' }}>
        {text}
      </Typography.Text>
    </Space>
  );
}

function buildConditions(
  params: Record<string, unknown>,
  fixedConditions: Partial<AuditLogSearchConditions>,
) {
  const range = params.eventTimeRange;
  const [from, to] = Array.isArray(range) ? range : [];

  return compactConditions({
    action: trimValue(params.action),
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
      title: 'Action',
      dataIndex: 'action',
      width: 240,
      render: (_, row) => (
        <Typography.Text code style={{ whiteSpace: 'normal' }}>
          {row.action}
        </Typography.Text>
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
