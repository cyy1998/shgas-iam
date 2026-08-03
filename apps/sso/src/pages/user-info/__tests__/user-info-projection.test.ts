import { OrganizationType } from '@iam/contracts';
import { describe, expect, it } from 'vitest';
import {
  formatProjectionCompany,
  formatProjectionOrganizationPath,
  formatProjectionPosition,
} from '../user-info-projection';

const employment = {
  isPrimary: true,
  organization: {
    code: 'FIN',
    name: '财务部',
    type: OrganizationType.Department,
    path: [
      {
        code: 'COMPANY',
        name: '集团',
        type: OrganizationType.Company,
      },
      {
        code: 'FIN',
        name: '财务部',
        type: OrganizationType.Department,
      },
    ],
  },
  position: {
    code: 'FIN-001',
    name: '财务经理',
  },
} as const;

describe('Custom SSO V1 user-info projection presentation', () => {
  it('formats company, organization path and position from nested V1 fields', () => {
    expect(formatProjectionCompany(employment)).toBe('集团');
    expect(formatProjectionOrganizationPath(employment)).toBe(
      '集团 / 财务部',
    );
    expect(formatProjectionPosition(employment)).toBe(
      '财务经理 (FIN-001)',
    );
  });

  it('never depends on removed database IDs or flat employment aliases', () => {
    const serialized = JSON.stringify(employment);

    expect(serialized).not.toContain('"id"');
    expect(serialized).not.toContain('"posCode"');
    expect(serialized).not.toContain('"orgCode"');
  });
});
