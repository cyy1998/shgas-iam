import OrganizationTreeSelector from '@admin/components/OrganizationTreeSelector';
import StatusTag from '@admin/components/StatusTag';
import EmploymentDetailDrawer from '@admin/pages/employments/components/EmploymentDetailDrawer';
import EmploymentFormModal from '@admin/pages/employments/components/EmploymentFormModal';
import ResignByUserDialog from '@admin/pages/employments/components/ResignByUserModal';
import TransferModal from '@admin/pages/employments/components/TransferModal';
import {
  deleteEmployment,
  type EmploymentVo,
  searchEmployments,
  setPrimaryEmployment,
  updateEmploymentStatus,
} from '@admin/services/employment';
import {
  type ActionType,
  PageContainer,
  type ProColumns,
  type ProFormInstance,
  ProTable,
} from '@ant-design/pro-components';
import { getEmploymentStatusOptions } from '@iam/contracts';
import { useLocation } from '@umijs/max';
import { Button, Dropdown, message, Modal, Space, Tag } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

type PresetFromUrl = { username?: string; name?: string };

function parseQuery(search: string): PresetFromUrl {
  const params = new URLSearchParams(search);
  const username = params.get('username');
  const name = params.get('name');
  return username ? { username, name: name ?? undefined } : {};
}

function formatOrgPath(row: EmploymentVo) {
  const path = row.organization?.fullOrgPath
    ?.map((node) => node.orgName)
    .join(' / ');
  return path || row.orgName || '—';
}

export default function EmploymentsPage() {
  const actionRef = useRef<ActionType>();
  const searchFormRef = useRef<ProFormInstance>();
  const location = useLocation();

  const [formOpen, setFormOpen] = useState(false);
  const [formPresetUsername, setFormPresetUsername] = useState<string | null>(
    null,
  );
  const [formPresetName, setFormPresetName] = useState<string | null>(null);
  const [formPresetOrgCode, setFormPresetOrgCode] = useState<string | null>(
    null,
  );
  const [transferTarget, setTransferTarget] = useState<EmploymentVo | null>(
    null,
  );
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [resignOpen, setResignOpen] = useState(false);

  const getSearchOrgCode = useCallback(() => {
    const value = searchFormRef.current?.getFieldValue('organizationOrgCode');
    return typeof value === 'string' && value ? value : null;
  }, []);

  // URL ?username=xxx → 自动打开新增 Modal
  useEffect(() => {
    const preset = parseQuery(location.search);
    if (preset.username) {
      setFormPresetUsername(preset.username);
      setFormPresetName(preset.name ?? null);
      setFormPresetOrgCode(getSearchOrgCode());
      setFormOpen(true);
    }
  }, [getSearchOrgCode, location.search]);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '操作失败');

  const onDelete = (row: EmploymentVo) => {
    Modal.confirm({
      title: `删除雇佣 ${row.name} / ${row.posName}？`,
      content: '软删除后该雇佣记录不再可见。',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteEmployment(row.id);
          message.success('已删除');
          actionRef.current?.reload();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  const onStatusChange = async (row: EmploymentVo, status: 1 | 2 | 3) => {
    try {
      await updateEmploymentStatus(row.id, status);
      message.success('状态已更新');
      actionRef.current?.reload();
    } catch (err) {
      handleError(err);
    }
  };

  const onSetPrimary = (row: EmploymentVo) => {
    Modal.confirm({
      title: `将 ${row.name} 的主岗设为 ${row.posName}？`,
      content: '该用户的其它主岗将被自动置为非主。',
      onOk: async () => {
        try {
          await setPrimaryEmployment(row.id);
          message.success('已设为主岗');
          actionRef.current?.reload();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  const columns: ProColumns<EmploymentVo>[] = [
    {
      title: '用户',
      dataIndex: 'name',
      render: (_, r) => `${r.name} (${r.username})`,
      width: 160,
      fieldProps: { placeholder: '工号或姓名' },
    },
    {
      title: '组织',
      dataIndex: 'organizationOrgCode',
      hideInTable: true,
      renderFormItem: () => <OrganizationTreeSelector placeholder="请选择组织范围" />,
    },
    {
      title: '组织路径',
      dataIndex: 'orgName',
      width: 260,
      search: false,
      render: (_, r) => formatOrgPath(r),
    },
    { title: '岗位', dataIndex: 'posName', width: 140, search: false },
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
      width: 260,
      render: (_, row) => {
        const ended = row.status === 3;
        if (ended) {
          return [
            <a key="view" onClick={() => setDrawerId(row.id)}>
              查看
            </a>,
          ];
        }
        return [
          <a key="view" onClick={() => setDrawerId(row.id)}>
            查看
          </a>,
          <a key="transfer" onClick={() => setTransferTarget(row)}>
            转岗
          </a>,
          row.isPrimary ? null : (
            <a key="primary" onClick={() => onSetPrimary(row)}>
              设主岗
            </a>
          ),
          <Dropdown
            key="status"
            menu={{
              items: getEmploymentStatusOptions()
                .filter((o) => o.value !== row.status)
                .map((o) => ({
                  key: String(o.value),
                  label: `切为「${o.label}」`,
                  onClick: () => onStatusChange(row, o.value as 1 | 2 | 3),
                })),
            }}
          >
            <a>状态</a>
          </Dropdown>,
          <a
            key="delete"
            style={{ color: '#d4380d' }}
            onClick={() => onDelete(row)}
          >
            删除
          </a>,
        ].filter(Boolean) as React.ReactNode[];
      },
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
            const statusNum
              = status === undefined || status === null || status === ''
                ? undefined
                : (Number(status) as 1 | 2 | 3);
            const isPrimaryBool
              = isPrimary === undefined
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
                  statuses: statusNum !== undefined ? [statusNum] : [1, 2],
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
            <Button danger onClick={() => setResignOpen(true)}>
              按用户离职
            </Button>
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

      <TransferModal
        open={transferTarget !== null}
        employment={transferTarget}
        onOpenChange={(open) => {
          if (!open) setTransferTarget(null);
        }}
        onSuccess={() => {
          setTransferTarget(null);
          actionRef.current?.reload();
        }}
      />

      <EmploymentDetailDrawer
        open={drawerId !== null}
        employmentId={drawerId}
        onClose={() => setDrawerId(null)}
      />

      <ResignByUserDialog
        open={resignOpen}
        onClose={() => setResignOpen(false)}
        onSuccess={() => {
          setResignOpen(false);
          actionRef.current?.reload();
        }}
      />
    </PageContainer>
  );
}
