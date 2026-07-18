import { resetUserPassword } from '@admin/services/user';
import { message, Modal, Space, Typography } from 'antd';

type Args = {
  username: string;
  name?: string;
};

export function confirmResetPassword({ username, name }: Args) {
  Modal.confirm({
    title: `重置 ${name ?? username} 的密码？`,
    content: '确认后将生成新的随机密码，请做好交接准备。',
    okType: 'danger',
    okText: '重置',
    onOk: async () => {
      try {
        const newPassword = await resetUserPassword(username);
        Modal.info({
          title: '新密码已生成',
          width: 620,
          content: (
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Typography.Text>
                请将下列密码复制并转交给用户，关闭后不再显示：
              </Typography.Text>
              <Typography.Paragraph
                code
                copyable={{ text: newPassword }}
                style={{
                  marginBottom: 0,
                  padding: '8px 12px',
                  fontSize: 16,
                  lineHeight: 1.6,
                  wordBreak: 'break-all',
                }}
              >
                {newPassword}
              </Typography.Paragraph>
            </Space>
          ),
          okText: '我已复制',
        });
      } catch (err) {
        message.error(err instanceof Error ? err.message : '重置失败');
      }
    },
  });
}
