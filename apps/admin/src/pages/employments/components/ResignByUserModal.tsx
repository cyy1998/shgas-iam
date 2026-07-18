import { apiClient } from '@admin/lib/api-client';
import { resignUser } from '@admin/services/employment';
import { message, Modal, Select } from 'antd';
import { useState } from 'react';

type UserOption = { label: string; value: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function ResignByUserDialog({
  open,
  onClose,
  onSuccess,
}: Props) {
  const [selected, setSelected] = useState<UserOption | null>(null);
  const [options, setOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSearch = async (text: string) => {
    if (!text) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.admin.user.search.query({
        pageNum: 1,
        pageSize: 20,
        conditions: {
          fuzzyConditions: { text },
          exactConditions: {},
        },
      });
      const result = res.result as Array<{ username: string; name: string }>;
      setOptions(
        result.map((u) => ({
          label: `${u.name} (${u.username})`,
          value: u.username,
          name: u.name,
        })),
      );
    } catch (err) {
      message.error(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const onOk = async () => {
    if (!selected) {
      message.warning('请先选择用户');
      return;
    }
    setSubmitting(true);
    try {
      await resignUser(selected.value);
      message.success(`${selected.name} 已离职`);
      onSuccess?.();
      onClose();
      setSelected(null);
      setOptions([]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '离职失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="按用户离职"
      open={open}
      onCancel={() => {
        setSelected(null);
        setOptions([]);
        onClose();
      }}
      onOk={onOk}
      okText="确认离职"
      okType="danger"
      okButtonProps={{ loading: submitting, disabled: !selected }}
      destroyOnHidden
      width={480}
    >
      <p style={{ marginBottom: 12 }}>
        选中用户后，该用户名下所有活跃雇佣将被结束，且账号状态置为「结束」。此操作不可撤销。
      </p>
      <Select
        showSearch
        placeholder="输入工号/姓名搜索"
        style={{ width: '100%' }}
        filterOption={false}
        loading={loading}
        onSearch={onSearch}
        options={options.map((o) => ({ label: o.label, value: o.value }))}
        onChange={(v) => {
          const found = options.find((o) => o.value === v);
          setSelected(found ?? null);
        }}
        value={selected?.value}
      />
    </Modal>
  );
}
