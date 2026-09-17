import { dbConfig } from "../../config/db.config"


export const getMongo = () => {
    let url = null
    if (!url) {
        url = dbConfig.mongodbUri
        return url
    }


    return url
}