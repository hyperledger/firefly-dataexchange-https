import { Router } from 'express';
import * as blobsHandler from '../handlers/blobs';
import * as messagesHandler from '../handlers/messages';
import * as utils from '../lib/utils';
import RequestError from '../lib/request-error';
import { config } from '../lib/config';
import { IStatus } from '../lib/interfaces';
import https from 'https';
import { key, cert, ca } from '../lib/cert';
import * as eventsHandler from '../handlers/events';

export const router = Router();

router.get('/status', async (_req, res, next) => {
  try {
    let status: IStatus = {
      messageQueueSize: eventsHandler.getQueueSize(),
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
        name: peer.name,
        available: responses[i++].status === 'fulfilled'
      })
    }
    res.send(status);
  } catch (err) {
    next(err);
  }
});

router.get('/peers', async (_req, res) => {
  res.send(config.peers);
});

router.post('/messages', async (req, res, next) => {
  try {
    if (req.body.message === undefined) {
      throw new RequestError('Missing message', 400);
    }
    if (req.body.recipient === undefined) {
      throw new RequestError('Missing recipient', 400);
    }
    let recipientURL = config.peers.find(peer => peer.name === req.body.recipient)?.endpoint;
    if (recipientURL === undefined) {
      throw new RequestError(`Unknown recipient`, 400);
    }
    messagesHandler.sendMessage(req.body.message, req.body.recipient, recipientURL);
    res.send({ status: 'submitted' });
  } catch (err) {
    next(err);
  }
});

router.get('/blobs/*', async (req, res, next) => {
  try {
    if (!utils.regexp.FILE_KEY.test(req.body.path) || utils.regexp.CONSECUTIVE_DOTS.test(req.body.path)) {
      throw new RequestError('Invalid path', 400);
    }
    let blobStream = await blobsHandler.retreiveBlob(req.params[0]);
    blobStream.on('end', () => res.end());
    blobStream.pipe(res);
  } catch (err) {
    next(err);
  }
});

router.put('/blobs/*', async (req, res, next) => {
  try {
    if (!utils.regexp.FILE_KEY.test(req.body.path) || utils.regexp.CONSECUTIVE_DOTS.test(req.body.path)) {
      throw new RequestError('Invalid path', 400);
    }
    const file = await utils.extractFileFromMultipartForm(req);
    const hash = await blobsHandler.storeBlob(file, req.params[0]);
    res.send({ hash });
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
    if (req.body.recipient === undefined) {
      throw new RequestError('Missing recipient', 400);
    }
    let recipientURL = config.peers.find(peer => peer.name === req.body.recipient)?.endpoint;
    if (recipientURL === undefined) {
      throw new RequestError(`Unknown recipient`, 400);
    }
    blobsHandler.sendBlob(req.body.path, req.body.recipient, recipientURL);
    res.send({ status: 'submitted' });
  } catch (err) {
    next(err);
  }
});
