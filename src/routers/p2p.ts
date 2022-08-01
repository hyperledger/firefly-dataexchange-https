// Copyright © 2022 Kaleido, Inc.
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

import { Router, Request } from 'express';
import * as utils from '../lib/utils';
import * as blobsHandler from '../handlers/blobs';
import path from 'path';
import { IBlobReceivedEvent, IMessageReceivedEvent } from '../lib/interfaces';
import { v4 as uuidV4 } from 'uuid';
import { queueEvent } from '../handlers/events';
import { peerID } from '../lib/cert';

export const router = Router();

router.head('/ping', (_req, res) => {
  res.sendStatus(204);
});

router.post('/messages', async (req: Request, res, next) => {
  try {
    let sender = utils.extractPeerSenderFromRequest(req);
    const { senderDestination, recipientDestination, message } = await utils.extractMessageFromMultipartForm(req);
    if (senderDestination !== undefined) {
      sender += utils.constants.ID_SEGMENT_SEPARATOR + senderDestination;
    }
    let recipient = peerID;
    if (recipientDestination !== undefined) {
      recipient += utils.constants.ID_SEGMENT_SEPARATOR + recipientDestination;
    }
    await queueEvent({
      id: uuidV4(),
      type: 'message-received',
      sender,
      recipient,
      message
    } as IMessageReceivedEvent);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.put('/blobs/*', async (req: Request, res, next) => {
  try {
    let sender = utils.extractPeerSenderFromRequest(req);
    const { file, senderDestination, recipientDestination } = await utils.extractFileFromMultipartForm(req);
    if (senderDestination !== undefined) {
      sender += utils.constants.ID_SEGMENT_SEPARATOR + senderDestination;
    }
    let recipient = peerID;
    if (recipientDestination !== undefined) {
      recipient += utils.constants.ID_SEGMENT_SEPARATOR + recipientDestination;
    }
    const blobPath = path.join(utils.constants.RECEIVED_BLOBS_SUBDIRECTORY, sender, req.params[0]);
    const metadata = await blobsHandler.storeBlob(file, blobPath);
    res.sendStatus(204);
    await queueEvent({
      id: uuidV4(),
      type: 'blob-received',
      sender,
      recipient,
      path: blobPath,
      hash: metadata.hash,
      size: metadata.size,
      lastUpdate: metadata.lastUpdate
    } as IBlobReceivedEvent);
  } catch (err) {
    next(err);
  }
});
