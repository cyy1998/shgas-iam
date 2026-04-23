import StatusTag from '@/components/StatusTag';
import { type EmploymentDetailVo, getEmployment } from '@/services/employment';
import { ProDescriptions } from '@ant-design/pro-components';
import { Drawer, Empty, message, Skeleton, Space, Tabs, Tag } from 'antd';
import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  employmentId: number | null;
  onClose: () => void;
};

export default function EmploymentDetailDrawer({
  open,
  employmentId,
  onClose,
}: Props) {
  const [detail, setDetail] = useState<EmploymentDetailVo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || employmentId === null) {
      setDetail(null);
      return;
    }
    setLoading(true);
    getEmployment(employmentId)
      .then(setDetail)
      .catch((err: unknown) =>
        message.error(err instanceof Error ? err.message : '加载详情失败'),
      )
      .finally(() => setLoading(false));
  }, [open, employmentId]);

  return (
    <Drawer
      width={640}
      open={open}
      onClose={onClose}
      destroyOnClose
      title={
        detail ? (
          <Space>
            <span>{detail.name}</span>
            <span style={{ color: '#999', fontSize: 12 }}>
              {detail.username}
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
                      dataIndex: 'name',
                      render: (_, r) => `${r.name} (${r.username})`,
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
                      dataIndex: 'compName',
                      render: (_, r) => `${r.compName} (${r.compCode})`,
                    },
                    {
                      title: '部门',
                      dataIndex: 'orgName',
                      render: (_, r) => `${r.orgName} (${r.orgCode})`,
                    },
                    {
                      title: '岗位',
                      dataIndex: 'posName',
                      render: (_, r) => `${r.posName} (${r.posCode})`,
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
              key: 'logs',
              label: '操作日志',
              children: <Empty description="日志功能尚未接入" />,
            },
          ]}
        />
      )}
    </Drawer>
  );
}
