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
  ProTable,
} from '@ant-design/pro-components';
import { apiClient } from '@admin/lib/api-client';
import { getEmploymentStatusOptions, OrganizationType } from '@iam/contracts';
import { useLocation } from '@umijs/max';
import type { AppRouter } from '@iam/admin-api/trpc';
import type { inferRouterOutputs } from '@trpc/server';
import { Button, Dropdown, Form, message, Modal, Select, Space, Tag } from 'antd';
import type { FormInstance } from 'antd';
import { useEffect, useRef, useState } from 'react';

type OrgVo =
  inferRouterOutputs<AppRouter>['admin']['organization']['search']['result'][number];

interface FilterSelectProps {
  value?: string;
  onChange?: (val: string | undefined) => void;
  form: FormInstance;
}

function CompanyFilterSelect({ value, onChange, form }: FilterSelectProps) {
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient.admin.organization.search
      .query({
        pageNum: 1,
        pageSize: 50,
        conditions: {
          fuzzyConditions: {},
          exactConditions: { orgType: OrganizationType.Company },
        },
      })
      .then((res: { result: OrgVo[] }) => {
        if (!cancelled) {
          setOptions(
            res.result.map((o) => ({
              label: `${o.orgName} (${o.orgCode})`,
              value: o.orgCode,
            })),
          );
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) message.error(err instanceof Error ? err.message : '加载公司列表失败');
      });
    return () => { cancelled = true; };
  }, []);

  const handleChange = (val: string | undefined) => {
    form.setFieldValue('deptOrgCode', undefined);
    onChange?.(val);
  };

  return (
    <Select
      value={value}
      onChange={handleChange}
      options={options}
      showSearch
      allowClear
      filterOption={(input, option) =>
        ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
      }
      placeholder="请选择公司"
    />
  );
}

function DeptFilterSelect({ value, onChange, form }: FilterSelectProps) {
  const companyOrgCode = Form.useWatch('companyOrgCode', form);
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const prevCompanyRef = useRef<string | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  useEffect(() => {
    const prev = prevCompanyRef.current;
    prevCompanyRef.current = companyOrgCode;

    if (prev !== undefined && prev !== companyOrgCode) {
      onChangeRef.current?.(undefined);
    }

    setOptions([]);
    if (!companyOrgCode) return;

    let cancelled = false;
    setLoading(true);
    apiClient.admin.organization.search
      .query({
        pageNum: 1,
        pageSize: 200,
        conditions: {
          fuzzyConditions: {},
          exactConditions: {
            orgType: OrganizationType.Department,
            ancestorOrgCode: companyOrgCode,
          },
        },
      })
      .then((res: { result: OrgVo[] }) => {
        if (!cancelled) {
          setOptions(
            res.result.map((o) => ({
              label: `${o.orgName} (${o.orgCode})`,
              value: o.orgCode,
            })),
          );
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) message.error(err instanceof Error ? err.message : '加载部门列表失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [companyOrgCode]);

  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      loading={loading}
      disabled={!companyOrgCode}
      showSearch
      allowClear
      filterOption={(input, option) =>
        ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
      }
      placeholder={companyOrgCode ? '请选择部门' : '请先选择公司'}
    />
  );
}

type PresetFromUrl = { username?: string; name?: string };

function parseQuery(search: string): PresetFromUrl {
  const params = new URLSearchParams(search);
  const username = params.get('username');
  const name = params.get('name');
  return username ? { username, name: name ?? undefined } : {};
}

export default function EmploymentsPage() {
  const actionRef = useRef<ActionType>();
  const location = useLocation();

  const [formOpen, setFormOpen] = useState(false);
  const [formPresetUsername, setFormPresetUsername] = useState<string | null>(
    null,
  );
  const [formPresetName, setFormPresetName] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<EmploymentVo | null>(
    null,
  );
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [resignOpen, setResignOpen] = useState(false);

  // URL ?username=xxx → 自动打开新增 Modal
  useEffect(() => {
    const preset = parseQuery(location.search);
    if (preset.username) {
      setFormPresetUsername(preset.username);
      setFormPresetName(preset.name ?? null);
      setFormOpen(true);
    }
  }, [location.search]);

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
      title: '公司',
      dataIndex: 'companyOrgCode',
      hideInTable: true,
      renderFormItem: (_, __, form) => <CompanyFilterSelect form={form} />,
    },
    {
      title: '部门',
      dataIndex: 'deptOrgCode',
      hideInTable: true,
      renderFormItem: (_, __, form) => <DeptFilterSelect form={form} />,
    },
    { title: '公司', dataIndex: 'compName', width: 140, search: false },
    { title: '部门', dataIndex: 'orgName', width: 140, search: false },
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
              companyOrgCode,
              deptOrgCode,
            } = params as {
              current?: number;
              pageSize?: number;
              name?: string;
              status?: string | number;
              isPrimary?: 'true' | 'false' | boolean;
              companyOrgCode?: string;
              deptOrgCode?: string;
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
                  companyOrgCodes: companyOrgCode ? [companyOrgCode] : undefined,
                  deptOrgCodes: deptOrgCode ? [deptOrgCode] : undefined,
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
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setFormPresetUsername(null);
            setFormPresetName(null);
          }
        }}
        onSuccess={() => {
          setFormOpen(false);
          setFormPresetUsername(null);
          setFormPresetName(null);
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
