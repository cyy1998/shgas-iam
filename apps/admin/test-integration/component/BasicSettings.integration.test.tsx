import BasicSettings from '@admin/pages/clients/components/BasicSettings';
import type { ClientDetailVo } from '@admin/services/client';
import { ClientStatus } from '@iam/contracts';
import { Modal } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '~admin/test/render';
import { adminClientDetail } from '../../test/mocks/fixtures';

const updateClient = vi.hoisted(() => vi.fn());
const updateClientStatus = vi.hoisted(() => vi.fn());
const client: ClientDetailVo = {
  ...adminClientDetail,
  id: 1,
  isDelete: false,
  updateTime: '2026-01-03T08:00:00.000Z',
  oidcEnabled: true,
  oidcConfig: null,
  customSsoConfig: null,
};

vi.mock('@admin/services/client', () => ({
  deleteClient: vi.fn(),
  updateClient,
  updateClientStatus,
}));

describe('BasicSettings client status updates', () => {
  beforeEach(() => {
    updateClient.mockResolvedValue({ changed: true, result: null });
    updateClientStatus.mockResolvedValue({ changed: true, result: null });
  });

  afterEach(() => {
    Modal.destroyAll();
  });

  function renderSettings() {
    return render(
      <BasicSettings
        client={client}
        onDirtyChange={vi.fn()}
        onMutated={vi.fn().mockResolvedValue(undefined)}
        onDeleted={vi.fn()}
        onCommitted={vi.fn().mockResolvedValue(undefined)}
      />,
    );
  }

  async function selectStatus(
    user: ReturnType<typeof renderSettings>['user'],
    label: string,
  ) {
    await user.click(screen.getByRole('combobox', { name: '全局状态' }));
    await user.click(await screen.findByTitle(label));
    await user.click(screen.getByRole('button', { name: '更新全局状态' }));
  }

  it.each([false, true])(
    'submits the generic secret only when explicitly edited: %s',
    async (editSecret) => {
      const { user } = renderSettings();
      const name = screen.getByLabelText('应用名称');
      await user.clear(name);
      await user.type(name, '新的应用名称');
      if (editSecret) {
        const secret = screen.getByLabelText('通用应用密钥');
        await user.clear(secret);
        await user.type(secret, 'explicit-new-secret');
      }
      await user.click(screen.getByRole('button', { name: '保存基础信息' }));
      await waitFor(() => expect(updateClient).toHaveBeenCalledTimes(1));
      expect(updateClient.mock.calls[0][1]).toMatchObject({
        clientName: '新的应用名称',
      });
      if (editSecret)
        expect(updateClient.mock.calls[0][1]).toHaveProperty(
          'clientSecret',
          'explicit-new-secret',
        );
      else
        expect(updateClient.mock.calls[0][1]).not.toHaveProperty(
          'clientSecret',
        );
    },
  );

  it('switches to maintenance without a second confirmation', async () => {
    const { user } = renderSettings();

    await selectStatus(user, '维护中');

    expect(screen.queryAllByText('更新应用全局状态？')).toHaveLength(0);
    await waitFor(() => {
      expect(updateClientStatus).toHaveBeenCalledWith(
        'iam-admin',
        ClientStatus.Maintenance,
      );
    });
  });

  it('still requires confirmation before disabling a client', async () => {
    const { user } = renderSettings();

    await selectStatus(user, '停用');

    expect(updateClientStatus).not.toHaveBeenCalled();
    expect(screen.getAllByText('更新应用全局状态？')).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: '确 定' }));

    await waitFor(() => {
      expect(updateClientStatus).toHaveBeenCalledWith(
        'iam-admin',
        ClientStatus.Disable,
      );
    });
  });
});
