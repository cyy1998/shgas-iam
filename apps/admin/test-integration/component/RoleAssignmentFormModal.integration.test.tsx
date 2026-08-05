import RoleAssignmentFormModal from '@admin/pages/roles/components/RoleAssignmentFormModal';
import { RoleAssignmentTargetType } from '@iam/contracts';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '~admin/test/render';

const createRoleAssignment = vi.hoisted(() => vi.fn());
const searchPositions = vi.hoisted(() => vi.fn());
const searchEmployments = vi.hoisted(() => vi.fn());

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

vi.mock('@admin/services/role', () => ({ createRoleAssignment }));
vi.mock('@admin/services/position', () => ({ searchPositions }));
vi.mock('@admin/services/employment', () => ({ searchEmployments }));

describe('RoleAssignmentFormModal', () => {
  it('does not submit organization fields after switching to position assignment', async () => {
    createRoleAssignment.mockResolvedValue({});
    searchPositions.mockResolvedValue({
      result: [{ posCode: 'FIN-001', posName: '财务经理' }],
      total: 1,
    });

    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    const { user } = render(
      <RoleAssignmentFormModal
        open
        roleCode="admin-role"
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    await user.type(screen.getByLabelText('请选择组织'), 'ORG');
    await user.click(screen.getByLabelText('分配类型'));
    await user.click(await screen.findByTitle('岗位'));
    await user.click(screen.getByRole('combobox', { name: '岗位' }));
    await user.click(await screen.findByTitle('财务经理（FIN-001）'));
    await user.click(screen.getByRole('button', { name: /提交|确 定/ }));

    await waitFor(() => {
      expect(createRoleAssignment).toHaveBeenCalledWith('admin-role', {
        targetType: RoleAssignmentTargetType.Position,
        posCode: 'FIN-001',
      });
    });
    expect(createRoleAssignment.mock.calls[0][1]).not.toHaveProperty('orgCode');
    expect(createRoleAssignment.mock.calls[0][1]).not.toHaveProperty(
      'includeDescendants',
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalled();
  });
});
