import { config } from "./config";
import app from "./app"


const port = config.PORT

export default {
    port,
    fetch: app.fetch
}