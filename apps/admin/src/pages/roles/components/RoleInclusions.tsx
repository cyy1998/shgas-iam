import StatusTag from "@admin/components/StatusTag";
import { requestClientOptions } from "@admin/pages/roles/role-selectors";
import { type RoleDetailVo, searchRoles } from "@admin/services/role";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { ProFormSelect } from "@ant-design/pro-components";
import { roleStatusToString, roleTypeToString } from "@iam/contracts";
import { Button, Col, Form, message, Row, Select, Space, Spin, Typography } from "antd";
import { type MouseEvent, useEffect, useState } from "react";

type RoleEndpoint = RoleDetailVo["members"][number];
type MemberSearch = { clientCode?: string; text: string; pageNum: number };
type RoleSearchPage = Awaited<ReturnType<typeof searchRoles>>;

const MEMBER_PAGE_SIZE = 30;

function ownership(role: RoleEndpoint) {
  return role.client ? `${role.client.clientName}（${role.client.clientCode}）` : roleTypeToString[role.roleType];
}

export function RoleInclusionList({
  endpoints,
  onRemove,
}: {
  endpoints: readonly RoleEndpoint[];
  onRemove?: (id: number) => void;
}) {
  if (endpoints.length === 0) return <Typography.Text type="secondary">暂无角色</Typography.Text>;
  return (
    <ul>
      {endpoints.map((role) => (
        <li key={role.id}>
          <Space wrap size={8}>
            <Typography.Text>{role.roleName}</Typography.Text>
            <Typography.Text type="secondary">
              {role.roleCode} · {ownership(role)}
            </Typography.Text>
            <StatusTag domain="role" status={role.status} />
            {onRemove && (
              <Button type="link" size="small" aria-label={`移除 ${role.roleName}`} onClick={() => onRemove(role.id)}>
                移除
              </Button>
            )}
          </Space>
        </li>
      ))}
    </ul>
  );
}

export function RoleInclusionEditor({
  containerId,
  members,
  onChange,
}: {
  containerId: number;
  members: RoleEndpoint[];
  onChange: (members: RoleEndpoint[]) => void;
}) {
  const [query, setQuery] = useState<MemberSearch>({ text: "", pageNum: 1 });
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState<{ query: MemberSearch; page: RoleSearchPage | null }>();
  const loading = response?.query !== query;
  const results = loading ? undefined : response?.page;
  const pages = response?.page?.pages ?? 0;
  const memberIds = new Set(members.map(({ id }) => id));

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const page = await searchRoles({
          pageNum: query.pageNum,
          pageSize: MEMBER_PAGE_SIZE,
          conditions: {
            fuzzyConditions: { text: query.text.trim() || undefined },
            exactConditions: { clientCode: query.clientCode },
          },
        });
        if (!cancelled) setResponse({ query, page });
      } catch (error) {
        if (cancelled) return;
        setResponse({ query, page: null });
        message.error(error instanceof Error ? error.message : "成员角色查询失败");
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const options = results?.result
    .filter((role) => role.id !== containerId)
    .map((role) => ({
      value: role.id,
      label: `${role.roleName}（${role.roleCode}） · ${ownership(role)} · ${roleStatusToString[role.status]}`,
      disabled: memberIds.has(role.id),
      role,
    }));

  function keepPickerOpen(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function changePage(offset: number) {
    setQuery((current) => ({ ...current, pageNum: current.pageNum + offset }));
    setOpen(true);
  }

  return (
    <section aria-label="直接成员">
      <Typography.Title level={5}>直接成员</Typography.Title>
      <RoleInclusionList endpoints={members} onRemove={(id) => onChange(members.filter((role) => role.id !== id))} />
      <Row gutter={12}>
        <Col xs={24} sm={10}>
          <ProFormSelect
            label="筛选成员应用"
            request={requestClientOptions}
            debounceTime={300}
            fieldProps={{
              "aria-label": "筛选成员应用",
              placeholder: "全部应用",
              allowClear: true,
              showSearch: true,
              filterOption: false,
              value: query.clientCode,
              onChange: (clientCode: string | undefined) =>
                setQuery((current) => ({ ...current, clientCode, pageNum: 1 })),
            }}
          />
        </Col>
        <Col xs={24} sm={14}>
          <Form.Item label="添加直接成员">
            <Space.Compact block>
              <Select
                aria-label="添加直接成员"
                placeholder="输入角色编码或名称"
                popupMatchSelectWidth={false}
                style={{ flex: 1, minWidth: 0 }}
                value={null}
                open={open}
                onOpenChange={setOpen}
                options={options}
                loading={loading}
                notFoundContent={loading ? <Spin size="small" /> : "暂无匹配角色"}
                showSearch={{
                  searchValue: query.text,
                  filterOption: false,
                  onSearch: (text) => {
                    // Closing the menu to focus a page button clears the Select input by default.
                    if (!open && text === "") return;
                    setQuery((current) => (current.text === text ? current : { ...current, text, pageNum: 1 }));
                  },
                }}
                onSelect={(_value, { role }) => {
                  onChange([...members, role]);
                  setQuery((current) => ({ ...current, text: "", pageNum: 1 }));
                }}
              />
              {(pages > 1 || query.pageNum > 1) && (
                <>
                  <Button
                    aria-label="成员结果上一页"
                    title="上一页"
                    icon={<LeftOutlined />}
                    disabled={loading || query.pageNum === 1}
                    onMouseDown={keepPickerOpen}
                    onClick={() => changePage(-1)}
                  />
                  <Button
                    aria-label="成员结果下一页"
                    title="下一页"
                    icon={<RightOutlined />}
                    disabled={loading || query.pageNum >= pages}
                    onMouseDown={keepPickerOpen}
                    onClick={() => changePage(1)}
                  />
                </>
              )}
            </Space.Compact>
          </Form.Item>
        </Col>
      </Row>
      <Typography.Text type="secondary">
        可加入暂停或停用的角色。成员启用后，已获授此组合的任职可能继承该角色及其有效成员。
      </Typography.Text>
    </section>
  );
}
