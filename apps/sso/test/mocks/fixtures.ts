export const authenticationConfig = {
  authorizationEndpoint: '/sso/authorize',
  logoutEndpoint: '/sso/logout',
};

export const currentUserInfo = {
  version: 1,
  subjectIdentifier: '00000000-0000-4000-8000-000000000001',
  profile: {
    username: 'zhangsan',
    name: '张三',
    phone: '13800000000',
    employments: [],
  },
};

export const resetPasswordUserInfo = {
  username: 'zhangsan',
  name: '张三',
  mobile: '13800000000',
};
