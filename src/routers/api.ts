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

import { Request, Router } from 'express';
import { promises as fs } from 'fs';
import https from 'https';
import path from 'path';
import { v4 as uuidV4 } from 'uuid';
import * as blobsHandler from '../handlers/blobs';
import * as eventsHandler from '../handlers/events';
import * as messagesHandler from '../handlers/messages';
import { ca, cert, certBundle, key, peerID } from '../lib/cert';
import { config, persistDestinations, persistPeers } from '../lib/config';
import { IStatus } from '../lib/interfaces';
import RequestError from '../lib/request-error';
import * as utils from '../lib/utils';

export const router = Router();

let refreshCACerts: () => Promise<void>;

export const setRefreshCACerts = (fn: () => Promise<void>) => {
  refreshCACerts = fn;
}

router.get('/id', async (_req, res, next) => {
  try {
    res.send({
      id: peerID,
      endpoint: config.p2p.endpoint ?? `https://${config.p2p.hostname}:${config.p2p.port}`,
      cert: certBundle,
      destinations: config.destinations
    });
  } catch (err) {
    next(err);
  }
});

router.get('/status', async (_req, res, next) => {
  try {
    let status: IStatus = {
      ...eventsHandler.getStats(),
      peers: []
    };
    let promises = [];
    const httpsAgent = new https.Agent({ cert, key, ca });
    for (const peer of config.peers) {
      promises.push(utils.axiosWithRetry({
        method: 'head',
        url: `${peer.endpoint}/api/v1/ping`,
        httpsAgent
      }));
    }
    const responses = await (Promise as any).allSettled(promises);
    let i = 0;
    for (const peer of config.peers) {
      status.peers.push({
        id: peer.id,
        endpoint: peer.endpoint,
        available: responses[i++].status === 'fulfilled'
      })
    }
    res.send(status);
  } catch (err) {
    next(err);
  }
});

router.get('/peers', (_req, res) => {
  res.send(config.peers);
});

router.put('/peers/:id/:destination?', async (req, res, next) => {
  try {
    if (req.params.id === peerID) {
      if (req.params.destination !== undefined) {
        if (config.destinations === undefined) {
          config.destinations = [req.params.destination]
        } else if (!config.destinations.includes(req.params.destination)) {
          config.destinations.push(req.params.destination);
        }
        await persistDestinations();
      }
    } else {
      let peer = config.peers.find(peer => peer.id === req.params.id);
      if (peer === undefined) {
        if (req.body.endpoint === undefined) {
          throw new RequestError('Missing endpoint', 400);
        }
        peer = {
          id: req.params.id,
          endpoint: req.body.endpoint
        };
        config.peers.push(peer);
      }
      if (req.params.destination !== undefined) {
        if (peer.destinations === undefined) {
          peer.destinations = [req.params.destination];
        } else if (!peer.destinations.includes(req.params.destination)) {
          peer.destinations.push(req.params.destination);
        }
      }
      await persistPeers();
      if (req.body.cert !== undefined) {
        await fs.writeFile(path.join(utils.constants.DATA_DIRECTORY, utils.constants.PEER_CERTS_SUBDIRECTORY, `${req.params.id}.pem`), req.body.cert);
        await refreshCACerts();
      }
    }
    res.send({ status: 'added' });
  } catch (err) {
    next(err);
  }
});

router.delete('/peers/:id', async (req, res, next) => {
  try {
    if (!config.peers.some(peer => peer.id === req.params.id)) {
      throw new RequestError('Peer not found', 404);
    }
    try {
      await fs.rm(path.join(utils.constants.DATA_DIRECTORY, utils.constants.PEER_CERTS_SUBDIRECTORY, `${req.params.id}.pem`));
    } catch (err: any) {
      if (err.errno !== -2) {
        throw new RequestError(`Failed to remove peer certificate`);
      }
    }
    config.peers = config.peers.filter(peer => peer.id !== req.params.id);
    await persistPeers();
    res.send({ status: 'removed' });
  } catch (err) {
    next(err);
  }
});

router.post('/messages', async (req, res, next) => {
  try {
    if (req.body.message === undefined) {
      throw new RequestError('Missing message', 400);
    }
    let senderDestination: string | undefined = undefined;
    if (typeof req.body.sender === 'string') {
      const segments = req.body.sender.split('/');
      if (segments[0] !== peerID) {
        throw new RequestError(`Sender ID mismatch expected=${peerID} recieved=${segments[0]}`, 400);
      }
      if (segments.length > 1) {
        if (!config.destinations?.includes(segments[1])) {
          throw new RequestError(`Unknown sender destination expected=${config.destinations?.join('|') ?? 'none'} recieved=${segments[1]}`, 400);
        }
        senderDestination = segments[1];
      }
    }
    let recipientID: string;
    let recipientDestination: string | undefined = undefined;
    if (typeof req.body.recipient === 'string') {
      const segments = req.body.recipient.split('/');
      recipientID = segments[0];
      if (segments.length > 1) {
        recipientDestination = segments[1];
      }
    } else {
      throw new RequestError('Missing recipient', 400);
    }
    let recipientPeer = config.peers.find(peer => peer.id === recipientID);
    if (recipientPeer === undefined) {
      throw new RequestError(`Unknown recipient ${recipientID}`, 400);
    }
    if (recipientDestination !== undefined && !recipientPeer.destinations?.includes(recipientDestination)) {
      throw new RequestError(`Unknown recipient destination expected=${recipientPeer.destinations?.join('|') ?? 'none'} recieved=${recipientDestination}`, 400);
    }
    let requestId = uuidV4();
    if (typeof req.body.requestId === 'string') {
      requestId = req.body.requestId;
    }
    messagesHandler.sendMessage(req.body.message, recipientID, recipientPeer.endpoint, requestId, senderDestination, recipientDestination);
    res.send({ requestId });
  } catch (err) {
    next(err);
  }
});

router.head('/blobs/*', async (req: Request, res, next) => {
  try {
    const blobPath = `/${req.params[0]}`;
    if (!utils.regexp.FILE_KEY.test(blobPath) || utils.regexp.CONSECUTIVE_DOTS.test(blobPath)) {
      throw new RequestError('Invalid path', 400);
    }
    const metadata = await blobsHandler.retrieveMetadata(blobPath);
    res.setHeader(utils.constants.HASH_HEADER_NAME, metadata.hash);
    res.setHeader(utils.constants.SIZE_HEADER_NAME, metadata.size);
    res.setHeader(utils.constants.LAST_UPDATE_HEADER_NAME, metadata.lastUpdate);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/blobs/*', async (req: Request, res, next) => {
  try {
    const blobPath = `/${req.params[0]}`;
    if (!utils.regexp.FILE_KEY.test(blobPath) || utils.regexp.CONSECUTIVE_DOTS.test(blobPath)) {
      throw new RequestError('Invalid path', 400);
    }
    const metadata = await blobsHandler.retrieveMetadata(blobPath);
    res.setHeader(utils.constants.HASH_HEADER_NAME, metadata.hash);
    res.setHeader(utils.constants.SIZE_HEADER_NAME, metadata.size);
    res.setHeader(utils.constants.LAST_UPDATE_HEADER_NAME, metadata.lastUpdate);
    const blobStream = await blobsHandler.retrieveBlob(blobPath);
    blobStream.pipe(res);
  } catch (err) {
    next(err);
  }
});

router.put('/blobs/*', async (req: Request, res, next) => {
  try {
    const blobPath = `/${req.params[0]}`;
    if (!utils.regexp.FILE_KEY.test(blobPath) || utils.regexp.CONSECUTIVE_DOTS.test(blobPath)) {
      throw new RequestError('Invalid path', 400);
    }
    const { file } = await utils.extractFileFromMultipartForm(req);
    const metadata = await blobsHandler.storeBlob(file, blobPath);
    res.send(metadata);
  } catch (err) {
    next(err);
  }
});

router.post('/transfers', async (req, res, next) => {
  try {
    if (req.body.path === undefined) {
      throw new RequestError('Missing path', 400);
    }
    if (!utils.regexp.FILE_KEY.test(req.body.path) || utils.regexp.CONSECUTIVE_DOTS.test(req.body.path)) {
      throw new RequestError('Invalid path', 400);
    }
    await blobsHandler.retrieveMetadata(req.body.path);
    let senderDestination: string | undefined = undefined;
    if (typeof req.body.sender === 'string') {
      const segments = req.body.sender.split('/');
      if (segments[0] !== peerID) {
        throw new RequestError(`Sender ID mismatch expected=${peerID} recieved=${segments[0]}`, 400);
      }
      if (segments.length > 1) {
        if (!config.destinations?.includes(segments[1])) {
          throw new RequestError(`Unknown sender destination expected=${config.destinations?.join('|')} recieved=${segments[1]}`, 400);
        }
        senderDestination = segments[1];
      }
    }
    let recipientID: string;
    let recipientDestination: string | undefined = undefined;
    if (typeof req.body.recipient === 'string') {
      const segments = req.body.recipient.split('/');
      recipientID = segments[0];
      if (segments.length > 1) {
        recipientDestination = segments[1];
      }
    } else {
      throw new RequestError('Missing recipient', 400);
    }
    let recipientPeer = config.peers.find(peer => peer.id === recipientID);
    if (recipientPeer === undefined) {
      throw new RequestError(`Unknown recipient`, 400);
    }
    if (recipientDestination !== undefined && !recipientPeer.destinations?.includes(recipientDestination)) {
      throw new RequestError(`Unknown recipient destination expected=${recipientPeer.destinations?.join('|')} recieved=${recipientDestination}`, 400);
    }
    let requestId = uuidV4();
    if (typeof req.body.requestId === 'string') {
      requestId = req.body.requestId;
    }
    blobsHandler.sendBlob(req.body.path, recipientID, recipientPeer.endpoint, requestId, senderDestination, recipientDestination);
    res.send({ requestId });
  } catch (err) {
    next(err);
  }
});
