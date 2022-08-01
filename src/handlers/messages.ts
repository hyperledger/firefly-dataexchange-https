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

import FormData from 'form-data';
import https from 'https';
import { v4 as uuidV4 } from 'uuid';
import { ca, cert, key, peerID } from '../lib/cert';
import { IMessageDeliveredEvent, IMessageFailedEvent, MessageTask } from '../lib/interfaces';
import { Logger } from '../lib/logger';
import * as utils from '../lib/utils';
import { queueEvent } from './events';

const log = new Logger('handlers/messages.ts');

let messageQueue: MessageTask[] = [];
let sending = false;

export const sendMessage = async (message: string, recipientID: string, recipientURL: string, requestId: string | undefined,
  senderDestination: string | undefined, recipientDestination: string | undefined) => {
  if (sending) {
    messageQueue.push({ message, recipientID, recipientURL, requestId, senderDestination, recipientDestination });
  } else {
    sending = true;
    messageQueue.push({ message, recipientID, recipientURL, requestId, senderDestination, recipientDestination });
    while (messageQueue.length > 0) {
      await deliverMessage(messageQueue.shift()!);
    }
    sending = false;
  }
};

export const deliverMessage = async ({ message, recipientID, recipientURL, requestId, senderDestination, recipientDestination }: MessageTask) => {
  const httpsAgent = new https.Agent({ cert, key, ca });
  const formData = new FormData();
  let sender = peerID;
  if(senderDestination !== undefined) {
    formData.append('senderDestination', senderDestination);
    sender += utils.constants.ID_SEGMENT_SEPARATOR + senderDestination
  }
  let recipient = recipientID;
  if(recipientDestination !== undefined) {
    formData.append('recipientDestination', recipientDestination);
    recipient += utils.constants.ID_SEGMENT_SEPARATOR + recipientDestination;
  }
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
    await queueEvent({
      id: uuidV4(),
      type: 'message-delivered',
      message,
      sender,
      recipient,
      requestId
    } as IMessageDeliveredEvent);
    log.trace(`Message delivered`);
  } catch(err: any) {
    await queueEvent({
      id: uuidV4(),
      type: 'message-failed',
      message,
      sender,
      recipient,
      requestId,
      error: err.message,
    } as IMessageFailedEvent);
    log.error(`Failed to deliver message ${err}`);
  }
};
