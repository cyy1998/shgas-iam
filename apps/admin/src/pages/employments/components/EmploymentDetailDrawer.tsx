import AuditLogTable from '@admin/components/audit/AuditLogTable';
import EmploymentResponsibilitySummary from '@admin/components/organization-responsibility/EmploymentResponsibilitySummary';
import StatusTag from '@admin/components/StatusTag';
import {
  type EmploymentDetailVo,
  getEmployment,
} from '@admin/services/employment';
import { ProDescriptions } from '@ant-design/pro-components';
import { Drawer, Empty, message, Skeleton, Space, Tabs, Tag } from 'antd';
import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  employmentId: number | null;
  onClose: () => void;
};

function formatOrgPath(detail: EmploymentDetailVo) {
  return (
    detail.organization?.fullOrgPath?.map((node) => node.orgName).join(' / ') ||
    detail.organization.assignedOrg.orgName
  );
}

function formatCompany(detail: EmploymentDetailVo) {
  const companyNodes = detail.organization.companyNodes;
  const company = companyNodes[companyNodes.length - 1];
  return company ? `${company.orgName} (${company.orgCode})` : '—';
}

function formatUser(detail: EmploymentDetailVo) {
  return `${detail.user.name} (${detail.user.username})`;
}

function formatPosition(detail: EmploymentDetailVo) {
  return `${detail.position.posName} (${detail.position.posCode})`;
}

export default function EmploymentDetailDrawer({
  open,
  employmentId,
  onClose,
}: Props) {
  return (
    <EmploymentDetailDrawerContent
      key={open ? employmentId : 'closed'}
      open={open}
      employmentId={employmentId}
      onClose={onClose}
    />
  );
}

function EmploymentDetailDrawerContent({ open, employmentId, onClose }: Props) {
  const [detail, setDetail] = useState<EmploymentDetailVo | null>(null);
  const [loading, setLoading] = useState(open && employmentId !== null);

  useEffect(() => {
    if (!open || employmentId === null) return;

    let cancelled = false;
    getEmployment(employmentId)
      .then((nextDetail) => {
        if (!cancelled) setDetail(nextDetail);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : '加载详情失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, employmentId]);

  return (
    <Drawer
      size={640}
      open={open}
      onClose={onClose}
      destroyOnHidden
      title={
        detail ? (
          <Space>
            <span>{detail.user.name}</span>
            <span style={{ color: '#999', fontSize: 12 }}>
              {detail.user.username}
            </span>
            {detail.isPrimary ? <Tag color="blue">主岗</Tag> : null}
            <StatusTag domain="employment" status={detail.status} />
          </Space>
        ) : (
          '雇佣详情'
        )
      }
    >
      {loading && !detail ? <Skeleton active /> : null}
      {!loading && !detail ? <Empty /> : null}
      {detail && (
        <Tabs
          items={[
            {
              key: 'basic',
              label: '基本信息',
              children: (
                <ProDescriptions<EmploymentDetailVo>
                  column={2}
                  dataSource={detail}
                  columns={[
                    {
                      title: '用户',
                      dataIndex: ['user', 'name'],
                      render: (_, r) => formatUser(r),
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (_, r) => (
                        <StatusTag domain="employment" status={r.status} />
                      ),
                    },
                    {
                      title: '公司',
                      dataIndex: ['organization', 'companyNodes'],
                      render: (_, r) => formatCompany(r),
                    },
                    {
                      title: '组织路径',
                      dataIndex: ['organization', 'assignedOrg', 'orgName'],
                      span: 2,
                      render: (_, r) => formatOrgPath(r),
                    },
                    {
                      title: '岗位',
                      dataIndex: ['position', 'posName'],
                      render: (_, r) => formatPosition(r),
                    },
                    {
                      title: '主岗',
                      dataIndex: 'isPrimary',
                      render: (_, r) => (r.isPrimary ? '是' : '否'),
                    },
                    {
                      title: '开始',
                      dataIndex: 'startTime',
                      render: (_, r) => new Date(r.startTime).toLocaleString(),
                    },
                    {
                      title: '结束',
                      dataIndex: 'endTime',
                      render: (_, r) =>
                        r.endTime ? new Date(r.endTime).toLocaleString() : '—',
                    },
                    {
                      title: '备注',
                      dataIndex: 'description',
                      span: 2,
                      render: (_, r) => r.description ?? '—',
                    },
                  ]}
                />
              ),
            },
            {
              key: 'roles',
              label: `角色 / 权限 (${detail.roles.length}/${detail.privileges.length})`,
              children: (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>角色：</strong>
                    {detail.roles.length === 0 ? (
                      <span style={{ color: '#999' }}>无</span>
                    ) : (
                      detail.roles.map((r: string) => <Tag key={r}>{r}</Tag>)
                    )}
                  </div>
                  <div>
                    <strong>权限：</strong>
                    {detail.privileges.length === 0 ? (
                      <span style={{ color: '#999' }}>无</span>
                    ) : (
                      detail.privileges.map((p: string) => (
                        <Tag key={p}>{p}</Tag>
                      ))
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'responsibilities',
              label: '组织责任',
              children: (
                <EmploymentResponsibilitySummary employmentId={detail.id} />
              ),
            },
            {
              key: 'logs',
              label: '操作日志',
              children: (
                <AuditLogTable
                  fixedConditions={{
                    targetType: 'employment',
                    targetId: detail.id,
                  }}
                  pageSize={10}
                  search={false}
                  size="small"
                />
              ),
            },
          ]}
        />
      )}
    </Drawer>
  );
}
