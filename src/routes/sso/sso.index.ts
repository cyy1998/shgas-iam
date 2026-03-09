import { createRouter } from 'src/libs/core/create-app';
import * as handlers from './sso.handlers';
import * as routes from './sso.routes';

const router = createRouter();

router.openapi(routes.endpointsConfiguration, handlers.endpointsConfiguration)
  .openapi(routes.callback, handlers.callback)
  .openapi(routes.token, handlers.token)
  .openapi(routes.authorize, handlers.authorize)
  .openapi(routes.logout, handlers.logout)
  .openapi(routes.loginOA, handlers.loginOA)
  .openapi(routes.loginWX, handlers.loginWX);

export default router;
