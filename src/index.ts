import { createLogger, LogLevelString } from 'bunyan';
import * as utils from './lib/utils';
import { start } from './app';

const log = createLogger({ name: 'index.ts', level: utils.constants.LOG_LEVEL as LogLevelString });

start().catch(err => {
  log.error(`Failed to start blob exchange ${err}`);
});
