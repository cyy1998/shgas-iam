import app from './app';
import { config } from './config';

const port = config.PORT;

export default {
  port,
  fetch: app.fetch,
};
