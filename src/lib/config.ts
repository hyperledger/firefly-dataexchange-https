import { promises as fs } from 'fs';
import Ajv from 'ajv';
import configSchema from '../schemas/config.json';
import * as utils from './utils';
import { IConfig } from './interfaces';
import path from 'path';

const ajv = new Ajv();
const validateConfig = ajv.compile(configSchema);
const configFilePath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.CONFIG_FILE_NAME);

export let config: IConfig;

export const init = async () => {
  await loadConfigFile();
};

const loadConfigFile = async () => {
  try {
    const data = JSON.parse(await fs.readFile(configFilePath, 'utf8'));
    if(validateConfig(data)) {
      config = data as IConfig;
      for(const peer of config.peers) {
        if(peer.endpoint.endsWith('/')) {
          peer.endpoint = peer.endpoint.slice(-0, -1);
        }
      }
    } else {
      throw new Error('Invalid configuration file');
    }
  } catch(err) {
    throw new Error(`Failed to read configuration file. ${err}`);
  }
};

export const persistConfig = async () => {
  await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
};