import {
  ClientManagementLevel,
  ClientStatus,
  OidcClientState,
  OidcClientType,
  OidcScope,
  UserStatus,
  UserType,
} from '@iam/contracts';

export const currentAdminUser = {
  username: 'admin',
  name: '管理员',
  roles: ['iam:admin'],
};

export const adminUsers = [
  {
    username: 'zhangsan',
    name: '张三',
    mobile: '13800000000',
    userType: UserType.Formal,
    status: UserStatus.Enable,
    createTime: '2026-01-01T08:00:00.000Z',
  },
  {
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
    extAttributes: {
      managementLevel: ClientManagementLevel.Independent,
      requireOrcas: false,
      validRedirectUrls: ['http://localhost:8001/iam-admin/*'],
      userExcluding: [],
      logoutEndpoint: 'http://localhost:8001/iam-admin',
      callbackEndpoint: 'http://localhost:8001/iam-admin',
    },
    oidcState: OidcClientState.Disabled,
    oidcClientType: OidcClientType.Public,
    oidcAllowedScopes: [OidcScope.OpenId],
    oidcConfig: {
      clientType: OidcClientType.Public,
      redirectUris: ['http://localhost:8001/iam-admin/callback'],
      postLogoutRedirectUris: ['http://localhost:8001/iam-admin'],
      allowedScopes: [OidcScope.OpenId],
    },
    hasOidcSecret: false,
  },
];

export const adminClientSearchResult = {
  result: adminClients,
  total: adminClients.length,
};

export const adminClientDetail = adminClients[0];
