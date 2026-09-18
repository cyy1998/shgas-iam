import type { SessionListItem } from '@admin/services/session-management';
import { Space, Tag, Typography } from 'antd';

const accountStatusDisplay = {
  normal: { color: 'success', text: '正常' },
  paused: { color: 'warning', text: '暂停' },
  ended: { color: 'default', text: '结束' },
  deleted: { color: 'error', text: '已删除' },
  unknown: { color: 'default', text: '未知' },
} as const;

type UserSummaryProps = {
  accountStatus: SessionListItem['user']['accountStatus'];
  name: string | null;
  username: string | null;
};

export default function UserSummary(props: UserSummaryProps) {
  const { accountStatus, name, username } = props;
  const status = accountStatusDisplay[accountStatus];

  return (
    <Space orientation="vertical" size={2}>
      <Space size={8}>
        <Typography.Text>{name ?? '未知用户'}</Typography.Text>
        <Typography.Text type="secondary">
          {username ?? '无用户名'}
        </Typography.Text>
      </Space>
      <Tag color={status.color}>{status.text}</Tag>
    </Space>
  );
}
