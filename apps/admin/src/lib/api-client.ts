import { hc } from 'hono/client';
import type { AppType } from '@iam/api';

export const apiClient = hc<AppType>('/', {
  init: {
    credentials: 'include',
  },
});
