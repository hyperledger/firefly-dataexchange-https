import express from 'express';
import https from 'https';
import http from 'http';
import WebSocket from 'ws';
import { init as initConfig, config } from './lib/config';
import { init as initCert, key, cert, ca } from './lib/cert';
import { createLogger, LogLevelString } from 'bunyan';
import * as utils from './lib/utils';
import { router as apiRouter } from './routers/api';
import { router as p2pRouter, eventEmitter as p2pEventEmitter } from './routers/p2p';
import RequestError, { errorHandler } from './lib/request-error';
import * as eventsHandler from './handlers/events'
import { eventEmitter as blobsEventEmitter } from './handlers/blobs';
import { eventEmitter as messagesEventEmitter } from './handlers/messages';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

const log = createLogger({ name: 'app.ts', level: utils.constants.LOG_LEVEL as LogLevelString });

const swaggerDocument = YAML.load(path.join(__dirname, './swagger.yaml'));

let delegatedWebSocket: WebSocket | undefined = undefined;

export const start = async () => {
  await initConfig();
  await initCert();

  const apiApp = express();
  const apiServer = http.createServer(apiApp);

  const p2pApp = express();
  const p2pServer = https.createServer({
    key,
    cert,
    ca,
    rejectUnauthorized: true,
    requestCert: true,
  }, p2pApp);

  const wss = new WebSocket.Server({
    server: apiServer, verifyClient: (info, cb) => {
      if (info.req.headers['x-api-key'] === config.apiKey) {
        cb(true);
      } else {
        cb(false, 401, 'Unauthorized');
      }
    }
  });

  p2pEventEmitter.addListener('event', event => eventsHandler.queueEvent(event));
  blobsEventEmitter.addListener('event', event => eventsHandler.queueEvent(event));
  messagesEventEmitter.addListener('event', event => eventsHandler.queueEvent(event));
    
  eventsHandler.eventEmitter.addListener('event', event => {
    if(delegatedWebSocket !== undefined) {
      delegatedWebSocket.send(JSON.stringify(event));
    }
  });
  
  // eventsHandler.eventEmitter.addListener('event', event => wss.clients.forEach(client => client.send(JSON.stringify(event))));

  const assignWebSocketDelegate = (webSocket: WebSocket) => {
    delegatedWebSocket = webSocket;
    const event = eventsHandler.getCurrentEvent();
    webSocket.on('message', async message => {
      try {
        const messageContent = JSON.parse(message.toLocaleString());
        if (messageContent.action === 'commit') {
          eventsHandler.handleCommit();
        }
      } catch (err) {
        log.error(`Failed to process websocket message ${err}`);
      }
    });
    if (event !== undefined) {
      webSocket.send(JSON.stringify(event));
    }
    webSocket.on('close', () => {
      assignWebSocketDelegate(wss.clients.values().next().value);
    });
  };

  wss.on('connection', (webSocket: WebSocket) => {
    if(delegatedWebSocket === undefined) {
      assignWebSocketDelegate(webSocket);
    }
  });

  apiApp.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  apiApp.use((req, res, next) => {
    if (req.path === '/') {
      res.redirect('/swagger');
    } else {
      if (req.headers['x-api-key'] !== config.apiKey) {
        next(new RequestError('Unauthorized', 401));
      } else {
        next();
      }
    }
  });

  apiApp.use(express.urlencoded({ extended: true }));
  apiApp.use(express.json());
  apiApp.use('/api/v1', apiRouter);
  apiApp.use(errorHandler);

  p2pApp.use('/api/v1', p2pRouter);
  p2pApp.use(errorHandler);

  const apiServerPromise = new Promise<void>(resolve => apiServer.listen(config.apiPort, () => resolve()));
  const p2pServerPromise = new Promise<void>(resolve => p2pServer.listen(config.p2pPort, () => resolve()));
  await Promise.all([apiServerPromise, p2pServerPromise]);
  log.info(`Data exchange listening on ports ${config.apiPort} (API) and ${config.p2pPort} (P2P) - log level "${utils.constants.LOG_LEVEL}"`);

};
