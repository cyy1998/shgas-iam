import { defineConfig } from '@umijs/max';

export default defineConfig({
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: {
    title: '@umijs/max',
  },
  unAccessible: '/403',
  routes: [
    { path: '/', redirect: '/users' },
    { path: '/users', name: '用户管理', icon: 'team', component: './users/index' },
    { path: '/organizations', name: '组织管理', icon: 'apartment', component: './organizations/index' },
    { path: '/positions', name: '职位管理', icon: 'solution', component: './positions/index' },
    { path: '/employments', name: '雇佣关系', icon: 'profile', component: './employments/index' },
    { path: '/403', component: './403', hideInMenu: true },
  ],
  npmClient: 'pnpm',
  utoopack: {},
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
  },
});
