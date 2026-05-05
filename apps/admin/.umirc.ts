import { defineConfig } from '@umijs/max';
import { resolve } from 'node:path';

export default defineConfig({
  alias: {
    '@admin': resolve(__dirname, 'src'),
    '~admin': __dirname,
  },
  base: '/iam-admin',
  publicPath: '/iam-admin/',
  antd: {},
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
    { path: '/403', component: './403', hideInMenu: true },
  ],
  npmClient: 'pnpm',
  proxy: {
    '/public': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/admin': {
      target: 'http://localhost:30000',
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
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
  },
});
