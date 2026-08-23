import {
  ClientStatus,
  CustomSsoClientMode,
  CustomSsoClientState,
  EmploymentStatus,
  OidcClientState,
  OidcClientType,
  OidcScope,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  SubjectClaim,
  UserStatus,
  UserType,
} from '@iam/contracts';

export const currentAdminUser = {
  version: 1,
  subjectIdentifier: '00000000-0000-4000-8000-000000000001',
  profile: {
    username: 'admin',
    name: '管理员',
  },
  authorization: {
    employments: [],
    roles: ['iam:admin'],
    privileges: [],
  },
};

export const adminUsers = [
  {
    id: 42,
    username: 'zhangsan',
    name: '张三',
    mobile: '13800000000',
    userType: UserType.Formal,
    status: UserStatus.Enable,
    createTime: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 43,
    username: 'lisi',
    name: '李四',
    mobile: '13900000000',
    userType: UserType.External,
    status: UserStatus.Pause,
    createTime: '2026-01-02T08:00:00.000Z',
  },
];

export const adminUserSearchResult = {
  result: adminUsers,
  total: adminUsers.length,
};

export const adminClients = [
  {
    clientCode: 'iam-admin',
    clientName: 'IAM 管理后台',
    clientSecret: 'secret',
    url: 'http://localhost:8001/iam-admin',
    status: ClientStatus.Enable,
    description: '管理后台',
    createTime: '2026-01-03T08:00:00.000Z',
    extAttributes: {},
    customSsoState: CustomSsoClientState.Disabled,
    customSsoMode: CustomSsoClientMode.Gateway,
    customSsoConfigVersion: 3,
    hasCustomSsoSecret: false,
    customSsoConfig: {
      mode: CustomSsoClientMode.Gateway,
      validRedirectUrls: ['http://localhost:8001/iam-admin/*'],
      subjectClaims: [
        SubjectClaim.SubjectIdentifier,
        SubjectClaim.ProfileUsername,
      ],
      orcas: { enabled: false },
    },
    oidcState: OidcClientState.Enabled,
    oidcClientType: OidcClientType.Public,
    oidcAllowedScopes: [OidcScope.OpenId],
    oidcConfig: {
      clientType: OidcClientType.Public,
      redirectUris: ['http://localhost:8001/iam-admin/callback'],
      postLogoutRedirectUris: ['http://localhost:8001/iam-admin'],
      allowedScopes: [OidcScope.OpenId],
    },
    oidcConfigVersion: 2,
    hasOidcSecret: false,
  },
];

export const adminClientSearchResult = {
  result: adminClients,
  total: adminClients.length,
};

export const adminClientDetail = adminClients[0];

export const adminPositions = [
  {
    id: 1,
    posCode: 'FIN-001',
    posName: '财务经理',
    status: PositionStatus.Enable,
    description: '财务岗位',
    createTime: '2026-01-04T08:00:00.000Z',
    updateTime: '2026-01-04T08:00:00.000Z',
  },
];

export const adminPositionSearchResult = {
  result: adminPositions,
  total: adminPositions.length,
};

const adminOrganization = {
  id: 1,
  orgCode: 'FIN',
  orgName: '财务部',
  orgType: OrganizationType.Department,
  status: OrganizationStatus.Enable,
  level: OrganizationLevel.One,
  parentId: null,
  isVirtual: false,
  isEntity: true,
};

export const adminEmployments = [
  {
    id: 42,
    user: adminUsers[0],
    position: adminPositions[0],
    organization: {
      assignedOrg: adminOrganization,
      fullOrgPath: [adminOrganization],
      companyNodes: [],
    },
    isPrimary: true,
    status: EmploymentStatus.Enable,
    startTime: '2026-01-05T08:00:00.000Z',
    endTime: null,
    description: null,
    createTime: '2026-01-05T08:00:00.000Z',
    updateTime: '2026-01-05T08:00:00.000Z',
    roles: [],
    privileges: [],
  },
];

export const adminEmploymentSearchResult = {
  result: adminEmployments,
  total: adminEmployments.length,
};
