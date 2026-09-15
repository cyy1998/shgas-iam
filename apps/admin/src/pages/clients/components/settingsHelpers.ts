import { Modal } from 'antd';

export function confirmClientSettingAction(title: string, content: string) {
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      title,
      content,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

export type ClientCommittedFailureKind =
  'mutation' | 'rotation' | 'configuration';
