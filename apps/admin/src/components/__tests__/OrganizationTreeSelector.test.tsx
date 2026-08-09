import {
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
} from '@iam/contracts';
import { describe, expect, it } from 'vitest';
import type { OrganizationSelectorNode } from '../../services/organization';
import { filterOrganizationSelectorNodesByStatus } from '../organizationTreeSelector.helpers';

function selectorNode(
  orgCode: string,
  status: OrganizationStatus,
): OrganizationSelectorNode {
  return {
    id: orgCode.charCodeAt(0),
    orgCode,
    orgName: orgCode,
    orgType: OrganizationType.Department,
    status,
    level: OrganizationLevel.One,
    parentId: -1,
    isLeaf: true,
    fullPath: [],
    pathText: orgCode,
    selectable: status === OrganizationStatus.Enable,
  };
}

describe('OrganizationTreeSelector filtering', () => {
  it('keeps only enabled organizations by default', () => {
    const nodes = [
      selectorNode('ACTIVE', OrganizationStatus.Enable),
      selectorNode('PAUSED', OrganizationStatus.Pause),
      selectorNode('DISABLED', OrganizationStatus.Disable),
    ];

    expect(
      filterOrganizationSelectorNodesByStatus(nodes, [
        OrganizationStatus.Enable,
      ]).map((node) => node.orgCode),
    ).toEqual(['ACTIVE']);
  });

  it('uses the provided visible statuses', () => {
    const nodes = [
      selectorNode('ACTIVE', OrganizationStatus.Enable),
      selectorNode('PAUSED', OrganizationStatus.Pause),
      selectorNode('DISABLED', OrganizationStatus.Disable),
    ];

    expect(
      filterOrganizationSelectorNodesByStatus(nodes, [
        OrganizationStatus.Enable,
        OrganizationStatus.Pause,
      ]).map((node) => node.orgCode),
    ).toEqual(['ACTIVE', 'PAUSED']);
  });
});
