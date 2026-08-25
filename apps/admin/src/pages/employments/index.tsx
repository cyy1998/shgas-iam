import OrganizationTreeSelector from '@admin/components/OrganizationTreeSelector';
import StatusTag from '@admin/components/StatusTag';
import EmploymentDetailDrawer from '@admin/pages/employments/components/EmploymentDetailDrawer';
import EmploymentFormModal from '@admin/pages/employments/components/EmploymentFormModal';
import {
  type EmploymentVo,
  searchEmployments,
} from '@admin/services/employment';
import {
  type ActionType,
  PageContainer,
  type ProColumns,
  type ProFormInstance,
  ProTable,
} from '@ant-design/pro-components';
import { EmploymentStatus, getEmploymentStatusOptions } from '@iam/contracts';
import { useAccess, useLocation } from '@umijs/max';
import { Button, message, Space, Tag } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

type PresetFromUrl = {
  username?: string;
  name?: string;
  employmentId?: number;
};

function parseQuery(search: string): PresetFromUrl {
  const params = new URLSearchParams(search);
  const username = params.get('username');
  const name = params.get('name');
  const employmentId = Number(params.get('employmentId'));
  return {
    ...(username ? { username, name: name ?? undefined } : {}),
    ...(Number.isInteger(employmentId) && employmentId > 0
      ? { employmentId }
      : {}),
  };
}

function formatOrgPath(row: EmploymentVo) {
  const path = row.organization?.fullOrgPath
    ?.map((node) => node.orgName)
    .join(' / ');
  return path || row.organization?.assignedOrg?.orgName || '—';
}

function formatUser(row: EmploymentVo) {
  return `${row.user.name} (${row.user.username})`;
}

function formatPosition(row: EmploymentVo) {
  return `${row.position.posName} (${row.position.posCode})`;
}

export default function EmploymentsPage() {
  const access = useAccess();
  const actionRef = useRef<ActionType>(undefined);
  const searchFormRef = useRef<ProFormInstance>(undefined);
  const location = useLocation();

  const [formOpen, setFormOpen] = useState(false);
  const [formPresetUsername, setFormPresetUsername] = useState<string | null>(
    null,
  );
  const [formPresetName, setFormPresetName] = useState<string | null>(null);
  const [formPresetOrgCode, setFormPresetOrgCode] = useState<string | null>(
    null,
  );
  const [drawerId, setDrawerId] = useState<number | null>(null);

  const getSearchOrgCode = useCallback(() => {
    const value = searchFormRef.current?.getFieldValue('organizationOrgCode');
    return typeof value === 'string' && value ? value : null;
  }, []);

  // URL presets open either Employment detail or the create modal.
  useEffect(() => {
    const preset = parseQuery(location.search);
    // The route query is an external navigation source. Hydrate its UI snapshot
    // together so the requested destination opens consistently.
    /* eslint-disable react/set-state-in-effect */
    if (preset.employmentId && access.canAccessEmployment) {
      setDrawerId(preset.employmentId);
    }
    if (preset.username && access.canCreateEmployment) {
      setFormPresetUsername(preset.username);
      setFormPresetName(preset.name ?? null);
      setFormPresetOrgCode(getSearchOrgCode());
      setFormOpen(true);
    }
    /* eslint-enable react/set-state-in-effect */
  }, [
    access.canAccessEmployment,
    access.canCreateEmployment,
    getSearchOrgCode,
    location.search,
  ]);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '操作失败');

  const columns: ProColumns<EmploymentVo>[] = [
    {
      title: '用户',
      dataIndex: 'name',
      render: (_, r) => formatUser(r),
      width: 160,
      fieldProps: { placeholder: '工号或姓名' },
    },
    {
      title: '组织',
      dataIndex: 'organizationOrgCode',
      hideInTable: true,
      formItemRender: () => (
        <OrganizationTreeSelector placeholder="请选择组织范围" />
      ),
    },
    {
      title: '组织路径',
      dataIndex: ['organization', 'assignedOrg', 'orgName'],
      width: 260,
      search: false,
      render: (_, r) => formatOrgPath(r),
    },
    {
      title: '岗位',
      dataIndex: ['position', 'posName'],
      width: 140,
      search: false,
      render: (_, r) => formatPosition(r),
    },
    {
      title: '主岗',
      dataIndex: 'isPrimary',
      width: 80,
      valueEnum: {
        true: { text: '是' },
        false: { text: '否' },
      },
      render: (_, r) => (r.isPrimary ? <Tag color="blue">主岗</Tag> : null),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      valueType: 'select',
      valueEnum: Object.fromEntries(
        getEmploymentStatusOptions().map((o) => [o.value, { text: o.label }]),
      ),
      render: (_, r) => <StatusTag domain="employment" status={r.status} />,
    },
    {
      title: '起止时间',
      dataIndex: 'startTime',
      width: 200,
      search: false,
      render: (_, r) => (
        <span>
          {new Date(r.startTime).toLocaleDateString()}
          {' ~ '}
          {r.endTime ? new Date(r.endTime).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 80,
      render: (_, row) => [
        <a key="view" onClick={() => setDrawerId(row.id)}>
          查看
        </a>,
      ],
    },
  ];

  return (
    <PageContainer title="雇佣关系">
      <ProTable<EmploymentVo>
        actionRef={actionRef}
        formRef={searchFormRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: 'auto' }}
        scroll={{ x: 1200 }}
        request={async (params) => {
          try {
            const {
              current = 1,
              pageSize = 20,
              name,
              status,
              isPrimary,
              organizationOrgCode,
            } = params as {
              current?: number;
              pageSize?: number;
              name?: string;
              status?: string | number;
              isPrimary?: 'true' | 'false' | boolean;
              organizationOrgCode?: string;
            };
            const text = (name ?? '').trim();
            const statusNum =
              status === undefined || status === null || status === ''
                ? undefined
                : (Number(status) as EmploymentStatus);
            const isPrimaryBool =
              isPrimary === undefined
                ? undefined
                : typeof isPrimary === 'boolean'
                  ? isPrimary
                  : isPrimary === 'true';
            const data = await searchEmployments({
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { text } : {},
                exactConditions: {
                  statuses:
                    statusNum !== undefined
                      ? [statusNum]
                      : [EmploymentStatus.Enable, EmploymentStatus.Pause],
                  isPrimary: isPrimaryBool,
                  organization: organizationOrgCode
                    ? { orgCodes: [organizationOrgCode], matchMode: 'subtree' }
                    : undefined,
                },
              },
            });
            return {
              data: data.result,
              total: data.total,
              success: true,
            };
          } catch (err) {
            handleError(err);
            return { data: [], total: 0, success: false };
          }
        }}
        toolBarRender={() => [
          <Space key="toolbar">
            {access.canCreateEmployment && (
              <Button
                type="primary"
                onClick={() => {
                  setFormPresetUsername(null);
                  setFormPresetOrgCode(getSearchOrgCode());
                  setFormOpen(true);
                }}
              >
                + 新增雇佣
              </Button>
            )}
          </Space>,
        ]}
      />

      <EmploymentFormModal
        open={formOpen}
        presetUsername={formPresetUsername}
        presetName={formPresetName}
        presetOrgCode={formPresetOrgCode}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setFormPresetUsername(null);
            setFormPresetName(null);
            setFormPresetOrgCode(null);
          }
        }}
        onSuccess={() => {
          setFormOpen(false);
          setFormPresetUsername(null);
          setFormPresetName(null);
          setFormPresetOrgCode(null);
          actionRef.current?.reload();
        }}
      />

      <EmploymentDetailDrawer
        open={drawerId !== null}
        employmentId={drawerId}
        onClose={() => setDrawerId(null)}
        onChanged={() => actionRef.current?.reload()}
      />
    </PageContainer>
  );
}
