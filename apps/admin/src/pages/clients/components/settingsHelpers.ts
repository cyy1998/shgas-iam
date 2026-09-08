import { ClientStatus } from '@iam/contracts';
import { Modal } from 'antd';

export function canEnableClientProtocol(status: ClientStatus) {
  return status === ClientStatus.Enable || status === ClientStatus.Maintenance;
}

export function normalizeClientSettingList(values: string[] | undefined) {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ];
}

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
