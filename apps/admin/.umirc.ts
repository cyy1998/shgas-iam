
import { defineConfig } from '@umijs/max';

export default defineConfig({
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
    { path: '/users', name: '用户管理', icon: 'team', component: './users/index', access: 'isAdmin' },
    { path: '/organizations', name: '组织管理', icon: 'apartment', component: './organizations/index', access: 'isAdmin' },
    { path: '/positions', name: '职位管理', icon: 'solution', component: './positions/index', access: 'isAdmin' },
    { path: '/employments', name: '雇佣关系', icon: 'profile', component: './employments/index', access: 'isAdmin' },
    { path: '/403', component: './403', hideInMenu: true },
  ],
  npmClient: 'pnpm',
  proxy: {
    '/public': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/admin': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/auth': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/sso': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/internal': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/open': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/rpc': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
  },
});
