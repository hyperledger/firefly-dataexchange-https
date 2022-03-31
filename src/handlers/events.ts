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

import EventEmitter from "events";
import { IAckEvent, IConfig, OutboundEvent } from "../lib/interfaces";
import { Logger } from "../lib/logger";
import * as utils from '../lib/utils';

const log = new Logger("handlers/events.ts")

let maxInflight = utils.constants.DEFAULT_MAX_INFLIGHT;
let maxEventQueueSize = utils.constants.MAX_EVENT_QUEUE_SIZE;
let eventQueue: OutboundEvent[];
let inFlight: OutboundEvent[];

let eventEmitter: EventEmitter;
let unblockPromise: Promise<void> | undefined;
let unblock: (() => void) | undefined;

export const init = async (config: IConfig) => {
  eventEmitter = new EventEmitter();
  eventQueue = [];
  inFlight = [];
  unblockPromise = undefined;
  unblock = undefined;
  if (config.events?.maxInflight !== undefined) {
    maxInflight = config.events.maxInflight;
  }
  if (config.events?.queueSize !== undefined) {
    maxEventQueueSize = config.events.queueSize;
  }
}

const dispatchNext = () => {
  if (inFlight.length < maxInflight) {
    const event = eventQueue.shift();
    if (event) {
      inFlight.push(event)
      log.debug(`${event.id}: dispatched`);
      eventEmitter.emit('event', event);
    }
  }

  if (eventQueue.length < maxEventQueueSize && unblock) {
    unblock();
    unblockPromise = undefined;
    unblock = undefined;
    log.info(`Event queue unblocked (length=${eventQueue.length})`);
  }
}

export const queueEvent = async (socketEvent: OutboundEvent) => {

  let currentUnblockPromise = unblockPromise;
  if (currentUnblockPromise) {
    let blockedTime = Date.now();
    log.warn(`${socketEvent.id}: delaying receive due to full event queue (length=${eventQueue.length})`);
    await currentUnblockPromise;
    log.info(`${socketEvent.id}: unblocked receive after ${Date.now()-blockedTime}ms`);
  }

  eventQueue.push(socketEvent);
  if (eventQueue.length >= maxEventQueueSize && !unblockPromise) {
    log.warn(`Event queue became full (length=${eventQueue.length})`);
    unblockPromise = new Promise(resolve => {
      unblock = resolve;
    })
  }

  dispatchNext();
};

export const reDispatchInFlight = () => {
  for (const event of inFlight) {
    eventEmitter.emit('event', event)
  }
}

export const handleAck = (ack: IAckEvent) => {

  // Check we have something in-flight
  if (inFlight.length <= 0) {
    log.error(`Ack for ${ack.id} while no events in-flight`);
    return
  }

  // If no ID supplied (back-level API) we
  if (ack.id === undefined) {
    log.warn(`FireFly core is back-level and did not supply an event ID`);
    ack.id = inFlight[0].id;
  }

  // Remove from our in-flight map
  let event;
  for (let i = 0; i < inFlight.length; i++) {
    const candidate = inFlight[i]
    if (ack.id === candidate.id) {
      event = candidate;
      inFlight.splice(i, 1);
      break;
    }
  }
  if (!event) {
    log.warn(`Ack received for ${ack.id} which is not in-flight`);
    return
  }
  log.debug(`${ack.id}: acknowledged`);

  dispatchNext();
}

export const getEmitter = () => {
  return eventEmitter;
}

export const getStats = () => {
  return {
    messageQueueSize: eventQueue.length,
    inFlightCount: inFlight.length,
  }
}
