import https from 'https';
import * as utils from '../lib/utils';
import { key, cert, ca } from '../lib/cert';
import { IMessageDeliveredEvent, IMessageFailedEvent, MessageTask } from '../lib/interfaces';
import FormData from 'form-data';
import EventEmitter from 'events';
import { createLogger, LogLevelString } from 'bunyan';

const log = createLogger({ name: 'handlers/messages.ts', level: utils.constants.LOG_LEVEL as LogLevelString });

let messageQueue: MessageTask[] = [];
let sending = false;
export const eventEmitter = new EventEmitter();

export const sendMessage = async (message: string, recipient: string, recipientURL: string) => {
  if (sending) {
    messageQueue.push({ message, recipient, recipientURL });
  } else {
    sending = true;
    messageQueue.push({ message, recipient, recipientURL });
    while (messageQueue.length > 0) {
      await deliverMessage(messageQueue.shift()!);
    }
    sending = false;
  }
};

export const deliverMessage = async ({ message, recipient, recipientURL }: MessageTask) => {
  const httpsAgent = new https.Agent({ cert, key, ca });
  const formData = new FormData();
  formData.append('message', message);
  log.trace(`Delivering message to ${recipient} at ${recipientURL}`);
  try {
    await utils.axiosWithRetry({
      method: 'post',
      url: `${recipientURL}/api/v1/messages`,
      data: formData,
      headers: formData.getHeaders(),
      httpsAgent
    });
    eventEmitter.emit('event', {
      type: 'message-delivered',
      message,
      recipient
    } as IMessageDeliveredEvent);
    log.trace(`Message delivered`);
  } catch(err) {
    eventEmitter.emit('event', {
      type: 'message-failed',
      message,
      recipient
    } as IMessageFailedEvent);
    log.error(`Failed to deliver message ${err}`);
  }
};
