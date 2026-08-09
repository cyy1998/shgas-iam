import type { OrganizationSelectorNode } from '@admin/services/organization';
import type { OrganizationStatus } from '@iam/contracts';

export function filterOrganizationSelectorNodesByStatus(
  nodes: OrganizationSelectorNode[],
  statuses: OrganizationStatus[],
) {
  return nodes.filter((node) => statuses.includes(node.status));
}
