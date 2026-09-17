import { getMaskedMobile } from '@sso/services/open';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '~sso/test/mocks/server';

describe('masked mobile service', () => {
  it.each([
    [
      '张 三/a?b#c%',
      '%25E5%25BC%25A0%2520%25E4%25B8%2589%252Fa%253Fb%2523c%2525',
    ],
    ['.', '%252E'],
    ['..', '%252E%252E'],
    ['%2E', '%25252E'],
  ])(
    'encodes username %s as one path segment and preserves the Cap token',
    async (username, segment) => {
      let requestedUrl: URL | undefined;
      server.use(
        http.get('*', ({ request }) => {
          requestedUrl = new URL(request.url);
          return HttpResponse.json({
            code: 200,
            message: 'OK',
            data: { mobile: '138****1234' },
          });
        }),
      );
      const result = await getMaskedMobile({
        username,
        capToken: 'cap-token',
      });
      expect(result).toEqual({ mobile: '138****1234' });
      expect(requestedUrl?.pathname).toContain(
        `/open/users/${segment}/masked-mobile`,
      );
      expect(requestedUrl?.searchParams.get('capToken')).toBe('cap-token');
      expect(requestedUrl?.searchParams.has('username')).toBe(false);
    },
  );
});
