type dbConfigType = {
    mongodbUri: string
    redisUri: string
}

export const dbConfig: dbConfigType = {
    mongodbUri: process.env.MONGO_URI || '',
    redisUri: process.env.REDIS_URI || '',
}