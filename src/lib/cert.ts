// Copyright © 2021 Kaleido, Inc.
//
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as utils from '../lib/utils';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger, LogLevelString } from 'bunyan';

const log = createLogger({ name: 'lib/certs.ts', level: utils.constants.LOG_LEVEL as LogLevelString });

export let key: string;
export let cert: string;
export let ca: string[] = [];
export let peerID: string;

export const init = async () => {
  key = (await fs.readFile(path.join(utils.constants.DATA_DIRECTORY, utils.constants.KEY_FILE))).toString();
  cert = (await fs.readFile(path.join(utils.constants.DATA_DIRECTORY, utils.constants.CERT_FILE))).toString();
  const certData = utils.getCertData(cert);
  peerID = utils.getPeerID(certData.organization, certData.organizationUnit);
  await loadCAs();
};

export const loadCAs = async () => {
  const peerCertsPath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.PEER_CERTS_SUBDIRECTORY);
  const peerCerts = await fs.readdir(peerCertsPath);
  for(const peerCert of peerCerts) {
    ca.push((await fs.readFile(path.join(peerCertsPath, peerCert))).toString());
  }
  log.debug(`Loaded ${ca.length} peer certificate(s)`);
};
