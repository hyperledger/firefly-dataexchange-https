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

export const sendMessage = async (message: string, recipient: string, recipientURL: string, requestID: string | undefined) => {
  if (sending) {
    messageQueue.push({ message, recipient, recipientURL, requestID });
  } else {
    sending = true;
    messageQueue.push({ message, recipient, recipientURL, requestID });
    while (messageQueue.length > 0) {
      await deliverMessage(messageQueue.shift()!);
    }
    sending = false;
  }
};

export const deliverMessage = async ({ message, recipient, recipientURL, requestID }: MessageTask) => {
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
      recipient,
      requestID
    } as IMessageDeliveredEvent);
    log.trace(`Message delivered`);
  } catch(err) {
    eventEmitter.emit('event', {
      type: 'message-failed',
      message,
      recipient,
      requestID,
      error: err.message,
    } as IMessageFailedEvent);
    log.error(`Failed to deliver message ${err}`);
  }
};
