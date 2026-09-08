import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import { resignUser } from '@admin/services/employment';
import { searchUsers } from '@admin/services/user';
import { message, Modal, Select } from 'antd';
import { useState } from 'react';

type UserOption = { label: string; value: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onCommitted: (error: AdminMutationCommittedError) => Promise<void> | void;
};

export default function ResignByUserDialog({
  open,
  onClose,
  onSuccess,
  onCommitted,
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
      const res = await searchUsers({
        pageNum: 1,
        pageSize: 20,
        conditions: {
          fuzzyConditions: { text },
          exactConditions: {},
        },
      });
      setOptions(
        res.result.map((u) => ({
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
      const outcome = await resignUser(selected.value);
      if (outcome.changed) message.success('离职已完成');
      else message.info('已处于离职状态，无需修改');
      onSuccess?.();
      onClose();
      setSelected(null);
      setOptions([]);
    } catch (err) {
      if (err instanceof AdminMutationCommittedError) {
        setSelected(null);
        setOptions([]);
        onClose();
        await onCommitted(err);
        return;
      }
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
        选中用户后，该用户名下所有活跃任职及其开放责任任命都会结束，且账号状态置为「结束」。此操作不可撤销。
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
