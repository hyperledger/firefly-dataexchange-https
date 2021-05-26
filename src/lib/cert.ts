import * as utils from '../lib/utils';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger, LogLevelString } from 'bunyan';

const log = createLogger({ name: 'lib/certs.ts', level: utils.constants.LOG_LEVEL as LogLevelString });

export let key: string;
export let cert: string;
export let ca: string[] = [];

export const init = async () => {
  key = (await fs.readFile(path.join(utils.constants.DATA_DIRECTORY, utils.constants.KEY_FILE))).toString();
  cert = (await fs.readFile(path.join(utils.constants.DATA_DIRECTORY, utils.constants.CERT_FILE))).toString();
  loadCAs();
};

export const loadCAs = async () => {
  const peerCertsPath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.PEER_CERTS_SUBDIRECTORY);
  const peerCerts = await fs.readdir(peerCertsPath);
  for(const peerCert of peerCerts) {
    ca.push((await fs.readFile(path.join(peerCertsPath, peerCert))).toString());
  }
  log.debug(`Loaded ${ca.length} peer certificate(s)`);
};
