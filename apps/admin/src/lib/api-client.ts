import type { AppRouter } from "@iam/api/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

export const apiClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/rpc",
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          credentials: "include",
          headers: {
            ...(init?.headers ?? {}),
            Client: "iam",
          },
        }),
    }),
  ],
});

export type { AppRouter };
