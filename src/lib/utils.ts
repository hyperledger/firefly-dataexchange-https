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

import axios, { AxiosRequestConfig } from 'axios';
import Busboy from 'busboy';
import { Request } from 'express';
import { promises as fs } from 'fs';
import { X509 } from 'jsrsasign';
import { ICertData, IFile } from './interfaces';
import { Logger } from './logger';
import RequestError from './request-error';

export const constants = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DATA_DIRECTORY: process.env.DATA_DIRECTORY || '/data',
  PEER_CERTS_SUBDIRECTORY: 'peer-certs',
  BLOBS_SUBDIRECTORY: 'blobs',
  METADATA_SUFFIX: '.metadata.json',
  RECEIVED_BLOBS_SUBDIRECTORY: 'received',
  CONFIG_FILE_NAME: 'config.json',
  PEERS_FILE_NAME: 'peers/data.json',
  CERT_FILE: 'cert.pem',
  KEY_FILE: 'key.pem',
  CA_FILE: 'ca.pem',
  TRANSFER_HASH_ALGORITHM: 'sha256',
  REST_API_CALL_MAX_ATTEMPTS: 5,
  REST_API_CALL_RETRY_DELAY_MS: 500,
  MAX_EVENT_QUEUE_SIZE: 1000,
  HASH_HEADER_NAME: 'dx-hash',
  LAST_UPDATE_HEADER_NAME: 'dx-last-update'
};
const log = new Logger('utils.ts')

export const regexp = {
  FILE_KEY: /^(\/[a-z0-9\+\-\_\.]+)+$/,
  CONSECUTIVE_DOTS: /\.\./
};

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await fs.stat(filePath);
    return !stats.isDirectory();
  } catch (err) {
    if (err.errno === -2) {
      return false;
    } else {
      throw err;
    }
  }
  return true;
}

export const extractFileFromMultipartForm = (req: Request): Promise<IFile> => {
  return new Promise(async (resolve, reject) => {
    let fileFound = false;
    req.pipe(new Busboy({ headers: req.headers })
      .on('file', (fieldname, readableStream, fileName) => {
        fileFound = true;
        resolve({
          key: fieldname,
          name: fileName,
          readableStream
        });
      })).on('finish', () => {
        if (!fileFound) {
          reject(new RequestError('Missing blob', 400));
        }
      });
  });
};

export const extractMessageFromMultipartForm = (req: Request): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    let fieldFound = false;
    req.pipe(new Busboy({ headers: req.headers })
      .on('field', (fieldname, value) => {
        if(fieldname === 'message') {
          fieldFound = true;
          resolve(value);
        }
      })).on('finish', () => {
        if (!fieldFound) {
          reject(new RequestError('Missing message', 400));
        }
      });
  });
};

export const axiosWithRetry = async (config: AxiosRequestConfig) => {
  let attempts = 0;
  let currentError;
  while (attempts < constants.REST_API_CALL_MAX_ATTEMPTS) {
    try {
      log.debug(`${config.method} ${config.url}`);
      return await axios(config);
    } catch (err) {
      const data = err.response?.data;
      log.error(`${config.method} ${config.url} attempt ${attempts} [${err.response?.status}]`, (data && !data.on) ? data : err.stack);
      if (err.response?.status === 404) {
        throw err;
      } else {
        currentError = err;
        attempts++;
        await new Promise(resolve => setTimeout(resolve, constants.REST_API_CALL_RETRY_DELAY_MS));
      }
    }
  }
  throw currentError;
};

export const getPeerID = (organization: string | undefined, organizationUnit: string | undefined) => {
  if(organization !== undefined) {
    if(organizationUnit !== undefined) {
      return `${organization}-${organizationUnit}`;
    } else {
      return organization;
    }
  } else if(organizationUnit !== undefined) {
    return organizationUnit;
  } else {
    throw new Error('Invalid peer');
  }
};

export const getCertData = (cert: string): ICertData => {
  const x509 = new X509();
  x509.readCertPEM(cert);
  const subject = x509.getSubjectString();
  const o = subject.match('O=([^\/.]+)');
  let certData: ICertData = {};
  if(o !== null) {
    certData.organization = o[1];
  }
  const ou = subject.match('OU=([^\/.]+)');
  if(ou !== null) {
    certData.organizationUnit = ou[1];
  }
  return certData;
};