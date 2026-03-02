import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { createResponseSchema } from '@schemas/response.type';
import { SSOMetaInfoSchema } from '@schemas/sso.type';
import { authService } from '@services/auth.service';
import { getProtocolAndHost } from '@utils/common.utils';
import { success } from '@utils/response.utils';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '../config';
import { clientService } from '@services/client.service';
import { ClientManagementLevel } from '@constants/client.managementLevel';

const app = new OpenAPIHono();

/*
path: /.well-known/authentication-configuration
method: GET
function: 单点登录元数据端点
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/.well-known/authentication-configuration',
    tags: ['SSO'],
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(SSOMetaInfoSchema),
          },
        },
        description: '元数据信息',
      },
    },
  }),
  async (c) => {
    const origin = (new URL(c.req.url)).origin;
    return c.json(success({
      authorizationEndpoint: `${origin}${config.AUTHORIZATION_ENDPOINT}`,
      logoutEndpoint: `${origin}${config.LOGOUT_ENDPOINT}`,
      thirdPartyOAEndpoint: `${origin}${config.THIRDPARTY_OA_ENDPOINT}`,
    }));
  },
);

/*
path: /callback
method: GET
function: 本地session建立
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/callback',
    tags: ['SSO'],
    request: {
      query: z.object({
        code: z.string().openapi({ example: 'dw98qr3hoi2hn' }),
        client: z.string().openapi({ example: 'tender' }),
        redirectUrl: z.url().openapi({ example: 'http://localhost:8080' }),
      }),
    },
    responses: {
      301: {
        description: '本地会话回调成功',
      },
    },
  }),
  async (c) => {
    const { code, client, redirectUrl } = c.req.valid('query');
    const data = await authService.setLocalSession(code, client, redirectUrl);
    setCookie(c, `local_${client}_session`, data.token, {
      httpOnly: true,
      sameSite: 'Strict', // 防 CSRF
      maxAge: config.REDIS_EXPIRE_TIME,
      path: '/',
    });
    if (data.orcasSessionId != null) {
      setCookie(c, `orcas_sso_sessionid`, data.orcasSessionId, {
        httpOnly: true,
        sameSite: 'Strict', // 防 CSRF
        maxAge: config.REDIS_EXPIRE_TIME,
        path: '/',
      });
    }
    return c.redirect(redirectUrl);
  },
);

/*
path: /token
method: GET
function: 获取token
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/token',
    tags: ['SSO'],
    request: {
      query: z.object({
        code: z.string().openapi({ example: 'dw98qr3hoi2hn' }),
        client: z.string().openapi({ example: 'tender' }),
        clientSecret: z.string().openapi({ example: 'jt123456' }),
      }),
    },
    responses: {
      301: {
        description: '本地会话回调成功',
      },
    },
  }),
  async (c) => {
    const { code, client, clientSecret } = c.req.valid('query');
    const data = await authService.setToken(code, client, clientSecret);
    return c.json(success(data))
    // return c.redirect(redirectUrl);
  },
);

/*
path: /authorize
method: GET
function: 本地session建立
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/authorize',
    tags: ['SSO'],
    request: {
      query: z.object({
        client: z.string().openapi({ example: 'tender' }),
        redirectUrl: z.url().openapi({ example: 'http://localhost:8080' }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(z.object()),
          },
        },
        description: 'session设置成功',
      },
      301: {
        description: '全局未登录，跳转登录页面',
      },
    },
  }),
  async (c) => {
    const { client, redirectUrl } = c.req.valid('query');
    const searchParams = new URLSearchParams(c.req.query());
    const sessionId = getCookie(c, 'global_session');
    const clientInstance = await clientService.getClientByCode(client)
    const data = await authService.authorize(sessionId, client, redirectUrl);
    if (data.isLogin === false) {
      return c.redirect(`${config.LOGIN_ENDPOINT}?${searchParams.toString()}`);
    }
    const callbackPath = clientInstance?.extAttributes.managementLevel===ClientManagementLevel.Gateway?
    `${getProtocolAndHost(redirectUrl)}/sso/callback`:`${clientInstance?.extAttributes.callbackEndpoint}`
    return c.redirect(`${callbackPath}?code=${data.code}&client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}`);
  },
);

/*
path: /logout
method: GET
function: logout
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/logout',
    tags: ['SSO'],
    request: {
      query: z.object({
        redirectUrl: z.url().openapi({ example: 'http://localhost:8080' }),
      }),
    },
    responses: {
      302: {
        description: '登出成功',
      },
    },
  }),
  async (c) => {
    const { redirectUrl } = c.req.valid('query');
    const token = getCookie(c, 'global_session') ?? null;
    await authService.logout(token);
    deleteCookie(c, 'global_session');
    return c.redirect(redirectUrl ?? config.LOGIN_ENDPOINT);
  },
);

/*
path: /third-party/oa
method: POST
function: oa登录
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/third-party/oa',
    tags: ['SSO'],
    request: {
      query: z.object({
        loginid: z.string().openapi({ example: '138550' }),
        ts: z.string().openapi({ example: '1234' }),
        token: z.string().openapi({ example: '138550' }),
        redirectUrl: z.url().openapi({ example: 'http://localhost:8080' }),
        client: z.string().openapi({ example: 'tender' }),
      }),
    },
    responses: {
      301: {
        description: 'OA登录成功',
      },
    },
  }),
  async (c) => {
    const { loginid, ts, token, redirectUrl, client } = c.req.valid('query');
    const sessionId = getCookie(c, 'global_session') ?? null;
    if (sessionId !== null) {
      await authService.logout(sessionId);
    }
    const data = await authService.loginOA(loginid, ts, token);
    setCookie(c, 'global_session', data.token, {
      httpOnly: true,
      sameSite: 'Strict', // 防 CSRF
      maxAge: config.REDIS_EXPIRE_TIME,
      path: '/',
    });
    return c.redirect(`/sso/authorize?client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}`);
  },
);

/*
path: /third-party/wx
method: POST
function: 微信登录
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/third-party/wx',
    tags: ['SSO'],
    request: {
      query: z.object({
        code: z.string().openapi({ example: '1234' }),
        redirectUrl: z.url().openapi({ example: 'http://localhost:8080' }),
        client: z.string().openapi({ example: 'tender' }),
      }),
    },
    responses: {
      301: {
        description: 'OA登录成功',
      },
    },
  }),
  async (c) => {
    const { code, redirectUrl, client } = c.req.valid('query');
    const data = await authService.loginWX(code);
    setCookie(c, 'global_session', data.token, {
      httpOnly: true,
      sameSite: 'Strict', // 防 CSRF
      maxAge: config.REDIS_EXPIRE_TIME,
      path: '/',
    });
    return c.redirect(`/sso/authorize?client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}`);
  },
);

export default app;
