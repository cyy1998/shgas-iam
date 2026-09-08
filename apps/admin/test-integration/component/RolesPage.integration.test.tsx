import RolesPage from '@admin/pages/roles';
import { ApiErrorCode } from '@iam/contracts';
import { ConfigProvider, message, Modal } from 'antd';
import { http, HttpResponse } from 'msw';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '~admin/test/mocks/server';
import { cleanup, render, screen, waitFor, within } from '~admin/test/render';

vi.mock('@admin/constants/config', () => ({
  API_PREFIX: 'http://localhost',
  SSO_CLIENT_CODE: 'iam-admin',
}));

// jsdom does not finish CSS transitions; retain the real form and table behavior.
vi.mock('@admin/components/OrganizationTreeSelector', () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <input
      aria-label="选择组织"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));
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

const role = {
  id: 1,
  roleCode: 'reader',
  roleName: '阅读角色',
  description: null,
  status: 1,
  clientId: 1,
  client: { clientCode: 'iam-admin', clientName: '管理端' },
  assignmentCount: 1,
  createTime: '2026-01-01T00:00:00Z',
  updateTime: '2026-01-01T00:00:00Z',
};
const assignment = {
  id: 10,
  roleId: 1,
  targetType: 'organization',
  targetTypeText: '组织',
  target: { name: '总部', code: 'ROOT' },
  includeDescendants: false,
  scopeText: '仅当前对象',
  createTime: '2026-01-01T00:00:00Z',
};
const reads = { detail: vi.fn(), search: vi.fn(), assignments: vi.fn() };
beforeEach(() => {
  Object.values(reads).forEach((read) => read.mockReset());
  server.use(
    http.get('*/rpc/:procedures', ({ params }) =>
      HttpResponse.json(
        String(params.procedures)
          .split(',')
          .map((procedure) => {
            if (procedure === 'admin.client.search')
              return {
                result: {
                  data: {
                    result: [{ clientCode: 'iam-admin', clientName: '管理端' }],
                    total: 1,
                  },
                },
              };
            if (procedure === 'admin.role.detail') {
              reads.detail();
              return { result: { data: role } };
            }
            if (procedure === 'admin.role.search') {
              reads.search();
              return { result: { data: { result: [role], total: 1 } } };
            }
            if (procedure === 'admin.role.assignments.search') {
              reads.assignments();
              return { result: { data: { result: [assignment], total: 1 } } };
            }
            return { result: { data: { result: [], total: 0 } } };
          }),
      ),
    ),
  );
});
afterEach(async () => {
  cleanup();
  message.destroy();
  Modal.destroyAll();
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
});
function mutation(
  procedure: string,
  changed = true,
  status?: number,
  committed = false,
) {
  const requests: unknown[] = [];
  server.use(
    http.post(`*/rpc/admin.role.${procedure}`, async ({ request }) => {
      requests.push(await request.json());
      return status
        ? HttpResponse.json(
            [
              {
                error: {
                  message: '角色写入失败',
                  code: -32603,
                  data: {
                    httpStatus: status,
                    ...(committed
                      ? { serviceCode: ApiErrorCode.AdminMutationCommitted }
                      : {}),
                  },
                },
              },
            ],
            { status },
          )
        : HttpResponse.json([
            {
              result: {
                data: { changed, result: procedure === 'create' ? role : null },
              },
            },
          ]);
    }),
  );
  return requests;
}
async function page() {
  const view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RolesPage />
    </ConfigProvider>,
  );
  await screen.findByText(role.roleName);
  return view;
}
async function assignments() {
  const view = await page();
  await view.user.click(screen.getByText('详情', { selector: 'a' }));
  await view.user.click(
    await screen.findByRole('tab', { name: '分配对象（1）' }),
  );
  await screen.findByText('总部');
  return view;
}
describe('RolesPage mutation results through the role service', () => {
  it('includes an explicitly edited status', async () => {
    const requests = mutation('update');
    const { user } = await page();
    await user.click(screen.getByText('编辑', { selector: 'a' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('combobox', { name: '状态' }));
    await user.click(
      await screen.findByText('暂停', {
        selector: '.ant-select-item-option-content',
      }),
    );
    await user.click(dialog.getByRole('button', { name: '确 定' }));
    expect(await screen.findByText('角色已更新')).toBeInTheDocument();
    expect(requests).toMatchObject([{ '0': { data: { status: 2 } } }]);
  });
  it('closes a committed assignment creation and retains the repair warning', async () => {
    const requests = mutation('assignments.create', false, 500, true);
    const { user } = await assignments();
    await user.click(screen.getByRole('button', { name: '新增分配' }));
    await user.type(screen.getByLabelText('选择组织'), 'ROOT');
    const dialogs = await screen.findAllByRole('dialog');
    await user.click(
      within(dialogs[dialogs.length - 1]).getByRole('button', {
        name: '确 定',
      }),
    );
    await waitFor(() =>
      expect(reads.detail.mock.calls.length).toBeGreaterThan(1),
    );
    expect(
      await screen.findByText(
        '操作已生效，但后续处理失败，请刷新确认并联系管理员修复',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByLabelText('选择组织')).not.toBeInTheDocument(),
    );
    expect(requests).toHaveLength(1);
  });

  it('opens the created resource from the unified result', async () => {
    const requests = mutation('create');
    const { user } = await page();
    await user.click(screen.getByRole('button', { name: /新建角色/ }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(
      dialog.getByRole('textbox', { name: '角色编码' }),
      'reader',
    );
    await user.type(
      dialog.getByRole('textbox', { name: '角色名称' }),
      '阅读角色',
    );
    await user.click(dialog.getByRole('combobox', { name: '所属应用' }));
    await user.click(
      await screen.findByText('管理端（iam-admin）', {
        selector: '.ant-select-item-option-content',
      }),
    );
    await user.click(dialog.getByRole('button', { name: '确 定' }));
    expect(await screen.findByText('角色已创建')).toBeInTheDocument();
    expect(
      await screen.findByRole('tab', { name: '基本信息' }),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    expect(reads.detail).toHaveBeenCalled();
  });
  it('creates an assignment and refreshes the committed detail', async () => {
    const requests = mutation('assignments.create');
    const { user } = await assignments();
    await user.click(screen.getByRole('button', { name: '新增分配' }));
    await user.type(screen.getByLabelText('选择组织'), 'ROOT');
    const dialogs = await screen.findAllByRole('dialog');
    await user.click(
      within(dialogs[dialogs.length - 1]).getByRole('button', {
        name: '确 定',
      }),
    );
    expect(await screen.findByText('分配已创建')).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    await waitFor(() =>
      expect(reads.detail.mock.calls.length).toBeGreaterThan(1),
    );
  });

  it.each([true, false])(
    'reports edit changed=%s and omits untouched status',
    async (changed) => {
      const requests = mutation('update', changed);
      const { user } = await page();
      await user.click(screen.getByText('编辑', { selector: 'a' }));
      const dialog = within(await screen.findByRole('dialog'));
      await user.click(dialog.getByRole('button', { name: '确 定' }));
      expect(
        await screen.findByText(changed ? '角色已更新' : '无需修改'),
      ).toBeInTheDocument();
      expect(requests).toEqual([
        {
          '0': {
            roleCode: 'reader',
            data: { roleName: role.roleName, description: null },
          },
        },
      ]);
    },
  );
  it.each([true, false])('reports status changed=%s', async (changed) => {
    const requests = mutation('updateStatus', changed);
    const { user } = await page();
    await user.hover(screen.getByText('状态', { selector: 'a' }));
    await user.click(await screen.findByText('切为「暂停」'));
    expect(
      await screen.findByText(changed ? '状态已更新' : '无需修改'),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it('reports deletion', async () => {
    const requests = mutation('delete');
    const { user } = await page();
    await user.click(screen.getByText('删除', { selector: 'a' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: '确 定',
      }),
    );
    expect(await screen.findByText('角色已删除')).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it.each([404, 409])(
    'keeps an ordinary rejected edit open (%s)',
    async (status) => {
      const requests = mutation('update', false, status);
      const { user } = await page();
      await user.click(screen.getByText('编辑', { selector: 'a' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: '确 定',
        }),
      );
      expect(await screen.findByText('角色写入失败')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(requests).toHaveLength(1);
    },
  );
  it('rereads committed role details without replay and retains the warning', async () => {
    const requests = mutation('update', false, 500, true);
    const { user } = await page();
    await user.click(screen.getByText('编辑', { selector: 'a' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: '确 定',
      }),
    );
    await waitFor(() =>
      expect(reads.detail.mock.calls.length).toBeGreaterThan(1),
    );
    expect(
      await screen.findByText(
        '操作已生效，但后续处理失败，请刷新确认并联系管理员修复',
      ),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it.each([true, false])(
    'reports assignment scope changed=%s',
    async (changed) => {
      const requests = mutation('assignments.updateScope', changed);
      const { user } = await assignments();
      await user.click(screen.getByText('含下级', { selector: 'a' }));
      expect(
        await screen.findByText(changed ? '作用范围已更新' : '无需修改'),
      ).toBeInTheDocument();
      expect(requests).toEqual([
        {
          '0': {
            roleCode: 'reader',
            assignmentId: 10,
            includeDescendants: true,
          },
        },
      ]);
    },
  );
  it('refreshes an assignment committed failure without replay or losing its warning', async () => {
    const requests = mutation('assignments.updateScope', false, 500, true);
    const { user } = await assignments();
    await user.click(screen.getByText('含下级', { selector: 'a' }));
    await waitFor(() =>
      expect(reads.detail.mock.calls.length).toBeGreaterThan(1),
    );
    await waitFor(() =>
      expect(reads.assignments.mock.calls.length).toBeGreaterThan(1),
    );
    expect(
      await screen.findByText(
        '操作已生效，但后续处理失败，请刷新确认并联系管理员修复',
      ),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it('deletes an assignment and refreshes its list', async () => {
    const requests = mutation('assignments.delete');
    const { user } = await assignments();
    await user.click(
      within(screen.getByRole('tabpanel', { name: '分配对象（1）' })).getByText(
        '删除',
      ),
    );
    await user.click(
      within((await screen.findAllByRole('dialog')).at(-1)!).getByRole(
        'button',
        { name: '确 定' },
      ),
    );
    expect(await screen.findByText('分配已删除')).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
});
