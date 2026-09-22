import PositionsPage from '@admin/pages/positions';
import { ConfigProvider, message, Modal } from 'antd';
import { http, HttpResponse } from 'msw';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminPositionSearchResult } from '~admin/test/mocks/fixtures';
import { server } from '~admin/test/mocks/server';
import { cleanup, render, screen, waitFor, within } from '~admin/test/render';

vi.mock('@admin/constants/config', () => ({
  API_PREFIX: 'http://localhost',
  SSO_CLIENT_CODE: 'iam-admin',
}));

// jsdom does not finish CSS transitions; retain the real form and table behavior.
vi.mock('@ant-design/pro-components', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ant-design/pro-components')>();
  const ModalForm = (props: ComponentProps<typeof actual.ModalForm>) => (
    <actual.ModalForm
      {...props}
      modalProps={{
        ...props.modalProps,
        transitionName: '',
        maskTransitionName: '',
      }}
    />
  );
  return { ...actual, ModalForm, default: { ...actual, ModalForm } };
});

ConfigProvider.config({
  holderRender: (children) => (
    <ConfigProvider theme={{ token: { motion: false } }}>
      {children}
    </ConfigProvider>
  ),
});
function mutationResponse(procedure: string, changed: boolean) {
  const requests: unknown[] = [];
  server.use(
    http.post(`*/rpc/admin.position.${procedure}`, async ({ request }) => {
      requests.push(await request.json());
      return HttpResponse.json([
        {
          result: {
            data: {
              changed,
              result:
                procedure === 'create'
                  ? adminPositionSearchResult.result[0]
                  : null,
            },
          },
        },
      ]);
    }),
  );
  return requests;
}

afterEach(async () => {
  cleanup();
  message.destroy();
  Modal.destroyAll();
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
});

describe('PositionsPage mutation results through the position service', () => {
  it('creates a position, closes the form and refreshes the list', async () => {
    const requests = mutationResponse('create', true);
    const searches = vi.fn(() =>
      HttpResponse.json([{ result: { data: adminPositionSearchResult } }]),
    );
    server.use(http.get('*/rpc/admin.position.search', searches));
    const { user } = render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <PositionsPage />
      </ConfigProvider>,
    );
    await screen.findByText(adminPositionSearchResult.result[0].posName);
    await user.click(screen.getByRole('button', { name: '+ 新建岗位' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getAllByRole('textbox')[0], '  NEW  ');
    await user.type(dialog.getAllByRole('textbox')[1], '  新岗位  ');
    await user.click(dialog.getByRole('button', { name: '确 定' }));
    expect(await screen.findByText('创建成功')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(requests).toEqual([
      { '0': { posCode: 'NEW', posName: '新岗位', status: 1 } },
    ]);
    await waitFor(() => expect(searches.mock.calls.length).toBeGreaterThan(1));
  });

  it('validates padded position boundaries after normalization', async () => {
    const requests = mutationResponse('create', true);
    const { user } = render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <PositionsPage />
      </ConfigProvider>,
    );
    await user.click(
      await screen.findByRole('button', { name: '+ 新建岗位' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(
      dialog.getAllByRole('textbox')[0],
      `  ${'C'.repeat(64)}  `,
    );
    await user.type(
      dialog.getAllByRole('textbox')[1],
      `  ${'N'.repeat(128)}  `,
    );
    await user.click(dialog.getByRole('button', { name: '确 定' }));

    expect(await screen.findByText('创建成功')).toBeInTheDocument();
    expect(requests).toEqual([
      {
        '0': {
          posCode: 'C'.repeat(64),
          posName: 'N'.repeat(128),
          status: 1,
        },
      },
    ]);
  });

  it.each([
    {
      scenario: 'blank values',
      posCode: '   ',
      posName: '   ',
      codeError: '请输入岗位编码',
      nameError: '请输入岗位名称',
    },
    {
      scenario: 'overlong values',
      posCode: 'C'.repeat(65),
      posName: 'N'.repeat(129),
      codeError: '岗位编码最多64个字符',
      nameError: '岗位名称最多128个字符',
    },
  ])(
    'keeps $scenario in the form without sending a request',
    async ({ posCode, posName, codeError, nameError }) => {
      const requests = mutationResponse('create', true);
      const { user } = render(
        <ConfigProvider theme={{ token: { motion: false } }}>
          <PositionsPage />
        </ConfigProvider>,
      );
      await user.click(
        await screen.findByRole('button', { name: '+ 新建岗位' }),
      );
      const dialog = within(await screen.findByRole('dialog'));
      await user.type(dialog.getAllByRole('textbox')[0], posCode);
      await user.type(dialog.getAllByRole('textbox')[1], posName);
      await user.click(dialog.getByRole('button', { name: '确 定' }));
      expect(await dialog.findByText(codeError)).toBeInTheDocument();
      expect(await dialog.findByText(nameError)).toBeInTheDocument();
      expect(requests).toHaveLength(0);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    },
  );

  it.each([true, false])(
    'reports edit changed=%s without losing successful form completion',
    async (changed) => {
      const requests = mutationResponse('update', changed);
      const { user } = render(
        <ConfigProvider theme={{ token: { motion: false } }}>
          <PositionsPage />
        </ConfigProvider>,
      );
      const edit = await screen.findAllByText('编辑');
      await user.click(edit[0]);
      const dialog = within(await screen.findByRole('dialog'));
      await user.click(dialog.getByRole('button', { name: '确 定' }));
      expect(
        await screen.findByText(changed ? '更新成功' : '无需修改'),
      ).toBeInTheDocument();
      expect(requests).toHaveLength(1);
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    },
  );

  it.each([true, false])('reports status changed=%s', async (changed) => {
    const requests = mutationResponse('updateStatus', changed);
    const { user } = render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <PositionsPage />
      </ConfigProvider>,
    );
    await screen.findAllByText('编辑');
    const links = screen.getAllByText('状态', { selector: 'a' });
    await user.hover(links[0]);
    await user.click(await screen.findByText('切为「暂停」'));
    expect(
      await screen.findByText(changed ? '状态已更新' : '无需修改'),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });

  it('omits untouched initial status when saving only a name from a stale edit form', async () => {
    const requests = mutationResponse('update', true);
    const { user } = render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <PositionsPage />
      </ConfigProvider>,
    );
    await user.click((await screen.findAllByText('编辑'))[0]);
    const dialog = within(await screen.findByRole('dialog'));
    await user.clear(dialog.getAllByRole('textbox')[1]);
    await user.type(dialog.getAllByRole('textbox')[1], '  修改后的岗位  ');
    await user.click(dialog.getByRole('button', { name: '确 定' }));
    expect(await screen.findByText('更新成功')).toBeInTheDocument();
    expect(requests).toEqual([
      {
        '0': {
          posCode: adminPositionSearchResult.result[0].posCode,
          data: {
            posName: '修改后的岗位',
            description:
              adminPositionSearchResult.result[0].description || null,
          },
        },
      },
    ]);
  });

  it('includes an explicitly changed status in the edit patch', async () => {
    const requests = mutationResponse('update', true);
    const { user } = render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <PositionsPage />
      </ConfigProvider>,
    );
    await user.click((await screen.findAllByText('编辑'))[0]);
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('combobox'));
    await user.click(
      await screen.findByText('暂停', {
        selector: '.ant-select-item-option-content',
      }),
    );
    await user.click(dialog.getByRole('button', { name: '确 定' }));
    expect(await screen.findByText('更新成功')).toBeInTheDocument();
    expect(requests).toMatchObject([{ '0': { data: { status: 2 } } }]);
  });

  it('confirms deletion and reports a committed change', async () => {
    const requests = mutationResponse('delete', true);
    const { user } = render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <PositionsPage />
      </ConfigProvider>,
    );
    await user.click((await screen.findAllByText('删除'))[0]);
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: '确 定' }));
    expect(await screen.findByText('已删除')).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });

  it('keeps a failed edit open and never automatically replays it', async () => {
    const mutate = vi.fn(() =>
      HttpResponse.json(
        [
          {
            error: {
              message: '岗位不存在',
              code: -32004,
              data: { code: 'NOT_FOUND', httpStatus: 404 },
            },
          },
        ],
        { status: 404 },
      ),
    );
    server.use(http.post('*/rpc/admin.position.update', mutate));
    const { user } = render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <PositionsPage />
      </ConfigProvider>,
    );
    await user.click((await screen.findAllByText('编辑'))[0]);
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: '确 定' }));
    expect(await screen.findByText('岗位不存在')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('更新成功')).not.toBeInTheDocument();
  });
});
