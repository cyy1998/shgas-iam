import { SSO_CLIENT_CODE } from '@/constants/config';
import type { AppRouter } from '@iam/api/trpc';
import { createTRPCClient, httpBatchLink } from '@trpc/client';

export const apiClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/rpc',
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          credentials: 'include',
          headers: {
            ...(init?.headers ?? {}),
            Client: SSO_CLIENT_CODE,
          },
        }),
    }),
  ],
});

export type { AppRouter };
