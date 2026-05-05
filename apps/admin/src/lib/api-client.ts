import { API_BASE, SSO_CLIENT_CODE } from '@admin/constants/config';
import { redirectToLogin } from '@admin/utils/auth';
import type { AppRouter } from '@iam/api/trpc';
import { createTRPCClient, httpBatchLink } from '@trpc/client';

export const apiClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_BASE}/rpc`,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fetch(input, {
          ...init,
          credentials: 'include',
          headers: {
            ...(init?.headers ?? {}),
            Client: SSO_CLIENT_CODE,
          },
        });
        if (response.status === 401) {
          redirectToLogin();
          return new Promise<Response>(() => {});
        }
        return response;
      },
    }),
  ],
});

export type { AppRouter };
