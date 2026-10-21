import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import {
  createDelegation,
  type DelegationSearchInput,
  type DelegationVo,
  DelegationWriteUnconfirmedError,
  searchDelegations,
  updateDelegation,
} from "@admin/services/delegation";
import { PageContainer } from "@ant-design/pro-components";
import { ClientDelegationStatus } from "@iam/contracts";
import { useAccess } from "@umijs/max";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  message,
  Row,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import DelegationObjectSelect from "./DelegationObjectSelect";

type BusinessState = "scheduled" | "active" | "paused" | "expired" | "ended";
const states: { value: BusinessState; label: string }[] = [
  { value: "scheduled", label: "未开始" },
  { value: "active", label: "生效中" },
  { value: "paused", label: "暂停" },
  { value: "expired", label: "已到期" },
  { value: "ended", label: "已结束" },
];
function periodState(row: DelegationVo, now: number) {
  if (new Date(row.startTime).getTime() > now) return "scheduled";
  return new Date(row.endTime).getTime() < now ? "expired" : "active";
}
function matchesState(row: DelegationVo, selected: BusinessState, now: number) {
  if (selected === "ended") return row.status === ClientDelegationStatus.Disable;
  if (selected === "paused") return row.status === ClientDelegationStatus.Pause;
  if (row.status === ClientDelegationStatus.Disable) return false;
  return periodState(row, now) === selected && (selected !== "active" || row.status === ClientDelegationStatus.Enable);
}
function identity(name: string, code: string, deleted: boolean) {
  return `${name}（${code}）${deleted ? " · 已删除" : ""}`;
}
type Filters = {
  delegator?: string;
  delegatee?: string;
  clientId?: number;
  orgCode?: string;
  businessState?: BusinessState;
  startTime?: Dayjs;
  endTime?: Dayjs;
};
type Values = {
  delegatorUsername: string;
  delegateeUsername: string;
  clientId: number;
  orgCode: string;
  startTime: Dayjs;
  endTime: Dayjs;
  description?: string;
};

export default function DelegationsPage() {
  const access = useAccess();
  const [filterForm] = Form.useForm<Filters>();
  const [form] = Form.useForm<Values>();
  const [rows, setRows] = useState<DelegationVo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DelegationVo>();
  const [warning, setWarning] = useState<string>();
  const [error, setError] = useState<string>();
  const [observedAt, setObservedAt] = useState(Date.now());
  const [businessState, setBusinessState] = useState<BusinessState>();
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++requestSequence.current;
    const values = filterForm.getFieldsValue();
    const query: DelegationSearchInput = {
      ...(values.delegator ? { delegatorUsernames: [values.delegator] } : {}),
      ...(values.delegatee ? { delegateeUsernames: [values.delegatee] } : {}),
      ...(values.clientId ? { clientIds: [values.clientId] } : {}),
      ...(values.orgCode ? { orgCodes: [values.orgCode] } : {}),
      ...(values.startTime ? { startTime: values.startTime.startOf("minute").toDate() } : {}),
      ...(values.endTime ? { endTime: values.endTime.startOf("minute").toDate() } : {}),
      ...(values.businessState
        ? {
            statuses:
              values.businessState === "ended"
                ? [ClientDelegationStatus.Disable]
                : values.businessState === "paused"
                  ? [ClientDelegationStatus.Pause]
                  : values.businessState === "active"
                    ? [ClientDelegationStatus.Enable]
                    : [ClientDelegationStatus.Enable, ClientDelegationStatus.Pause],
          }
        : {}),
    };
    setLoading(true);
    setError(undefined);
    try {
      const result = await searchDelegations(query);
      if (request === requestSequence.current) {
        setRows(result);
        setObservedAt(Date.now());
        setBusinessState(values.businessState);
      }
    } catch (failure) {
      if (request === requestSequence.current) {
        setError(failure instanceof Error ? failure.message : "查询失败");
        setRows([]);
      }
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, [filterForm]);
  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setObservedAt(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const failure = (cause: unknown) => {
    if (cause instanceof AdminMutationCommittedError || cause instanceof DelegationWriteUnconfirmedError) {
      setWarning(cause.message);
      setOpen(false);
    } else message.error(cause instanceof Error ? cause.message : "操作失败");
    void load();
  };
  const changeStatus = async (row: DelegationVo, status: ClientDelegationStatus) => {
    setSaving(true);
    try {
      const outcome = await updateDelegation(row.id, { status });
      message.success(outcome.changed ? "委托已更新" : "无需修改");
      await load();
    } catch (cause) {
      failure(cause);
    } finally {
      setSaving(false);
    }
  };
  const edit = (row?: DelegationVo) => {
    setEditing(row);
    form.resetFields();
    if (row)
      form.setFieldsValue({
        startTime: dayjs(row.startTime),
        endTime: dayjs(row.endTime),
        description: row.description ?? "",
      });
    setOpen(true);
  };
  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const startTime =
      editing && values.startTime.isSame(editing.startTime, "minute")
        ? new Date(editing.startTime)
        : values.startTime.startOf("minute").toDate();
    const endTime =
      editing && values.endTime.isSame(editing.endTime, "minute")
        ? new Date(editing.endTime)
        : values.endTime.startOf("minute").toDate();
    if (startTime >= endTime) {
      message.error("结束时间必须晚于开始时间");
      return;
    }
    setSaving(true);
    const period = {
      startTime,
      endTime,
      description: values.description ?? null,
    };
    try {
      const outcome = editing
        ? await updateDelegation(editing.id, period)
        : await createDelegation({
            ...period,
            delegatorUsername: values.delegatorUsername,
            delegateeUsername: values.delegateeUsername,
            clientId: values.clientId,
            orgCode: values.orgCode,
          });
      message.success(outcome.changed ? (editing ? "委托已更新" : "委托已创建") : "无需修改");
      setOpen(false);
      await load();
    } catch (cause) {
      failure(cause);
    } finally {
      setSaving(false);
    }
  };
  return (
    <PageContainer title="委托管理">
      <Space orientation="vertical" style={{ width: "100%" }} size="middle">
        {warning && <Alert title={warning} type="warning" showIcon />}
        {error && (
          <Alert
            title={error}
            type="error"
            showIcon
            action={
              <Button
                onClick={() => {
                  void load();
                }}
              >
                重试查询
              </Button>
            }
          />
        )}
        <Card styles={{ body: { padding: "20px 24px 8px" } }}>
          <Form
            name="delegation-filter"
            form={filterForm}
            labelCol={{ flex: "90px" }}
            wrapperCol={{ flex: 1 }}
            onFinish={() => {
              void load();
            }}
          >
            <Row gutter={24}>
              <Col xs={24} sm={12} lg={8} xxl={6}>
                <Form.Item name="delegator" label="委托人筛选">
                  <DelegationObjectSelect kind="user" purpose="filter" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={8} xxl={6}>
                <Form.Item name="delegatee" label="受托人筛选">
                  <DelegationObjectSelect kind="user" purpose="filter" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={8} xxl={6}>
                <Form.Item name="clientId" label="应用筛选">
                  <DelegationObjectSelect kind="client" purpose="filter" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={8} xxl={6}>
                <Form.Item name="orgCode" label="组织筛选">
                  <DelegationObjectSelect kind="organization" purpose="filter" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={8} xxl={6}>
                <Form.Item name="businessState" label="状态">
                  <Select options={states} allowClear placeholder="全部状态" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={8} xxl={6}>
                <Form.Item name="startTime" label="期间起点">
                  <DatePicker
                    showTime={{ format: "HH:mm" }}
                    format="YYYY-MM-DD HH:mm"
                    placeholder="请选择起点时间"
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={8} xxl={6}>
                <Form.Item name="endTime" label="期间终点">
                  <DatePicker
                    showTime={{ format: "HH:mm" }}
                    format="YYYY-MM-DD HH:mm"
                    placeholder="请选择终点时间"
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={8} xxl={6} style={{ marginLeft: "auto", textAlign: "right", marginBottom: 24 }}>
                <Space>
                  <Button
                    onClick={() => {
                      filterForm.resetFields();
                      void load();
                    }}
                  >
                    重置
                  </Button>
                  <Button htmlType="submit" type="primary" loading={loading}>
                    查询
                  </Button>
                </Space>
              </Col>
            </Row>
          </Form>
        </Card>
        <Card
          extra={
            <Space>
              <Button
                onClick={() => {
                  void load();
                }}
              >
                刷新
              </Button>
              {access.canCreateDelegation && (
                <Button type="primary" onClick={() => edit()}>
                  新建委托
                </Button>
              )}
            </Space>
          }
        >
          <Table<DelegationVo>
            rowKey="id"
            loading={loading}
            dataSource={rows.filter((row) => !businessState || matchesState(row, businessState, observedAt))}
            scroll={{ x: 1200 }}
            columns={[
              {
                title: "应用",
                render: (_, row) => identity(row.client.clientName, row.client.clientCode, row.client.isDelete),
              },
              {
                title: "委托人",
                render: (_, row) => identity(row.delegatorName, row.delegatorUsername, row.delegatorUser.isDelete),
              },
              {
                title: "受托人",
                render: (_, row) => identity(row.delegateeName, row.delegateeUsername, row.delegateeUser.isDelete),
              },
              {
                title: "组织范围",
                render: (_, row) =>
                  `${identity(row.organizationScope.orgName, row.organizationScope.orgCode, row.organizationScope.isDelete)}及下级`,
              },
              {
                title: "期间",
                render: (_, row) => (
                  <>
                    {new Date(row.startTime).toLocaleString()}
                    <br />至 {new Date(row.endTime).toLocaleString()}
                  </>
                ),
              },
              {
                title: "状态",
                render: (_, row) => (
                  <Space>
                    <Tag>
                      {row.status === ClientDelegationStatus.Disable
                        ? "已结束"
                        : row.status === ClientDelegationStatus.Pause
                          ? "暂停"
                          : "启用"}
                    </Tag>
                    <Tag>
                      {periodState(row, observedAt) === "scheduled"
                        ? "未开始"
                        : periodState(row, observedAt) === "expired"
                          ? "已到期"
                          : row.status === ClientDelegationStatus.Enable
                            ? "生效中"
                            : "期间内"}
                    </Tag>
                  </Space>
                ),
              },
              { title: "说明", dataIndex: "description" },
              {
                title: "操作",
                render: (_, row) => (
                  <Space>
                    {row.allowedActions.edit.allowed && (
                      <Button type="link" disabled={saving} onClick={() => edit(row)}>
                        编辑
                      </Button>
                    )}
                    {row.allowedActions.pause.allowed && (
                      <Button
                        type="link"
                        disabled={saving}
                        onClick={() => {
                          void changeStatus(row, ClientDelegationStatus.Pause);
                        }}
                      >
                        暂停
                      </Button>
                    )}
                    {row.allowedActions.resume.allowed && (
                      <Button
                        type="link"
                        disabled={saving}
                        onClick={() => {
                          void changeStatus(row, ClientDelegationStatus.Enable);
                        }}
                      >
                        恢复
                      </Button>
                    )}
                    {row.allowedActions.end.allowed && (
                      <Button
                        type="link"
                        danger
                        disabled={saving}
                        onClick={() =>
                          Modal.confirm({
                            title: "结束此委托？",
                            content: "结束后不可恢复。",
                            onOk: () => changeStatus(row, ClientDelegationStatus.Disable),
                          })
                        }
                      >
                        结束
                      </Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </Space>
      <Modal
        open={open}
        title={editing ? "编辑委托" : "新建委托"}
        onCancel={() => setOpen(false)}
        onOk={() => {
          void submit();
        }}
        confirmLoading={saving}
        destroyOnHidden
      >
        {editing && (
          <Descriptions
            column={1}
            items={[
              { key: "users", label: "委托双方", children: `${editing.delegatorName} → ${editing.delegateeName}` },
              { key: "client", label: "应用", children: editing.client.clientName },
              { key: "org", label: "组织范围", children: `${editing.organizationScope.orgName}及下级` },
            ]}
          />
        )}
        <Form name="delegation-editor" form={form} layout="vertical" preserve={false}>
          {!editing && (
            <>
              <Form.Item name="delegatorUsername" label="委托人" rules={[{ required: true }]}>
                <DelegationObjectSelect kind="user" purpose="create" />
              </Form.Item>
              <Form.Item name="delegateeUsername" label="受托人" rules={[{ required: true }]}>
                <DelegationObjectSelect kind="user" purpose="create" />
              </Form.Item>
              <Form.Item name="clientId" label="应用" rules={[{ required: true }]}>
                <DelegationObjectSelect kind="client" purpose="create" />
              </Form.Item>
              <Form.Item name="orgCode" label="组织范围" rules={[{ required: true }]}>
                <DelegationObjectSelect kind="organization" purpose="create" />
              </Form.Item>
            </>
          )}
          <Form.Item name="startTime" label="开始时间" rules={[{ required: true }]}>
            <DatePicker
              showTime={{ format: "HH:mm" }}
              format="YYYY-MM-DD HH:mm"
              placeholder="请选择开始时间"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="endTime" label="结束时间" rules={[{ required: true }]}>
            <DatePicker
              showTime={{ format: "HH:mm" }}
              format="YYYY-MM-DD HH:mm"
              placeholder="请选择结束时间"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
