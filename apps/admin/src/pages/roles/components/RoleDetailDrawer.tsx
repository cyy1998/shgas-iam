import StatusTag from '@admin/components/StatusTag';
import AuditLogTable from '@admin/components/audit/AuditLogTable';
import { roleAssignmentTargetTypeOptions } from '@admin/pages/roles/role-selectors';
import {
  type RoleAssignmentVo,
  type RoleDetailVo,
  deleteRoleAssignment,
  getRole,
  searchRoleAssignments,
  updateRoleAssignmentScope,
} from '@admin/services/role';
import {
  type ActionType,
  type ProColumns,
  ProDescriptions,
  ProTable,
} from '@ant-design/pro-components';
import { RoleAssignmentTargetType } from '@iam/contracts';
import {
  Button,
  Drawer,
  Empty,
  message,
  Modal,
  Skeleton,
  Space,
  Tabs,
  Tag,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import RoleAssignmentFormModal from './RoleAssignmentFormModal';

type Props = {
  open: boolean;
  roleCode: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

export default function RoleDetailDrawer({
  open,
  roleCode,
  onOpenChange,
  onChanged,
}: Props) {
  const assignmentActionRef = useRef<ActionType>(undefined);
  const [detail, setDetail] = useState<RoleDetailVo | null>(null);
  const [loading, setLoading] = useState(false);
  const [assignmentFormOpen, setAssignmentFormOpen] = useState(false);

  const handleError = useCallback(
    (err: unknown) =>
      message.error(err instanceof Error ? err.message : '操作失败'),
    [],
  );

  const load = useCallback(async () => {
    if (!open || !roleCode) return;
    setLoading(true);
    try {
      setDetail(await getRole(roleCode));
    } catch (err) {
      handleError(err);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [handleError, open, roleCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadAssignments = () => {
    assignmentActionRef.current?.reload();
    void load();
    onChanged();
  };

  const onDeleteAssignment = (row: RoleAssignmentVo) => {
    if (!detail) return;
    Modal.confirm({
      title: `删除 ${row.targetTypeText} 分配？`,
      content: `${row.target.name} 将不再通过该角色获得授权。`,
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteRoleAssignment(detail.roleCode, row.id);
          message.success('分配已删除');
          reloadAssignments();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  const onToggleScope = async (row: RoleAssignmentVo) => {
    if (!detail) return;
    try {
      await updateRoleAssignmentScope(
        detail.roleCode,
        row.id,
        !row.includeDescendants,
      );
      message.success('作用范围已更新');
      reloadAssignments();
    } catch (err) {
      handleError(err);
    }
  };

  const assignmentColumns: ProColumns<RoleAssignmentVo>[] = [
    {
      title: '类型',
      dataIndex: 'targetType',
      width: 100,
      valueType: 'select',
      valueEnum: Object.fromEntries(
        roleAssignmentTargetTypeOptions.map((o) => [
          o.value,
          { text: o.label },
        ]),
      ),
      render: (_, row) => <Tag>{row.targetTypeText}</Tag>,
    },
    {
      title: '对象',
      dataIndex: 'targetText',
      ellipsis: true,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <span>{row.target.name}</span>
          <span style={{ color: '#6b7280', fontSize: 12 }}>
            {row.target.code}
          </span>
        </Space>
      ),
    },
    {
      title: '作用范围',
      dataIndex: 'includeDescendants',
      width: 130,
      valueType: 'select',
      valueEnum: {
        true: { text: '含下级组织' },
        false: { text: '仅当前对象' },
      },
      render: (_, row) => row.scopeText,
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 170,
      search: false,
      render: (_, row) => new Date(row.createTime).toLocaleString(),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 150,
      render: (_, row) => [
        row.targetType === RoleAssignmentTargetType.Organization ? (
          <a key="scope" onClick={() => onToggleScope(row)}>
            {row.includeDescendants ? '仅本组织' : '含下级'}
          </a>
        ) : null,
        <a
          key="delete"
          style={{ color: '#d4380d' }}
          onClick={() => onDeleteAssignment(row)}
        >
          删除
        </a>,
      ],
    },
  ];

  return (
    <>
      <Drawer
        size={760}
        open={open}
        onClose={() => onOpenChange(false)}
        destroyOnHidden
        title={
          detail ? (
            <Space>
              <span>{detail.roleName}</span>
              <span style={{ color: '#999', fontSize: 12 }}>
                {detail.roleCode}
              </span>
              <StatusTag domain="role" status={detail.status} />
            </Space>
          ) : (
            '角色详情'
          )
        }
      >
        {loading && !detail ? <Skeleton active /> : null}
        {!loading && !detail ? <Empty /> : null}
        {detail ? (
          <Tabs
            items={[
              {
                key: 'basic',
                label: '基本信息',
                children: (
                  <ProDescriptions<RoleDetailVo>
                    column={2}
                    dataSource={detail}
                    columns={[
                      { title: '角色编码', dataIndex: 'roleCode' },
                      { title: '角色名称', dataIndex: 'roleName' },
                      {
                        title: '所属应用',
                        dataIndex: ['client', 'clientName'],
                        render: (_, row) =>
                          `${row.client.clientName}（${row.client.clientCode}）`,
                      },
                      {
                        title: '状态',
                        dataIndex: 'status',
                        render: (_, row) => (
                          <StatusTag domain="role" status={row.status} />
                        ),
                      },
                      {
                        title: '分配数',
                        dataIndex: 'assignmentCount',
                      },
                      {
                        title: '描述',
                        dataIndex: 'description',
                        span: 2,
                        render: (_, row) => row.description ?? '—',
                      },
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
                ),
              },
              {
                key: 'assignments',
                label: `分配对象（${detail.assignmentCount}）`,
                children: (
                  <ProTable<RoleAssignmentVo>
                    actionRef={assignmentActionRef}
                    rowKey="id"
                    size="small"
                    columns={assignmentColumns}
                    search={{ labelWidth: 'auto' }}
                    scroll={{ x: 750 }}
                    toolBarRender={() => [
                      <Button
                        key="create"
                        type="primary"
                        onClick={() => setAssignmentFormOpen(true)}
                      >
                        新增分配
                      </Button>,
                    ]}
                    request={async (params) => {
                      try {
                        const {
                          current = 1,
                          pageSize = 10,
                          targetText,
                          targetType,
                          includeDescendants,
                        } = params as {
                          current?: number;
                          pageSize?: number;
                          targetText?: string;
                          targetType?: RoleAssignmentTargetType;
                          includeDescendants?: string | boolean;
                        };
                        const includeValue =
                          includeDescendants === undefined
                            ? undefined
                            : includeDescendants === true ||
                              includeDescendants === 'true';
                        const data = await searchRoleAssignments(
                          detail.roleCode,
                          {
                            pageNum: current,
                            pageSize,
                            conditions: {
                              fuzzyConditions: targetText
                                ? { text: targetText }
                                : {},
                              exactConditions: {
                                targetType,
                                includeDescendants: includeValue,
                              },
                            },
                          },
                        );
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
                  />
                ),
              },
              {
                key: 'logs',
                label: '操作日志',
                children: (
                  <AuditLogTable
                    fixedConditions={{
                      targetType: 'role',
                      targetCode: detail.roleCode,
                    }}
                    pageSize={10}
                    search={false}
                    size="small"
                  />
                ),
              },
            ]}
          />
        ) : null}
      </Drawer>
      <RoleAssignmentFormModal
        open={assignmentFormOpen}
        roleCode={detail?.roleCode ?? null}
        onOpenChange={setAssignmentFormOpen}
        onSuccess={reloadAssignments}
        onError={handleError}
      />
    </>
  );
}
