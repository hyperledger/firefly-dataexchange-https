import { Request } from 'express';
import { promises as fs } from 'fs';
import { IFile } from './interfaces';
import RequestError from './request-error';
import Busboy from 'busboy';
import axios, { AxiosRequestConfig } from 'axios';
import { createLogger, LogLevelString } from 'bunyan';

export const constants = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DATA_DIRECTORY: process.env.DATA_DIRECTORY || '/data',
  PEER_CERTS_SUBDIRECTORY: 'peer-certs',
  BLOBS_SUBDIRECTORY: 'blobs',
  RECEIVED_BLOBS_SUBDIRECTORY: 'received',
  CONFIG_FILE_NAME: 'config.json',
  CERT_FILE: 'cert.pem',
  KEY_FILE: 'key.pem',
  CA_FILE: 'ca.pem',
  TRANSFER_HASH_ALGORITHM: 'sha256',
  REST_API_CALL_MAX_ATTEMPTS: 5,
  REST_API_CALL_RETRY_DELAY_MS: 500,
  MAX_EVENT_QUEUE_SIZE: 1000
};
const log = createLogger({ name: 'utils.ts', level: constants.LOG_LEVEL as LogLevelString });

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
