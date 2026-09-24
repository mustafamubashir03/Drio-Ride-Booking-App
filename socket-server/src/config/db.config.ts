type dbConfigType = {
    redisUri: string
}

export const dbConfig: dbConfigType = {
    redisUri: process.env.REDIS_URI || '',
}