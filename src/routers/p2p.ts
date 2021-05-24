import { Router } from 'express';
import * as utils from '../lib/utils';
import * as blobsHandler from '../handlers/blobs';
import path from 'path';
import { EventEmitter } from 'events';
import { IBlobReceivedEvent, IMessageReceivedEvent } from '../lib/interfaces';

export const router = Router();
export const eventEmitter = new EventEmitter();

router.head('/ping', (_req, res) => {
  res.sendStatus(204);
});

router.post('/messages', async (req, res, next) => {
  try {
    const cert = req.client.getPeerCertificate();
    const sender = cert.issuer.O;
    const message = await utils.extractMessageFromMultipartForm(req);
    eventEmitter.emit('event', {
      type: 'message-received',
      sender,
      message
    } as IMessageReceivedEvent);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.put('/blobs/*', async (req, res, next) => {
  try {
    const cert = req.client.getPeerCertificate();
    const sender = cert.issuer.O;
    const file = await utils.extractFileFromMultipartForm(req);
    const blobPath = path.join(utils.constants.RECEIVED_BLOBS_SUBDIRECTORY, sender, req.params[0]);
    const hash = await blobsHandler.storeBlob(file, blobPath);
    res.sendStatus(204);
    eventEmitter.emit('event', {
      type: 'blob-received',
      sender,
      path: blobPath,
      hash
    } as IBlobReceivedEvent);
  } catch (err) {
    next(err);
  }
});
