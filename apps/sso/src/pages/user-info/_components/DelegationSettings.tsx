import { ClientDelegationStatus } from "@iam/delegation/wire";
import {
  type DelegationDetail,
  type DelegationDirection,
  searchPersonalDelegations,
  updatePersonalDelegation,
} from "@sso/services/delegation";
import { ServiceError } from "@sso/utils/request";
import { Alert, Button, Popconfirm, Select, Space, Table, Tabs, Tag } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import DelegationEditor from "./DelegationEditor";

type StatusFilter = "open" | "all" | "planned" | "active" | "paused" | "expired" | "ended";
function lifecycle(record: DelegationDetail, now: number) {
  const period = now < record.startTime.getTime() ? "未开始" : now > record.endTime.getTime() ? "已到期" : "期间内";
  if (record.status === ClientDelegationStatus.Disable) return `已结束（${period}）`;
  if (record.status === ClientDelegationStatus.Pause) return `暂停（${period}）`;
  return period === "期间内" ? "生效中" : period;
}
function matches(record: DelegationDetail, filter: StatusFilter, now: number) {
  if (filter === "all") return true;
  if (filter === "ended") return record.status === ClientDelegationStatus.Disable;
  if (record.status === ClientDelegationStatus.Disable) return false;
  if (filter === "open") return true;
  if (filter === "paused") return record.status === ClientDelegationStatus.Pause;
  if (filter === "expired") return record.endTime.getTime() < now;
  if (filter === "planned") return record.status === ClientDelegationStatus.Enable && now < record.startTime.getTime();
  return (
    record.status === ClientDelegationStatus.Enable &&
    record.startTime.getTime() <= now &&
    now <= record.endTime.getTime()
  );
}

export default function DelegationSettings() {
  const [direction, setDirection] = useState<DelegationDirection>("outgoing");
  const [records, setRecords] = useState<DelegationDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const requestVersion = useRef(0);
  const [editing, setEditing] = useState<DelegationDetail | "create">();
  const [mutating, setMutating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const mutationPending = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await searchPersonalDelegations(direction);
      if (version === requestVersion.current) setRecords(result);
    } catch (failure) {
      if (version === requestVersion.current) setError(failure instanceof Error ? failure.message : "委托加载失败");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [direction]);
  useEffect(() => {
    setRecords([]);
    void refresh();
    return () => {
      requestVersion.current += 1;
    };
  }, [refresh]);
  async function changeStatus(record: DelegationDetail, status: ClientDelegationStatus) {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setMutating(true);
    setError(undefined);
    try {
      await updatePersonalDelegation(record.id, { status });
      await refresh();
    } catch (failure) {
      setError(failure instanceof ServiceError ? failure.message : "操作结果未确认，请刷新列表确认后再操作");
    } finally {
      mutationPending.current = false;
      setMutating(false);
    }
  }
  return (
    <section className="security-panel" aria-label="委托设置">
      <div className="panel-heading">
        <h2>委托设置</h2>
      </div>
      <Tabs
        activeKey={direction}
        onChange={(key) => setDirection(key === "incoming" ? "incoming" : "outgoing")}
        items={[
          { key: "outgoing", label: "我委托的", disabled: mutating },
          { key: "incoming", label: "委托给我的", disabled: mutating },
        ]}
      />
      <Space wrap style={{ marginBottom: 16 }}>
        <Select<StatusFilter>
          aria-label="委托状态筛选"
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ minWidth: 130 }}
          options={[
            { value: "open", label: "未结束" },
            { value: "all", label: "全部" },
            { value: "planned", label: "未开始" },
            { value: "active", label: "生效中" },
            { value: "paused", label: "暂停" },
            { value: "expired", label: "已到期" },
            { value: "ended", label: "已结束" },
          ]}
        />
        {direction === "outgoing" && (
          <Button type="primary" disabled={mutating} onClick={() => setEditing("create")}>
            新建委托
          </Button>
        )}
        <Button aria-label="刷新委托" onClick={() => void refresh()} loading={loading} disabled={mutating}>
          刷新委托
        </Button>
      </Space>
      {error && <Alert type="error" showIcon title={error} />}
      <Table<DelegationDetail>
        rowKey="id"
        loading={loading}
        dataSource={records.filter((record) => matches(record, statusFilter, Date.now()))}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: "应用", render: (_, row) => `${row.client.clientName}${row.client.isDelete ? "（已删除）" : ""}` },
          {
            title: "委托人",
            render: (_, row) =>
              `${row.delegatorName}（${row.delegatorUsername}）${row.delegatorUser.isDelete ? "（已删除）" : ""}`,
          },
          {
            title: "受托人",
            render: (_, row) =>
              `${row.delegateeName}（${row.delegateeUsername}）${row.delegateeUser.isDelete ? "（已删除）" : ""}`,
          },
          {
            title: "组织范围",
            render: (_, row) =>
              `${row.organizationScope.orgName}及下级${row.organizationScope.isDelete ? "（已删除）" : ""}`,
          },
          { title: "期间", render: (_, row) => `${row.startTime.toLocaleString()} — ${row.endTime.toLocaleString()}` },
          { title: "状态", render: (_, row) => <Tag>{lifecycle(row, Date.now())}</Tag> },
          { title: "说明", dataIndex: "description" },
          ...(direction === "outgoing"
            ? [
                {
                  title: "操作",
                  render: (_: unknown, row: DelegationDetail) =>
                    row.status === ClientDelegationStatus.Disable ? null : (
                      <Space>
                        <Button aria-label="编辑" disabled={loading || mutating} onClick={() => setEditing(row)}>
                          编辑
                        </Button>
                        <Button
                          aria-label={row.status === ClientDelegationStatus.Pause ? "恢复" : "暂停"}
                          disabled={loading || mutating}
                          onClick={() =>
                            void changeStatus(
                              row,
                              row.status === ClientDelegationStatus.Pause
                                ? ClientDelegationStatus.Enable
                                : ClientDelegationStatus.Pause,
                            )
                          }
                        >
                          {row.status === ClientDelegationStatus.Pause ? "恢复" : "暂停"}
                        </Button>
                        <Popconfirm
                          title="结束后不能恢复，确认结束此委托？"
                          okText="确认结束"
                          cancelText="取消"
                          onConfirm={() => changeStatus(row, ClientDelegationStatus.Disable)}
                        >
                          <Button aria-label="结束" danger disabled={loading || mutating}>
                            结束
                          </Button>
                        </Popconfirm>
                      </Space>
                    ),
                },
              ]
            : []),
        ]}
      />
      {editing && (
        <DelegationEditor
          record={editing === "create" ? undefined : editing}
          onCancel={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await refresh();
          }}
        />
      )}
    </section>
  );
}
