import { resetUserPassword } from '@admin/services/user';
import { message, Modal } from 'antd';

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
          content: (
            <div>
              <p>请将下列密码复制并转交给用户，关闭后不再显示：</p>
              <pre style={{ fontSize: 16, background: '#f5f5f5', padding: 8 }}>
                {newPassword}
              </pre>
            </div>
          ),
          okText: '我已复制',
        });
      } catch (err) {
        message.error(err instanceof Error ? err.message : '重置失败');
      }
    },
  });
}
