import {
  ADMIN_MODULE_CODES,
  type AdminEmploymentAllowedActions,
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

export const adminCapabilitySummary = {
  visibleModules: [...ADMIN_MODULE_CODES],
  collectionActions: {
    user: { create: { allowed: true, reason: null } },
    employment: { create: { allowed: true, reason: null } },
    organization: { createRoot: { allowed: true, reason: null } },
    organizationResponsibility: {
      create: { allowed: true, reason: null },
    },
    position: {
      create: { allowed: true, reason: null },
      edit: { allowed: true, reason: null },
      changeStatus: { allowed: true, reason: null },
      delete: { allowed: true, reason: null },
    },
  },
} as const;

const deniedAction = {
  allowed: false,
  reason: 'ACTION_NOT_GRANTED',
} as const;

const allowedAction = { allowed: true, reason: null } as const;
const stateNotActionableAction = {
  allowed: false,
  reason: 'RESOURCE_STATE_NOT_ACTIONABLE',
} as const;

export const hrAdminCapabilitySummary = {
  visibleModules: [
    'user',
    'organization',
    'organizationResponsibility',
    'position',
    'employment',
  ],
  collectionActions: {
    user: { create: deniedAction },
    employment: { create: allowedAction },
    organization: { createRoot: deniedAction },
    organizationResponsibility: { create: deniedAction },
    position: {
      create: deniedAction,
      edit: deniedAction,
      changeStatus: deniedAction,
      delete: deniedAction,
    },
  },
} as const;

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

export const currentHrAdminUser = {
  version: 1,
  subjectIdentifier: '00000000-0000-4000-8000-000000000002',
  profile: {
    username: 'hradmin',
    name: '人事管理员',
  },
  authorization: {
    employments: [],
    roles: ['iam:hr-admin'],
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
  {
    id: 44,
    username: 'wangwu',
    name: '王五',
    mobile: '13700000000',
    userType: UserType.Formal,
    status: UserStatus.Disable,
    createTime: '2026-01-03T08:00:00.000Z',
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
    memberNumber: 2,
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
    roles: ['iam:hr-admin'],
    privileges: ['people:read'],
    managementPath: '/employments?employmentId=42',
  },
];

export function createHrEmploymentAllowedActions(
  status: EmploymentStatus,
  isPrimary: boolean,
): AdminEmploymentAllowedActions {
  const isOpen = status !== EmploymentStatus.Disable;
  return {
    editDescription:
      status === EmploymentStatus.Disable
        ? stateNotActionableAction
        : allowedAction,
    pause:
      status === EmploymentStatus.Enable
        ? allowedAction
        : stateNotActionableAction,
    resume:
      status === EmploymentStatus.Pause
        ? allowedAction
        : stateNotActionableAction,
    end:
      status === EmploymentStatus.Disable
        ? stateNotActionableAction
        : allowedAction,
    transfer: isOpen ? allowedAction : stateNotActionableAction,
    setPrimary: isOpen && !isPrimary ? allowedAction : stateNotActionableAction,
    clearPrimary:
      isOpen && isPrimary ? allowedAction : stateNotActionableAction,
  };
}

export const hrEmploymentAllowedActions = createHrEmploymentAllowedActions(
  EmploymentStatus.Enable,
  true,
);

export const adminEmploymentAllowedActions = {
  editDescription: allowedAction,
  pause: allowedAction,
  resume: {
    allowed: false,
    reason: 'RESOURCE_STATE_NOT_ACTIONABLE',
  },
  end: allowedAction,
  transfer: allowedAction,
  setPrimary: {
    allowed: false,
    reason: 'RESOURCE_STATE_NOT_ACTIONABLE',
  },
  clearPrimary: allowedAction,
} as const;

export const hrAdminEmploymentDetail = {
  ...adminEmployments[0],
  allowedActions: hrEmploymentAllowedActions,
};

export const adminUserDetail = {
  ...adminUsers[0],
  wxId: null,
  orderNum: 0,
  isDelete: false,
  updateTime: '2026-01-05T08:00:00.000Z',
  roles: ['iam:admin'],
  privileges: [],
  employments: adminEmployments.map((employment) => ({
    ...employment,
    allowedActions: createHrEmploymentAllowedActions(
      employment.status,
      employment.isPrimary,
    ),
  })),
  allowedActions: {
    editProfile: allowedAction,
    resetPassword: allowedAction,
    changeStatus: allowedAction,
    delete: allowedAction,
    resign: allowedAction,
  },
};

export const hrAdminUserDetail = {
  ...adminUserDetail,
  roles: ['iam:hr-admin'],
  privileges: ['people:read'],
  allowedActions: {
    editProfile: allowedAction,
    resetPassword: allowedAction,
    changeStatus: {
      allowed: false,
      reason: 'USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT',
    },
    delete: deniedAction,
    resign: {
      allowed: false,
      reason: 'USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT',
    },
  },
};

export const adminEmploymentSearchResult = {
  result: adminEmployments,
  total: adminEmployments.length,
};
