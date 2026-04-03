import { OpenAPIHono } from "@hono/zod-openapi";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { pinoLogger } from "@/lib/clients/pino";
import { errorHandler } from "./middlewares/error.handler";
import adminClientRoutes from "./routes/admin/client/client.index";
import adminEmploymentRoutes from "./routes/admin/employment/employment.index";
import adminOrganizationRoutes from "./routes/admin/organization/organization.index";
import adminPositionRoutes from "./routes/admin/position/position.index";
import adminUserRoutes from "./routes/admin/user/user.index";
import authRoutes from "./routes/auth/auth.index";
import internalRoutes from "./routes/internal/internal.index";
import openRoutes from "./routes/open/open.index";
import publicRoutes from "./routes/public/public.index";
import ssoRoutes from "./routes/sso/sso.index";

const app = new OpenAPIHono();
// const port = env.PORT

app.use("/static/*", serveStatic({ root: "./" }));

app.use(logger(
  (str: string, ...args: any[]) => {
    pinoLogger.info(`[INFO] ${new Date().toISOString()} - ${str}`, ...args);
    // pinoLogger.info({ type: 'query' });
  },
));

app.onError(errorHandler);

app.route("/auth", authRoutes);
app.route("/public", publicRoutes);
app.route("/internal", internalRoutes);
app.route("/open", openRoutes);
app.route("/sso", ssoRoutes);
app.route("/admin/users", adminUserRoutes);
app.route("/admin/organizations", adminOrganizationRoutes);
app.route("/admin/employments", adminEmploymentRoutes);
app.route("/admin/positions", adminPositionRoutes);
app.route("/admin/clients", adminClientRoutes);

app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "IAM Service",
  },
});

app.get("/doc/swagger", (c) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="/static/swagger/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/static/swagger/swagger-ui-bundle.js"></script>
  <script src="/static/swagger/swagger-ui-standalone-preset.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/doc', // 指向你的 OpenAPI JSON 地址
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIStandalonePreset
      ],
      layout: "StandaloneLayout"
    })
  </script>
</body>
</html>
  `;
  return c.html(html);
});

export default app;
