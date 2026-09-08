import EmploymentFormModal from '@admin/pages/employments/components/EmploymentFormModal';
import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '~admin/test/render';

const createEmployment = vi.hoisted(() => vi.fn());
const searchPositions = vi.hoisted(() => vi.fn());

vi.mock('@admin/components/OrganizationTreeSelector', () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value?: string) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={placeholder}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock('@admin/services/employment', () => ({ createEmployment }));

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      position: { search: { query: searchPositions } },
      user: { search: { query: vi.fn() } },
    },
  },
}));

describe('EmploymentFormModal', () => {
  it('creates an immediate employment without editable lifecycle boundaries', () => {
    render(
      <EmploymentFormModal
        open
        onCommitted={vi.fn()}
        presetUsername="zhangsan"
        presetName="张三"
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('生效时间')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('结束时间')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('状态')).not.toBeInTheDocument();
  });

  it('submits only administrator-controlled create facts', async () => {
    createEmployment.mockResolvedValue({ changed: true, result: { id: 10 } });
    searchPositions.mockResolvedValue({
      result: [{ posCode: 'DEV', posName: 'Developer' }],
      total: 1,
    });
    const onSuccess = vi.fn();
    const { user } = render(
      <EmploymentFormModal
        open
        onCommitted={vi.fn()}
        presetUsername="zhangsan"
        presetName="张三"
        presetOrgCode="ORG"
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: '岗位' }));
    await user.click(await screen.findByTitle('Developer (DEV)'));
    await user.click(screen.getByRole('button', { name: /确 定|提交/ }));

    await waitFor(() => {
      expect(createEmployment).toHaveBeenCalledWith({
        username: 'zhangsan',
        orgCode: 'ORG',
        posCode: 'DEV',
        isPrimary: false,
        description: null,
      });
    });
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('startTime');
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('endTime');
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('status');
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('hands committed creation to the owner for refresh without replaying', async () => {
    const committedError = new AdminMutationCommittedError(null);
    createEmployment.mockRejectedValue(committedError);
    const onCommitted = vi.fn();
    searchPositions.mockResolvedValue({
      result: [{ posCode: 'DEV', posName: 'Developer' }],
      total: 1,
    });
    const onSuccess = vi.fn();
    const { user } = render(
      <EmploymentFormModal
        open
        onCommitted={onCommitted}
        presetUsername="zhangsan"
        presetName="张三"
        presetOrgCode="ORG"
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: '岗位' }));
    await user.click(await screen.findByTitle('Developer (DEV)'));
    await user.click(screen.getByRole('button', { name: /确 定|提交/ }));

    await waitFor(() => {
      expect(createEmployment).toHaveBeenCalledWith({
        username: 'zhangsan',
        orgCode: 'ORG',
        posCode: 'DEV',
        isPrimary: false,
        description: null,
      });
    });
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('startTime');
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('endTime');
    expect(createEmployment.mock.calls[0]?.[0]).not.toHaveProperty('status');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCommitted).toHaveBeenCalledWith(committedError);
    expect(createEmployment).toHaveBeenCalledOnce();
  });
});
