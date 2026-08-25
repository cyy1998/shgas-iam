import AuthorizationActionDropdown from '@admin/components/AuthorizationActionDropdown';
import AuthorizationActionButton from '@admin/components/AuthorizationActionButton';
import StatusTag from '@admin/components/StatusTag';
import {
  deleteOrganization,
  type OrganizationChildrenPage,
  type OrganizationDetailVo,
  type OrganizationTreeNode,
  updateOrganizationStatus,
} from '@admin/services/organization';
import { ProDescriptions } from '@ant-design/pro-components';
import {
  getOrganizationStatusOptions,
  OrganizationStatus,
} from '@iam/contracts';
import {
  Empty,
  message,
  Modal,
  Space,
  Table,
  Tabs,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useAccess } from '@umijs/max';
import OrganizationResponsibilityAssignmentsPanel from './OrganizationResponsibilityAssignmentsPanel';

type Props = {
  loading: boolean;
  detail: OrganizationDetailVo | null;
  childrenPage: OrganizationChildrenPage | null;
  childrenLoading: boolean;
  onChildrenPageChange: (pageNum: number, pageSize: number) => void;
  onEdit: () => void;
  onCreateChild: () => void;
  onSelectChild: (orgCode: string) => void;
  onChanged: () => void;
};

const childColumns = (
  onSelectChild: (orgCode: string) => void,
): ColumnsType<OrganizationTreeNode> => [
  {
    title: '编码',
    dataIndex: 'orgCode',
    render: (v, row) => <a onClick={() => onSelectChild(row.orgCode)}>{v}</a>,
  },
  { title: '名称', dataIndex: 'orgName' },
  { title: '类型', dataIndex: 'orgType' },
  {
    title: '状态',
    dataIndex: 'status',
    render: (_, row) => <StatusTag domain="org" status={row.status} />,
  },
];

export default function OrgDetailPanel({
  loading,
  detail,
  childrenPage,
  childrenLoading,
  onChildrenPageChange,
  onEdit,
  onCreateChild,
  onSelectChild,
  onChanged,
}: Props) {
  const access = useAccess();
  if (!detail) {
    return (
      <div style={{ padding: 48 }}>
        <Empty description="请选择左侧组织查看详情" />
      </div>
    );
  }

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : '操作失败');

  const onStatusChange = async (status: number) => {
    const mutate = async () => {
      try {
        await updateOrganizationStatus(detail.orgCode, status);
        message.success('状态已更新');
        onChanged();
      } catch (err) {
        handleError(err);
      }
    };
    if (status === OrganizationStatus.Enable) {
      await mutate();
      return;
    }
    Modal.confirm({
      title: '确认变更组织状态？',
      content:
        '服务端将检查该组织及全部下级组织；任一组织仍是开放责任任命目标时，本次变更会被阻止。',
      okText: '确认变更',
      onOk: mutate,
    });
  };

  const onDelete = () => {
    Modal.confirm({
      title: `删除组织 ${detail.orgName}？`,
      content:
        '服务端将检查该组织及全部下级组织；存在开放责任任命时会拒绝删除。软删除后不会出现在列表中。',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteOrganization(detail.orgCode);
          message.success('已删除');
          onChanged();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  return (
    <div style={{ padding: 16 }}>
      <Typography.Paragraph type="secondary">
        暂停、停用或删除时，服务端会检查该组织及全部下级组织是否仍有开放责任任命。
      </Typography.Paragraph>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <Space size="middle">
          <h3 style={{ margin: 0 }}>
            {detail.orgName}
            <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
              {detail.orgCode}
            </span>
          </h3>
          <StatusTag domain="org" status={detail.status} />
        </Space>
        <Space>
          <AuthorizationActionButton
            decision={detail.allowedActions.createChild}
            onClick={onCreateChild}
          >
            + 下级组织
          </AuthorizationActionButton>
          <AuthorizationActionButton
            decision={detail.allowedActions.edit}
            onClick={onEdit}
          >
            编辑
          </AuthorizationActionButton>
          <AuthorizationActionDropdown
            decision={detail.allowedActions.changeStatus}
            menu={{
              items: getOrganizationStatusOptions()
                .filter((o) => o.value !== detail.status)
                .map((o) => ({
                  key: String(o.value),
                  label: `切为「${o.label}」`,
                  onClick: () => onStatusChange(o.value),
                })),
            }}
          >
            状态
          </AuthorizationActionDropdown>
          <AuthorizationActionButton
            danger
            decision={detail.allowedActions.delete}
            onClick={onDelete}
          >
            删除
          </AuthorizationActionButton>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'organization-detail',
            label: '组织详情',
            children: (
              <>
                <ProDescriptions<OrganizationDetailVo>
                  column={2}
                  dataSource={detail}
                  loading={loading}
                  columns={[
                    { title: '编码', dataIndex: 'orgCode' },
                    { title: '名称', dataIndex: 'orgName' },
                    { title: '类型', dataIndex: 'orgType' },
                    { title: '层级', dataIndex: 'level' },
                    { title: '路径', dataIndex: 'path', span: 2 },
                    {
                      title: '上级',
                      dataIndex: 'parentName',
                      render: (_, row) =>
                        row.parentCode
                          ? `${row.parentName} (${row.parentCode})`
                          : '—',
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (_, row) => (
                        <StatusTag domain="org" status={row.status} />
                      ),
                    },
                    { title: '下级数', dataIndex: 'childrenCount' },
                    { title: '在职雇佣', dataIndex: 'employmentCount' },
                    {
                      title: '创建时间',
                      dataIndex: 'createTime',
                      render: (_, row) =>
                        new Date(row.createTime).toLocaleString(),
                    },
                    {
                      title: '更新时间',
                      dataIndex: 'updateTime',
                      render: (_, row) =>
                        new Date(row.updateTime).toLocaleString(),
                    },
                  ]}
                />

                <div style={{ marginTop: 24 }}>
                  <h4>
                    下级组织
                    {childrenPage && childrenPage.total > 0 && (
                      <span
                        style={{ color: '#999', fontSize: 12, marginLeft: 8 }}
                      >
                        共 {childrenPage.total} 条
                      </span>
                    )}
                  </h4>
                  <Table<OrganizationTreeNode>
                    rowKey="orgCode"
                    size="small"
                    loading={childrenLoading}
                    columns={childColumns(onSelectChild)}
                    dataSource={childrenPage?.result ?? []}
                    pagination={{
                      current: childrenPage?.pageNum ?? 1,
                      pageSize: childrenPage?.pageSize ?? 20,
                      total: childrenPage?.total ?? 0,
                      showSizeChanger: true,
                      pageSizeOptions: [10, 20, 50, 100],
                      onChange: (page, size) =>
                        onChildrenPageChange(page, size),
                    }}
                    locale={{ emptyText: '无下级组织' }}
                  />
                </div>
              </>
            ),
          },
          ...(access.canAccessOrganizationResponsibility ? [{
            key: 'responsibility-assignments',
            label: '责任任命',
            children: (
              <OrganizationResponsibilityAssignmentsPanel
                orgCode={detail.orgCode}
              />
            ),
          }] : []),
        ]}
      />
    </div>
  );
}
