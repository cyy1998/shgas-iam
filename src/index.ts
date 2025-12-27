import { env } from "./config";
import app from "./app"


const port = env.PORT

export default {
    port,
    fetch: app.fetch
}