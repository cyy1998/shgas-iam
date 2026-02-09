import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
    schema: 'src/libs/database/prisma/schema.prisma',
    migrations: {
        path: 'src/libs/database/prisma/migrations',
    },
    datasource: {
        url: env('DATABASE_URL'),
    },
})