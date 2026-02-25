import type { UserDetailDto } from '@schemas/user.common.type';
import { OpenAPIHono } from '@hono/zod-openapi';
import { authenicationHandler } from '@middleware/authenication.handler';

interface AppEnv {
  Variables: {
    userId: number;
    username: string;
    userDetailDto: UserDetailDto;
  };
}

const app = new OpenAPIHono<AppEnv>();

app.use('/*', authenicationHandler);
