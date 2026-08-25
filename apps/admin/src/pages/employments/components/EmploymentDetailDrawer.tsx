import AuditLogTable from '@admin/components/audit/AuditLogTable';
import AuthorizationActionButton from '@admin/components/AuthorizationActionButton';
import EmploymentLifecycleActions from '@admin/components/EmploymentLifecycleActions';
import EmploymentPrimaryActions from '@admin/components/EmploymentPrimaryActions';
import EmploymentResponsibilitySummary from '@admin/components/organization-responsibility/EmploymentResponsibilitySummary';
import StatusTag from '@admin/components/StatusTag';
import {
  type EmploymentDetailVo,
  getEmployment,
  updateEmployment,
} from '@admin/services/employment';
import { ProDescriptions } from '@ant-design/pro-components';
import { useAccess } from '@umijs/max';
import {
  Drawer,
  Empty,
  Input,
  message,
  Modal,
  Skeleton,
  Space,
  Tabs,
  Tag,
} from 'antd';
import { useEffect, useState } from 'react';
import TransferModal from './TransferModal';

type Props = {
  open: boolean;
  employmentId: number | null;
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
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
  onChanged,
}: Props) {
  return (
    <EmploymentDetailDrawerContent
      key={open ? employmentId : 'closed'}
      open={open}
      employmentId={employmentId}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

function EmploymentDetailDrawerContent({
  open,
  employmentId,
  onClose,
  onChanged,
}: Props) {
  const access = useAccess();
  const [detail, setDetail] = useState<EmploymentDetailVo | null>(null);
  const [loading, setLoading] = useState(open && employmentId !== null);
  const [description, setDescription] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const loadDetail = async () => {
    if (employmentId === null) return;
    const nextDetail = await getEmployment(employmentId);
    setDetail(nextDetail);
  };

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

  const refresh = async () => {
    await loadDetail();
    await onChanged?.();
  };

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
        <>
          <Space wrap style={{ marginBottom: 16 }}>
            <AuthorizationActionButton
              decision={detail.allowedActions.editDescription}
              onClick={() => {
                setDescription(detail.description ?? '');
                setEditOpen(true);
              }}
            >
              编辑备注
            </AuthorizationActionButton>
            <AuthorizationActionButton
              decision={detail.allowedActions.transfer}
              onClick={() => setTransferOpen(true)}
            >
              转岗
            </AuthorizationActionButton>
            <EmploymentPrimaryActions
              decision={
                detail.isPrimary
                  ? detail.allowedActions.clearPrimary
                  : detail.allowedActions.setPrimary
              }
              employment={detail}
              onSuccess={refresh}
            />
            <EmploymentLifecycleActions
              decisions={detail.allowedActions}
              employment={detail}
              onSuccess={refresh}
            />
          </Space>
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
                        render: (_, r) =>
                          new Date(r.startTime).toLocaleString(),
                      },
                      {
                        title: '结束',
                        dataIndex: 'endTime',
                        render: (_, r) =>
                          r.endTime
                            ? new Date(r.endTime).toLocaleString()
                            : '—',
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
              ...(access.canAccessOrganizationResponsibility
                ? [
                    {
                      key: 'responsibilities',
                      label: '组织责任',
                      children: (
                        <EmploymentResponsibilitySummary
                          employmentId={detail.id}
                        />
                      ),
                    },
                  ]
                : []),
              ...(access.canAccessAudit
                ? [
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
                  ]
                : []),
            ]}
          />
          <Modal
            title="编辑任职备注"
            open={editOpen}
            okText="保存"
            onCancel={() => setEditOpen(false)}
            onOk={async () => {
              try {
                await updateEmployment(detail.id, {
                  description: description || null,
                });
                message.success('备注已更新');
                setEditOpen(false);
                await refresh();
              } catch (error) {
                message.error(
                  error instanceof Error ? error.message : '操作失败',
                );
              }
            }}
          >
            <label>
              <span>备注</span>
              <Input.TextArea
                aria-label="备注"
                value={description}
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </Modal>
          <TransferModal
            open={transferOpen}
            employment={detail}
            onOpenChange={setTransferOpen}
            onSuccess={async () => {
              setTransferOpen(false);
              await refresh();
            }}
          />
        </>
      )}
    </Drawer>
  );
}
