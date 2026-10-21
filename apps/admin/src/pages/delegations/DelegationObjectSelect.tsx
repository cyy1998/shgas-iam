import {
  type DelegationSelectorInput,
  selectDelegationClients,
  selectDelegationOrganizations,
  selectDelegationUsers,
} from "@admin/services/delegation";
import { Select } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

export default function DelegationObjectSelect({
  kind,
  purpose,
  value,
  onChange,
  id,
}: {
  kind: "user" | "client" | "organization";
  purpose: DelegationSelectorInput["purpose"];
  value?: string | number;
  onChange?: (value: string | number | undefined) => void;
  id?: string;
}) {
  const [options, setOptions] = useState<{ value: string | number; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(
    async (search?: string) => {
      const request = ++sequence.current;
      setLoading(true);
      setFailed(false);
      try {
        const result =
          kind === "user"
            ? (await selectDelegationUsers({ search, purpose })).map((row) => ({
                value: row.username,
                label: `${row.name}（${row.username}）`,
              }))
            : kind === "client"
              ? (await selectDelegationClients({ search, purpose })).map((row) => ({
                  value: row.id,
                  label: `${row.clientName}（${row.clientCode}）`,
                }))
              : (await selectDelegationOrganizations({ search, purpose })).map((row) => ({
                  value: row.orgCode,
                  label: `${row.orgName}（${row.orgCode}）`,
                }));
        if (request === sequence.current) setOptions(result);
      } catch {
        if (request === sequence.current) {
          setOptions([]);
          setFailed(true);
        }
      } finally {
        if (request === sequence.current) setLoading(false);
      }
    },
    [kind, purpose],
  );
  // A new field requests its own safe selector; stale searches never replace a later result.
  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);
  return (
    <Select
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      loading={loading}
      showSearch={{
        filterOption: false,
        onSearch: (text) => {
          void load(text);
        },
      }}
      allowClear
      style={{ width: "100%", minWidth: 0 }}
      placeholder="输入名称或编码搜索"
      notFoundContent={failed ? "加载失败，请重新搜索" : undefined}
    />
  );
}
