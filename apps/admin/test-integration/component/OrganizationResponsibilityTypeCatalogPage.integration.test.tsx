import OrganizationResponsibilityTypeCatalogPage from '@admin/pages/organization-responsibilities/OrganizationResponsibilityTypeCatalogPage';
import { ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG } from '@iam/contracts';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '~admin/test/render';

const catalogService = vi.hoisted(() => ({
  listTypes: vi.fn(),
}));

vi.mock('@admin/services/organization-responsibility', () => ({
  listOrganizationResponsibilityTypes: catalogService.listTypes,
}));

describe('OrganizationResponsibilityTypeCatalogPage', () => {
  it('shows the canonical catalog in display order without a mutation surface', async () => {
    catalogService.listTypes.mockResolvedValue(
      ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((entry) => ({ ...entry })),
    );

    render(<OrganizationResponsibilityTypeCatalogPage />);

    expect(await screen.findByText('责任类型目录')).toBeInTheDocument();
    expect(
      screen.getByText(
        '责任类型由 IAM 受控发布维护，管理端不可新增、修改或删除。',
      ),
    ).toBeInTheDocument();

    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('head')).toBeInTheDocument();
    expect(within(rows[1]).getByText('负责人')).toBeInTheDocument();
    expect(within(rows[1]).getByText('single')).toBeInTheDocument();
    expect(within(rows[1]).getByText('10')).toBeInTheDocument();
    expect(within(rows[2]).getByText('supervising')).toBeInTheDocument();
    expect(within(rows[2]).getByText('分管领导')).toBeInTheDocument();
    expect(within(rows[2]).getByText('multiple')).toBeInTheDocument();
    expect(within(rows[2]).getByText('20')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(catalogService.listTypes).toHaveBeenCalledTimes(1);
    });
  });
});
