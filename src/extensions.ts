import Redis from 'ioredis'
import { PrismaClient, User, Prisma } from '../generated/prisma'

export const redis = new Redis({
    host: '176.169.99.95',
    port: 6379,
    // 或使用连接字符串: redis://:password@host:port
})

export const prisma = new PrismaClient()