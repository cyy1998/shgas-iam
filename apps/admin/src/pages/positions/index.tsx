import { useAccess } from "@admin/admin-access";
import CustomAttributeDefinitionsDrawer from "@admin/components/custom-attributes/CustomAttributeDefinitionsDrawer";
import CustomAttributeDetails from "@admin/components/custom-attributes/CustomAttributeDetails";
import StatusTag from "@admin/components/StatusTag";
import PositionFormModal from "@admin/pages/positions/components/PositionFormModal";
import {
  deletePosition,
  getPosition,
  type PositionDetailVo,
  type PositionVo,
  searchPositions,
  updatePositionStatus,
} from "@admin/services/position";
import { PlusOutlined } from "@ant-design/icons";
import { type ActionType, PageContainer, type ProColumns, ProTable } from "@ant-design/pro-components";
import { getPositionStatusOptions } from "@iam/contracts";
import { Button, Descriptions, Drawer, Dropdown, Input, Modal, message } from "antd";
import { useRef, useState } from "react";

export default function PositionsPage() {
  const access = useAccess();
  const actionRef = useRef<ActionType>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PositionDetailVo | null>(null);
  const [detail, setDetail] = useState<PositionDetailVo | null>(null);
  const [loadingPosition, setLoadingPosition] = useState(false);
  const [attributeDefinitionsOpen, setAttributeDefinitionsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState<{ text?: string }>({});

  const handleError = (err: unknown) => {
    message.error(err instanceof Error ? err.message : "操作失败");
  };

  const openPosition = async (posCode: string, mode: "details" | "edit") => {
    if (loadingPosition) return;
    setLoadingPosition(true);
    try {
      const position = await getPosition(posCode);
      if (mode === "edit") {
        setEditing(position);
        setModalOpen(true);
      } else {
        setDetail(position);
      }
    } catch (error) {
      handleError(error);
    } finally {
      setLoadingPosition(false);
    }
  };

  const onDelete = (row: PositionVo) => {
    Modal.confirm({
      title: `删除岗位 ${row.posName}？`,
      content: "软删除后不会出现在列表中，如需恢复请联系管理员。",
      okType: "danger",
      onOk: async () => {
        try {
          const outcome = await deletePosition(row.posCode);
          message.success(outcome.changed ? "已删除" : "无需修改");
          actionRef.current?.reload();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  const onStatusChange = async (row: PositionVo, status: number) => {
    try {
      const outcome = await updatePositionStatus(row.posCode, status);
      message.success(outcome.changed ? "状态已更新" : "无需修改");
      actionRef.current?.reload();
    } catch (err) {
      handleError(err);
    }
  };

  const columns: ProColumns<PositionVo>[] = [
    { title: "岗位编码", dataIndex: "posCode", width: 150, search: false },
    { title: "岗位名称", dataIndex: "posName", width: 180, search: false },
    { title: "描述", dataIndex: "description", ellipsis: true, search: false },
    {
      title: "状态",
      dataIndex: "status",
      width: 80,
      search: false,
      render: (_, row) => <StatusTag domain="position" status={row.status} />,
    },
    { title: "雇佣人数", dataIndex: "memberNumber", width: 90, align: "right", search: false },
    {
      title: "操作",
      fixed: "right",
      valueType: "option",
      width: 200,
      render: (_, row) =>
        [
          <Button
            key="details"
            type="link"
            size="small"
            style={{ paddingInline: 0 }}
            disabled={loadingPosition}
            onClick={() => openPosition(row.posCode, "details")}
          >
            详情
          </Button>,
          access.canEditPosition && (
            <Button
              key="edit"
              type="link"
              size="small"
              style={{ paddingInline: 0 }}
              disabled={loadingPosition}
              onClick={() => openPosition(row.posCode, "edit")}
            >
              编辑
            </Button>
          ),
          access.canChangePositionStatus && (
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
              <Button type="link" size="small" style={{ paddingInline: 0 }}>
                状态
              </Button>
            </Dropdown>
          ),
          access.canDeletePosition && (
            <Button
              key="delete"
              type="link"
              size="small"
              danger
              style={{ paddingInline: 0 }}
              onClick={() => onDelete(row)}
            >
              删除
            </Button>
          ),
        ].filter(Boolean),
    },
  ];

  return (
    <PageContainer title={false} breadcrumbRender={false}>
      <ProTable<PositionVo>
        className="iam-admin-list"
        defaultSize="small"
        actionRef={actionRef}
        rowKey="posCode"
        columns={columns}
        search={false}
        params={filters}
        headerTitle={
          <div className="iam-admin-filters">
            <Input.Search
              className="iam-admin-search"
              aria-label="搜索岗位"
              placeholder="搜索岗位编码或名称"
              allowClear
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                if (!event.target.value) setFilters({});
              }}
              onSearch={(text) => setFilters({ text: text.trim() || undefined })}
            />
          </div>
        }
        scroll={{ x: 760 }}
        pagination={{ defaultPageSize: 20, hideOnSinglePage: true, showSizeChanger: true }}
        request={async (params) => {
          try {
            const {
              current = 1,
              pageSize = 10,
              text,
            } = params as {
              current?: number;
              pageSize?: number;
              text?: string;
            };
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
        toolBarRender={() =>
          [
            access.canEditPosition && (
              <Button key="custom-attributes" onClick={() => setAttributeDefinitionsOpen(true)}>
                自定义属性
              </Button>
            ),
            access.canCreatePosition && (
              <Button
                key="create"
                type="primary"
                icon={<PlusOutlined aria-hidden />}
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                新建岗位
              </Button>
            ),
          ].filter(Boolean)
        }
      />
      {access.canEditPosition && (
        <CustomAttributeDefinitionsDrawer
          entityType="position"
          open={attributeDefinitionsOpen}
          onClose={() => setAttributeDefinitionsOpen(false)}
        />
      )}
      <Drawer title="岗位详情" open={detail !== null} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions
              column={1}
              items={[
                { key: "code", label: "岗位编码", children: detail.posCode },
                { key: "name", label: "岗位名称", children: detail.posName },
                { key: "description", label: "描述", children: detail.description ?? "—" },
                { key: "status", label: "状态", children: <StatusTag domain="position" status={detail.status} /> },
                { key: "members", label: "雇佣人数", children: detail.memberNumber },
              ]}
            />
            <CustomAttributeDetails
              definitions={detail.customAttributeDefinitions ?? []}
              values={detail.customAttributes ?? {}}
            />
          </>
        )}
      </Drawer>
      <PositionFormModal
        canManageCustomAttributes={access.canEditPosition}
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
