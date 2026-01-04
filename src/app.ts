import authRoutes from './routes/auth.route'
import publicRoutes from './routes/public.route'
import internalRoutes from './routes/internal.route'
import adminRoutes from './routes/admin.route'
import openRoutes from './routes/open.route'
import { serveStatic } from 'hono/bun'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import { makeResponse } from './utils/response.utils'
import { ServiceStatusCode } from './constants/service.status'
import { CustomError } from './errors/CustomError'
import { AuthzError } from './errors/AuthzError'

const app = new OpenAPIHono()
// const port = env.PORT

app.use('/static/*', serveStatic({ root: './' }))

app.use(logger(
  (str: string, ...args: any[]) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${str}`, ...args)
  }
))


app.route('/auth', authRoutes)
app.route('/public', publicRoutes)
app.route('/open', openRoutes)
app.route('/internal', internalRoutes)
app.route('/admin', adminRoutes)

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'IAM Service',
  },
})

app.get('/doc/swagger', (c) => {
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
  `
  return c.html(html)
})

app.onError((err, c) => {
  if (err instanceof CustomError) {
    return c.json(makeResponse(err.code, null, err.message))
  }
  else if (err instanceof AuthzError) {
    return c.json(makeResponse(err.code, null, err.message), err.httpCode)
  }
  else {
    console.error(err)
    return c.json(makeResponse(ServiceStatusCode.Failure, null, '服务器内部错误'))
  }
})

export default app