import UsersPage from '@admin/pages/users';
import { ApiErrorCode } from '@iam/contracts';
import { ConfigProvider, message, Modal } from 'antd';
import { http, HttpResponse } from 'msw';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminUserDetail,
  adminUserSearchResult,
} from '~admin/test/mocks/fixtures';
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

function mutation(procedure: string, data: unknown, committed = false) {
  const requests: unknown[] = [];
  server.use(
    http.post(`*/rpc/admin.user.${procedure}`, async ({ request }) => {
      requests.push(await request.json());
      return committed
        ? HttpResponse.json(
            [
              {
                error: {
                  message: '后续失败',
                  code: -32603,
                  data: {
                    code: 'INTERNAL_SERVER_ERROR',
                    httpStatus: 500,
                    serviceCode: ApiErrorCode.AdminMutationCommitted,
                  },
                },
              },
            ],
            { status: 500 },
          )
        : HttpResponse.json([{ result: { data } }]);
    }),
  );
  return requests;
}
function renderPage() {
  const details = vi.fn((_info: { request: Request }) =>
    HttpResponse.json([{ result: { data: adminUserDetail } }]),
  );
  server.use(http.get('*/rpc/admin.user.detail', details));
  const view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <UsersPage />
    </ConfigProvider>,
  );
  return { ...view, details };
}
async function openEdit(user: ReturnType<typeof render>['user']) {
  await user.click((await screen.findAllByText('查看'))[0]);
  await user.click(await screen.findByRole('button', { name: '编 辑' }));
  return within(await screen.findByRole('dialog', { name: '编辑用户' }));
}
afterEach(async () => {
  cleanup();
  message.destroy();
  Modal.destroyAll();
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
});

describe('UsersPage mutation outcomes', () => {
  it('blocks an empty profile submission without sending stale fields', async () => {
    const requests = mutation('update', { changed: false, result: null });
    const { user } = renderPage();
    const form = await openEdit(user);
    await user.click(form.getByRole('button', { name: '确 定' }));
    expect(
      await screen.findByText('请先编辑需要保存的字段'),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(0);
    expect(
      screen.getByRole('dialog', { name: '编辑用户' }),
    ).toBeInTheDocument();
  });
  it.each([true, false])(
    'saves only edited fields and reports changed=%s',
    async (changed) => {
      const requests = mutation('update', { changed, result: null });
      const { user } = renderPage();
      const form = await openEdit(user);
      await user.clear(form.getByRole('textbox', { name: '姓名' }));
      await user.type(
        form.getByRole('textbox', { name: '姓名' }),
        changed ? '新姓名' : adminUserDetail.name,
      );
      await user.click(form.getByRole('button', { name: '确 定' }));
      expect(
        await screen.findByText(changed ? '更新成功' : '无需修改'),
      ).toBeInTheDocument();
      expect(requests).toEqual([
        {
          '0': {
            username: adminUserDetail.username,
            data: { name: changed ? '新姓名' : adminUserDetail.name },
          },
        },
      ]);
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: '编辑用户' }),
        ).not.toBeInTheDocument(),
      );
    },
  );
  it('reads the created resource and displays the returned initial password', async () => {
    const requests = mutation('create', {
      changed: true,
      result: {
        username: 'created-user',
        user: { username: 'created-user' },
        generatedPassword: 'Initial123!',
      },
    });
    const { user, details } = renderPage();
    await screen.findByText(adminUserSearchResult.result[0].name);
    await user.click(screen.getByRole('button', { name: '+ 新建用户' }));
    const form = within(
      await screen.findByRole('dialog', { name: '新建用户' }),
    );
    await user.type(
      form.getByRole('textbox', { name: '用户名' }),
      'submitted-user',
    );
    await user.type(form.getByRole('textbox', { name: '姓名' }), '新用户');
    await user.click(form.getAllByRole('combobox')[0]);
    await user.click(
      await screen.findByText('正式员工', {
        selector: '.ant-select-item-option-content',
      }),
    );
    await user.click(form.getByRole('button', { name: '确 定' }));
    expect(await screen.findByText('Initial123!')).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    await waitFor(() => expect(details).toHaveBeenCalledTimes(1));
    const detailRequest = details.mock.calls[0][0];
    expect(decodeURIComponent(detailRequest.request.url)).toContain(
      'created-user',
    );
  });
  it.each([false, true])(
    'refreshes committed creation with explicit password=%s and explains missing generated credentials',
    async (explicitPassword) => {
      const requests = mutation('create', null, true);
      const { user, details } = renderPage();
      await user.click(screen.getByRole('button', { name: '+ 新建用户' }));
      const form = within(
        await screen.findByRole('dialog', { name: '新建用户' }),
      );
      await user.type(
        form.getByRole('textbox', { name: '用户名' }),
        'new-user',
      );
      await user.type(form.getByRole('textbox', { name: '姓名' }), '新用户');
      if (explicitPassword)
        await user.type(form.getByLabelText('初始密码'), 'Explicit123!');
      await user.click(form.getAllByRole('combobox')[0]);
      await user.click(
        await screen.findByText('正式员工', {
          selector: '.ant-select-item-option-content',
        }),
      );
      await user.click(form.getByRole('button', { name: '确 定' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        '操作已生效，但后续处理失败',
      );
      await waitFor(() => expect(details).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('alert')).toHaveTextContent('修复');
      if (explicitPassword) {
        expect(screen.getByRole('alert')).not.toHaveTextContent(
          '初始密码未能交付',
        );
      } else {
        expect(screen.getByRole('alert')).toHaveTextContent('初始密码未能交付');
        expect(screen.getByRole('alert')).toHaveTextContent(
          '请先修复，再主动重置密码',
        );
      }
      expect(requests).toHaveLength(1);
      expect(
        screen.queryByText('用户创建成功 — 初始密码'),
      ).not.toBeInTheDocument();
    },
  );
  it.each(['update', 'resetPassword'])(
    'refreshes %s committed failure and retains its warning without replay',
    async (procedure) => {
      const requests = mutation(procedure, null, true);
      const { user, details } = renderPage();
      if (procedure === 'update') {
        const form = await openEdit(user);
        await user.type(form.getByRole('textbox', { name: '姓名' }), '更新');
        await user.click(form.getByRole('button', { name: '确 定' }));
      } else {
        await user.click((await screen.findAllByText('查看'))[0]);
        await user.click(
          await screen.findByRole('button', { name: '重置密码' }),
        );
        const confirmation = (await screen.findAllByRole('dialog')).find(
          (dialog) =>
            within(dialog).queryByText(
              '确认后将生成新的随机密码，请做好交接准备。',
            ),
        );
        expect(confirmation).toBeDefined();
        await user.click(
          within(confirmation!).getByRole('button', { name: '重 置' }),
        );
      }
      expect(await screen.findByRole('alert')).toHaveTextContent(
        '操作已生效，但后续处理失败',
      );
      await waitFor(() => expect(details).toHaveBeenCalledTimes(2));
      expect(screen.getByRole('alert')).toHaveTextContent('修复');
      expect(requests).toHaveLength(1);
      expect(screen.queryByText('新密码已生成')).not.toBeInTheDocument();
    },
  );
  it('delivers the reset result password and refreshes the detail', async () => {
    const requests = mutation('resetPassword', {
      changed: true,
      result: 'Reset123!',
    });
    const { user, details } = renderPage();
    await user.click((await screen.findAllByText('查看'))[0]);
    await user.click(await screen.findByRole('button', { name: '重置密码' }));
    const confirmation = (await screen.findAllByRole('dialog')).find((dialog) =>
      within(dialog).queryByText('确认后将生成新的随机密码，请做好交接准备。'),
    );
    expect(confirmation).toBeDefined();
    await user.click(
      within(confirmation!).getByRole('button', { name: '重 置' }),
    );
    expect(await screen.findByText('Reset123!')).toBeInTheDocument();
    await waitFor(() => expect(details).toHaveBeenCalledTimes(2));
    expect(requests).toHaveLength(1);
  });
});
