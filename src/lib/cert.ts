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
import { Logger } from './logger';

const log = new Logger('lib/certs.ts')

export let key: string;
export let cert: string;
export let ca: string[] = [];
export let peerID: string;

export const init = async () => {
  log.debug("Reading key file");
  key = (await fs.readFile(path.join(utils.constants.DATA_DIRECTORY, utils.constants.KEY_FILE))).toString();
  log.debug("Reading cert file");
  cert = (await fs.readFile(path.join(utils.constants.DATA_DIRECTORY, utils.constants.CERT_FILE))).toString();
  const certData = utils.getCertData(cert);
  peerID = utils.getPeerID(certData.organization, certData.organizationUnit);
  await loadCAs();
};

export const loadCAs = async () => {
  const peerCertsPath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.PEER_CERTS_SUBDIRECTORY);
  log.debug(`Reading peer CAs from ${peerCertsPath}`);
  const peerCerts = await fs.readdir(peerCertsPath);
  for(const peerCert of peerCerts) {
    if (peerCert.toLowerCase().endsWith(".pem")) {
      log.debug(`Reading peer CA ${peerCert}`);
      ca.push((await fs.readFile(path.join(peerCertsPath, peerCert))).toString());
    } else {
      log.warn(`Ignoring non-PEM extension file or directory ${peerCert} when loading CAs`);
    }
  }
  log.debug(`Loaded ${ca.length} peer certificate(s)`);
};

export const genTLSContext = () => {
  return {
    key,
    cert,
    ca,
    rejectUnauthorized: true,
    requestCert: true,
  }
}
