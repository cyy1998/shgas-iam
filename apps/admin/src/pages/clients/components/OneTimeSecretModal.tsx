import { Alert, Button, Modal, Space, Typography } from 'antd';
import { useEffect } from 'react';

type Props = {
  protocol: 'Custom SSO' | 'OIDC';
  secret: string | null;
  onConfirmed: () => void;
  onPendingChange: (pending: boolean) => void;
};

export default function OneTimeSecretModal({
  protocol,
  secret,
  onConfirmed,
  onPendingChange,
}: Props) {
  useEffect(() => {
    onPendingChange(secret !== null);
    return () => onPendingChange(false);
  }, [onPendingChange, secret]);

  useEffect(() => {
    if (secret === null) return undefined;
    const protectOneTimeSecret = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectOneTimeSecret);
    return () =>
      window.removeEventListener('beforeunload', protectOneTimeSecret);
  }, [secret]);

  return (
    <Modal
      title={`${protocol} secret 仅显示一次`}
      open={secret !== null}
      closable={false}
      keyboard={false}
      mask={{ closable: false }}
      destroyOnHidden
      footer={
        <Button type="primary" onClick={onConfirmed}>
          我已安全保存，关闭
        </Button>
      }
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="关闭后明文会立即从页面状态中销毁，无法再次读取。"
        />
        {secret !== null && (
          <Typography.Paragraph
            code
            copyable={{ text: secret }}
            data-testid={`${protocol.toLowerCase().replaceAll(' ', '-')}-secret`}
          >
            {secret}
          </Typography.Paragraph>
        )}
      </Space>
    </Modal>
  );
}
