import auth from './routes/auth.route'
import self from './routes/self.route'
import internal from './routes/internal.route'
import admin from './routes/admin.route'
import { serveStatic } from 'hono/bun'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import { env } from './config'
import { makeResponse } from './utils'
import { ServiceStatusCode } from './constants/service.status'

const app = new OpenAPIHono()
const port = env.PORT

app.use('/static/*', serveStatic({ root: './' }))
// app.use('*', async (c, next) => {
//   const ip = c.req.header('X-Forwarded-For')
//   const uri = c.req.header('X-Forwarded-Uri')
//   const host = c.req.header('X-Forwarded-Host')

//   console.log('User-URI', uri)
//   console.log('User-Host', host)
//   await next()
// })
app.use(logger(
  (str: string, ...args: any[]) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${str}`, ...args)
  }
))
app.onError((err, c) => {
  console.error(err)
  return c.json(makeResponse(ServiceStatusCode.Failure, null, '服务器内部错误'))
})

app.route('/auth', auth)
app.route('/self', self)
app.route('/internal/iam', internal)
app.route('/admin', admin)
// app.route('/doc', doc)

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

export default {
  port,
  fetch: app.fetch
}