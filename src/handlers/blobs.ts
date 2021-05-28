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

import { promises as fs, createReadStream, createWriteStream } from 'fs';
import path from 'path';
import * as utils from '../lib/utils';
import { BlobTask, IBlobDeliveredEvent, IBlobFailedEvent, IFile } from "../lib/interfaces";
import stream from 'stream';
import RequestError from '../lib/request-error';
import crypto from 'crypto';
import FormData from 'form-data';
import https from 'https';
import { key, cert, ca } from '../lib/cert';
import { createLogger, LogLevelString } from 'bunyan';
import EventEmitter from 'events';

const log = createLogger({ name: 'handlers/blobs.ts', level: utils.constants.LOG_LEVEL as LogLevelString });

let blobQueue: BlobTask[] = [];
let sending = false;
export const eventEmitter = new EventEmitter();

export const retreiveBlob = async (filePath: string) => {
  const resolvedFilePath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.BLOBS_SUBDIRECTORY, filePath);
  if (!(await utils.fileExists(resolvedFilePath))) {
    throw new RequestError(`Blob not found`, 404);
  }
  return createReadStream(resolvedFilePath);
};

export const storeBlob = async (file: IFile, filePath: string) => {
  const resolvedFilePath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.BLOBS_SUBDIRECTORY, filePath);
  await fs.mkdir(path.parse(resolvedFilePath).dir, { recursive: true });
  let hash = crypto.createHash(utils.constants.TRANSFER_HASH_ALGORITHM);
  let hashCalculator = new stream.Transform({
    async transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(undefined, chunk);
    }
  });
  const writeStream = createWriteStream(resolvedFilePath);
  return new Promise<string>((resolve, reject) => {
    file.readableStream.on('end', () => {
      resolve(hash.digest('hex'));
    }).on('error', err => {
      reject(err);
    });
    file.readableStream.pipe(hashCalculator).pipe(writeStream);
  });
};

export const sendBlob = async (blobPath: string, recipient: string, recipientURL: string) => {
  if (sending) {
    blobQueue.push({ blobPath, recipient, recipientURL });
  } else {
    sending = true;
    blobQueue.push({ blobPath, recipient, recipientURL });
    while (blobQueue.length > 0) {
      await deliverBlob(blobQueue.shift()!);
    }
    sending = false;
  }
};

export const deliverBlob = async ({ blobPath, recipient, recipientURL }: BlobTask) => {
  const resolvedFilePath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.BLOBS_SUBDIRECTORY, blobPath);
  if (!(await utils.fileExists(resolvedFilePath))) {
    throw new RequestError('Blob not found', 404);
  }
  const stream = createReadStream(resolvedFilePath);
  const formData = new FormData();
  formData.append('blob', stream);
  const httpsAgent = new https.Agent({ cert, key, ca });
  log.trace(`Delivering blob ${blobPath} to ${recipient} at ${recipientURL}`);
  try {
    await utils.axiosWithRetry({
      method: 'put',
      url: `${recipientURL}/api/v1/blobs${blobPath}`,
      data: formData,
      headers: formData.getHeaders(),
      httpsAgent
    });
    eventEmitter.emit('event', {
      type: 'blob-delivered',
      path: blobPath,
      recipient
    } as IBlobDeliveredEvent);
    log.trace(`Blob delivered`);
  } catch (err) {
    eventEmitter.emit('event', {
      type: 'blob-failed',
      path: blobPath,
      recipient
    } as IBlobFailedEvent);
    log.error(`Failed to deliver blob ${err}`);
  }
};
