import { defineConfig } from '@umijs/max';
import { resolve } from 'node:path';

export default defineConfig({
  alias: {
    '@sso': resolve(__dirname, 'src'),
    '@iam/contracts': resolve(__dirname, '../../packages/contracts/src'),
    '~sso': __dirname,
  },
  base: '/portal',
  publicPath: '/portal/',
  hash: true,
  esbuildMinifyIIFE: true,
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
    { path: '/userInfo', component: './user-info' },
    { path: '/systemMaintenance', component: './system-maintenance' },
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
