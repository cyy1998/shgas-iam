import Redis from 'ioredis'

export const redis = new Redis({
    host: '176.169.99.95',
    port: 6379,
    // 或使用连接字符串: redis://:password@host:port
})