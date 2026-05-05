import { defineConfig } from '@umijs/max';
import { resolve } from 'node:path';

export default defineConfig({
  alias: {
    '@sso': resolve(__dirname, 'src'),
    '~sso': __dirname,
  },
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
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/sso': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/auth': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/public': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/open': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
    '/internal': {
      target: 'http://localhost:30000',
      changeOrigin: true,
    },
  },
});
