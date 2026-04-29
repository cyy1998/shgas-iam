import { defineConfig } from '@umijs/max';

export default defineConfig({
  base: '/iam-sso',
  publicPath: '/iam-sso/',
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: false,
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: './login' },
    { path: '/reset-password', component: './reset-password' },
    { path: '/user-info', component: './user-info' },
    { path: '/system-maintenance', component: './system-maintenance' },
  ],
  npmClient: 'pnpm',
  proxy: {
    '/api': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/sso': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/auth': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/public': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/open': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/internal': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
  },
});
