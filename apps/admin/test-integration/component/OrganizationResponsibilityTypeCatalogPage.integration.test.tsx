import OrganizationResponsibilityTypeCatalogPage from '@admin/pages/organization-responsibilities/OrganizationResponsibilityTypeCatalogPage';
import { ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG } from '@iam/contracts';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '~admin/test/render';

const catalogService = vi.hoisted(() => ({
  listTypes: vi.fn(),
}));

vi.mock('@admin/services/organization-responsibility', () => ({
  listOrganizationResponsibilityTypes: catalogService.listTypes,
}));

describe('OrganizationResponsibilityTypeCatalogPage', () => {
  it('loads the catalog without offering mutations', async () => {
    catalogService.listTypes.mockResolvedValue(
      ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((entry) => ({ ...entry })),
    );

    render(<OrganizationResponsibilityTypeCatalogPage />);

    await screen.findByRole('cell', { name: 'head' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(catalogService.listTypes).toHaveBeenCalledTimes(1);
    });
  });
});
