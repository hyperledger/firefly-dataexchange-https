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

import crypto from 'crypto';
import EventEmitter from 'events';
import FormData from 'form-data';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import https from 'https';
import path from 'path';
import stream from 'stream';
import { v4 as uuidV4 } from 'uuid';
import { ca, cert, key } from '../lib/cert';
import { BlobTask, IBlobDeliveredEvent, IBlobFailedEvent, IFile, IMetadata } from "../lib/interfaces";
import { Logger } from '../lib/logger';
import RequestError from '../lib/request-error';
import * as utils from '../lib/utils';

const log = new Logger("handlers/blobs.ts")

let blobQueue: BlobTask[] = [];
let sending = false;
export const eventEmitter = new EventEmitter();

export const retreiveBlob = async (filePath: string) => {
  const resolvedFilePath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.BLOBS_SUBDIRECTORY, filePath);
  if (!(await utils.fileExists(resolvedFilePath))) {
    throw new RequestError(`Blob content missing from storage`, 404);
  }
  return createReadStream(resolvedFilePath);
};

export const storeBlob = async (file: IFile, filePath: string) => {
  const resolvedFilePath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.BLOBS_SUBDIRECTORY, filePath);
  await fs.mkdir(path.parse(resolvedFilePath).dir, { recursive: true });
  let hash = crypto.createHash(utils.constants.TRANSFER_HASH_ALGORITHM);
  const writeStream = createWriteStream(resolvedFilePath);
  const blobHash = await new Promise<string>((resolve, reject) => {
    let hashCalculator = new stream.Transform({
      transform(chunk, _enc, cb) {
        hash.update(chunk);
        cb(undefined, chunk);
      },
      flush(cb) {
        resolve(hash.digest('hex'));
        cb();
      }
    });
      file.readableStream.on('error', err => {
      reject(err);
    });
    file.readableStream.pipe(hashCalculator).pipe(writeStream);
  });
  return await upsertMetadata(filePath, blobHash);
};

export const sendBlob = async (blobPath: string, recipient: string, recipientURL: string, requestID: string | undefined) => {
  if (sending) {
    blobQueue.push({ blobPath, recipient, recipientURL, requestID });
  } else {
    sending = true;
    blobQueue.push({ blobPath, recipient, recipientURL, requestID });
    while (blobQueue.length > 0) {
      await deliverBlob(blobQueue.shift()!);
    }
    sending = false;
  }
};

export const deliverBlob = async ({ blobPath, recipient, recipientURL, requestID }: BlobTask) => {
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
      id: uuidV4(),
      type: 'blob-delivered',
      path: blobPath,
      recipient,
      requestID
    } as IBlobDeliveredEvent);
    log.trace(`Blob delivered`);
  } catch (err: any) {
    eventEmitter.emit('event', {
      id: uuidV4(),
      type: 'blob-failed',
      path: blobPath,
      recipient,
      requestID,
      error: err.message,
    } as IBlobFailedEvent);
    log.error(`Failed to deliver blob ${err}`);
  }
};

export const retreiveMetadata = async (filePath: string) => {
  const resolvedFilePath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.BLOBS_SUBDIRECTORY, filePath + utils.constants.METADATA_SUFFIX);
  if (!(await utils.fileExists(resolvedFilePath))) {
    throw new RequestError(`Blob not found`, 404);
  }
  try {
    const metadataString = await fs.readFile(resolvedFilePath);
    return JSON.parse(metadataString.toString()) as IMetadata;
  } catch(err) {
    throw new RequestError(`Invalid blob`);
  }
};

export const upsertMetadata = async (filePath: string, hash: string) => {
  const resolvedFilePath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.BLOBS_SUBDIRECTORY, filePath + utils.constants.METADATA_SUFFIX);
  await fs.mkdir(path.parse(resolvedFilePath).dir, { recursive: true });
  let metadata: IMetadata = {
    hash,
    lastUpdate: new Date().getTime()
  };
  await fs.writeFile(resolvedFilePath, JSON.stringify(metadata));
  return metadata;
};
