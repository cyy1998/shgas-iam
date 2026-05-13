import StatusTag from '@admin/components/StatusTag';
import PositionFormModal from '@admin/pages/positions/components/PositionFormModal';
import {
  deletePosition,
  type PositionVo,
  searchPositions,
  updatePositionStatus,
} from '@admin/services/position';
import {
  ActionType,
  PageContainer,
  ProColumns,
  ProTable,
} from '@ant-design/pro-components';
import { getPositionStatusOptions } from '@iam/contracts';
import { Button, Dropdown, message, Modal } from 'antd';
import { useRef, useState } from 'react';

export default function PositionsPage() {
  const actionRef = useRef<ActionType>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PositionVo | null>(null);

  const handleError = (err: unknown) => {
    message.error(err instanceof Error ? err.message : '操作失败');
  };

  const onEdit = (row: PositionVo) => {
    setEditing(row);
    setModalOpen(true);
  };

  const onDelete = (row: PositionVo) => {
    Modal.confirm({
      title: `删除岗位 ${row.posName}？`,
      content: '软删除后不会出现在列表中，如需恢复请联系管理员。',
      okType: 'danger',
      onOk: async () => {
        try {
          await deletePosition(row.posCode);
          message.success('已删除');
          actionRef.current?.reload();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  const onStatusChange = async (row: PositionVo, status: number) => {
    try {
      await updatePositionStatus(row.posCode, status);
      message.success('状态已更新');
      actionRef.current?.reload();
    } catch (err) {
      handleError(err);
    }
  };

  const columns: ProColumns<PositionVo>[] = [
    { title: '岗位编码', dataIndex: 'posCode', width: 160 },
    { title: '岗位名称', dataIndex: 'posName', width: 200 },
    { title: '描述', dataIndex: 'description', ellipsis: true, search: false },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      search: false,
      render: (_, row) => <StatusTag domain="position" status={row.status} />,
    },
    { title: '雇佣人数', dataIndex: 'memberNumber', width: 100, search: false },
    {
      title: '操作',
      valueType: 'option',
      width: 220,
      render: (_, row) => [
        <a key="edit" onClick={() => onEdit(row)}>
          编辑
        </a>,
        <Dropdown
          key="status"
          menu={{
            items: getPositionStatusOptions()
              .filter((o) => o.value !== row.status)
              .map((o) => ({
                key: String(o.value),
                label: `切为「${o.label}」`,
                onClick: () => onStatusChange(row, o.value),
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
      ],
    },
  ];

  return (
    <PageContainer title="职位管理">
      <ProTable<PositionVo>
        actionRef={actionRef}
        rowKey="posCode"
        columns={columns}
        search={{ labelWidth: 'auto' }}
        request={async (params) => {
          try {
            const {
              current = 1,
              pageSize = 10,
              posCode,
              posName,
            } = params as {
              current?: number;
              pageSize?: number;
              posCode?: string;
              posName?: string;
            };
            const text = (posCode || posName || '') as string;
            const data = await searchPositions({
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { text } : {},
                exactConditions: {},
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
          <Button
            key="create"
            type="primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + 新建岗位
          </Button>,
        ]}
      />
      <PositionFormModal
        open={modalOpen}
        initialValues={editing}
        onOpenChange={setModalOpen}
        onSuccess={() => {
          setModalOpen(false);
          actionRef.current?.reload();
        }}
      />
    </PageContainer>
  );
}
