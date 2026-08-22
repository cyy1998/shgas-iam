import { defineConfig } from '@umijs/max';
import { resolve } from 'node:path';
import { adminTheme } from './src/theme';

export default defineConfig({
  alias: {
    '@admin': resolve(__dirname, 'src'),
    '@iam/client-subject-projection': resolve(
      __dirname,
      '../../packages/client-subject-projection/src',
    ),
    '@iam/contracts': resolve(__dirname, '../../packages/contracts/src'),
    '~admin': __dirname,
  },
  base: '/iam-admin',
  esbuildMinifyIIFE: true,
  publicPath: '/iam-admin/',
  hash: true,
  antd: {
    theme: adminTheme,
  },
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: {
    title: '上海燃气IAM管理员平台',
  },
  routes: [
    { path: '/', redirect: '/users' },
    {
      path: '/users',
      name: '用户管理',
      icon: 'team',
      component: './users/index',
      access: 'isAdmin',
    },
    {
      path: '/organizations',
      name: '组织管理',
      icon: 'apartment',
      component: './organizations/index',
      access: 'isAdmin',
    },
    {
      path: '/organization-responsibilities',
      name: '组织责任',
      icon: 'cluster',
      access: 'isAdmin',
      routes: [
        {
          path: '/organization-responsibilities',
          redirect: '/organization-responsibilities/assignments',
        },
        {
          path: '/organization-responsibilities/assignments',
          name: '责任任命',
          component:
            './organization-responsibilities/OrganizationResponsibilityAssignmentsPage',
          access: 'isAdmin',
        },
        {
          path: '/organization-responsibilities/types',
          name: '责任类型目录',
          component:
            './organization-responsibilities/OrganizationResponsibilityTypeCatalogPage',
          access: 'isAdmin',
        },
      ],
    },
    {
      path: '/positions',
      name: '职位管理',
      icon: 'solution',
      component: './positions/index',
      access: 'isAdmin',
    },
    {
      path: '/employments',
      name: '雇佣关系',
      icon: 'profile',
      component: './employments/index',
      access: 'isAdmin',
    },
    {
      path: '/clients',
      name: '应用管理',
      icon: 'appstore',
      component: './clients/index',
      access: 'isAdmin',
    },
    {
      path: '/clients/:clientCode/edit',
      component: './clients/edit',
      access: 'isAdmin',
      hideInMenu: true,
    },
    {
      path: '/roles',
      name: '角色管理',
      icon: 'safety',
      component: './roles/index',
      access: 'isAdmin',
    },
    {
      path: '/sessions',
      name: '会话管理',
      icon: 'history',
      component: './sessions/index',
      access: 'isAdmin',
    },
    {
      path: '/audit-logs',
      name: '审计日志',
      icon: 'fileSearch',
      component: './audit-logs/index',
      access: 'isAdmin',
    },
    {
      path: '/system-logs',
      name: '系统日志',
      icon: 'bug',
      component: './system-logs/index',
      access: 'isAdmin',
    },
    { path: '/403', component: './403', hideInMenu: true },
  ],
  npmClient: 'pnpm',
  proxy: {
    '/api/iam/public': {
      target: 'http://localhost:30000',
      changeOrigin: true,
      pathRewrite: { '^/api/iam': '' },
    },
    '/api/iam/open': {
      target: 'http://localhost:30000',
      changeOrigin: true,
      pathRewrite: { '^/api/iam': '' },
    },
    '/api/iam/internal': {
      target: 'http://localhost:30000',
      changeOrigin: true,
      pathRewrite: { '^/api/iam': '' },
    },
    '/api/iam/sso': {
      target: 'http://localhost:30000',
      changeOrigin: true,
      pathRewrite: { '^/api/iam': '' },
    },
    '/api/iam/auth': {
      target: 'http://localhost:30000',
      changeOrigin: true,
      pathRewrite: { '^/api/iam': '' },
    },
    '/api/iam/admin': {
      target: 'http://localhost:30001',
      changeOrigin: true,
      pathRewrite: { '^/api/iam': '' },
    },
    '/api/iam/rpc': {
      target: 'http://localhost:30001',
      changeOrigin: true,
      pathRewrite: { '^/api/iam': '' },
    },
    '/public': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/admin': {
      target: 'http://localhost:30001',
      changeOrigin: true,
    },
    '/auth': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/sso': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/internal': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/open': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/rpc': {
      target: 'http://localhost:30001',
      changeOrigin: true,
    },
  },
});
