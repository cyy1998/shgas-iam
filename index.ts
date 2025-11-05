import { Hono } from 'hono'
import auth from './routes/auth'
import self from './routes/self'
import internal from './routes/internal'
import admin from './routes/admin'
import { serveStatic } from 'hono/bun'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'

const app = new OpenAPIHono()
const port = 30010

app.use('/static/*', serveStatic({ root: './' }))
app.use(logger())

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