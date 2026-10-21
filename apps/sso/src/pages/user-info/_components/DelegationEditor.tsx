import {
  createPersonalDelegation,
  type DelegationClientChoice,
  type DelegationDetail,
  type DelegationOrganizationChoice,
  type DelegationUserChoice,
  getDelegationClients,
  getDelegationOrganizations,
  getDelegationUsers,
  updatePersonalDelegation,
} from "@sso/services/delegation";
import { ServiceError } from "@sso/utils/request";
import { Alert, DatePicker, Form, Input, Modal, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useRef, useState } from "react";

type Values = {
  clientId: number;
  delegateeUsername: string;
  orgCode: string;
  startTime: Dayjs;
  endTime: Dayjs;
  description?: string;
};
export default function DelegationEditor({
  record,
  onCancel,
  onSaved,
}: {
  record?: DelegationDetail;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form] = Form.useForm<Values>();
  const [clients, setClients] = useState<DelegationClientChoice[]>([]);
  const [users, setUsers] = useState<DelegationUserChoice[]>([]);
  const [organizations, setOrganizations] = useState<DelegationOrganizationChoice[]>([]);
  const [ready, setReady] = useState(Boolean(record));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const searches = useRef({ clients: 0, users: 0, organizations: 0 });
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    if (record)
      return () => {
        active.current = false;
      };
    void Promise.all([getDelegationClients(), getDelegationUsers(), getDelegationOrganizations()])
      .then(([applications, people, scopes]) => {
        if (!active.current) return;
        setClients(applications);
        setUsers(people);
        setOrganizations(scopes);
        setReady(true);
      })
      .catch((failure) => {
        if (active.current) setError(failure instanceof Error ? failure.message : "选择列表加载失败");
      });
    return () => {
      active.current = false;
    };
  }, [record]);
  async function search(kind: keyof typeof searches.current, value: string) {
    const version = ++searches.current[kind];
    try {
      if (kind === "clients") {
        const result = await getDelegationClients(value);
        if (active.current && version === searches.current[kind]) setClients(result);
      }
      if (kind === "users") {
        const result = await getDelegationUsers(value);
        if (active.current && version === searches.current[kind]) setUsers(result);
      }
      if (kind === "organizations") {
        const result = await getDelegationOrganizations(value);
        if (active.current && version === searches.current[kind]) setOrganizations(result);
      }
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : "选择列表加载失败");
    }
  }
  async function submit(values: Values) {
    if (saving || !ready) return;
    const startTime =
      record && values.startTime.isSame(record.startTime, "minute")
        ? record.startTime
        : values.startTime.startOf("minute").toDate();
    const endTime =
      record && values.endTime.isSame(record.endTime, "minute")
        ? record.endTime
        : values.endTime.startOf("minute").toDate();
    if (!(startTime < endTime)) {
      setError("结束时间必须晚于开始时间");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      if (record)
        await updatePersonalDelegation(record.id, { startTime, endTime, description: values.description ?? null });
      else await createPersonalDelegation({ ...values, startTime, endTime });
      await onSaved();
    } catch (failure) {
      setError(failure instanceof ServiceError ? failure.message : "操作结果未确认，请刷新列表确认后再操作");
    } finally {
      if (active.current) setSaving(false);
    }
  }
  return (
    <Modal
      open
      title={record ? "编辑委托" : "新建委托"}
      okText="保存委托"
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: !ready }}
      onCancel={() => {
        if (!saving) onCancel();
      }}
      onOk={() => form.submit()}
    >
      {error && <Alert showIcon type="error" title={error} />}
      {record && (
        <p>
          {record.client.clientName} · {record.delegateeName}（{record.delegateeUsername}） ·{" "}
          {record.organizationScope.orgName}及下级
        </p>
      )}
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        initialValues={{
          startTime: dayjs(record?.startTime ?? new Date()),
          endTime: dayjs(record?.endTime ?? new Date(Date.now() + 86_400_000)),
          description: record?.description ?? undefined,
        }}
      >
        {!record && (
          <>
            <Form.Item name="clientId" label="应用" rules={[{ required: true, message: "请选择应用" }]}>
              <Select
                showSearch
                filterOption={false}
                onSearch={(value) => void search("clients", value)}
                loading={!ready}
                options={clients.map((client) => ({
                  value: client.id,
                  label: `${client.clientName}（${client.clientCode}）`,
                }))}
              />
            </Form.Item>
            <Form.Item name="delegateeUsername" label="受托人" rules={[{ required: true, message: "请选择受托人" }]}>
              <Select
                showSearch
                filterOption={false}
                onSearch={(value) => void search("users", value)}
                loading={!ready}
                options={users.map((user) => ({ value: user.username, label: `${user.name}（${user.username}）` }))}
              />
            </Form.Item>
            <Form.Item
              name="orgCode"
              label="组织范围"
              rules={[{ required: true, message: "请选择组织" }]}
              extra="包括所选组织及当前、以后新增的下级组织"
            >
              <Select
                showSearch
                filterOption={false}
                onSearch={(value) => void search("organizations", value)}
                loading={!ready}
                options={organizations.map((org) => ({
                  value: org.orgCode,
                  label: `${org.orgName}（${org.orgCode}）`,
                }))}
              />
            </Form.Item>
          </>
        )}
        <Form.Item name="startTime" label="开始时间" rules={[{ required: true, message: "请选择开始时间" }]}>
          <DatePicker
            showTime={{ format: "HH:mm" }}
            format="YYYY-MM-DD HH:mm"
            placeholder="请选择开始时间"
            style={{ width: "100%" }}
          />
        </Form.Item>
        <Form.Item name="endTime" label="结束时间" rules={[{ required: true, message: "请选择结束时间" }]}>
          <DatePicker
            showTime={{ format: "HH:mm" }}
            format="YYYY-MM-DD HH:mm"
            placeholder="请选择结束时间"
            style={{ width: "100%" }}
          />
        </Form.Item>
        <Form.Item name="description" label="说明">
          <Input.TextArea maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
