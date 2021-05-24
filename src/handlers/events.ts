import { createLogger, LogLevelString } from "bunyan";
import EventEmitter from "events";
import { OutboundEvent } from "../lib/interfaces";
import * as utils from '../lib/utils';

const log = createLogger({ name: 'handlers/events.ts', level: utils.constants.LOG_LEVEL as LogLevelString });

let eventQueue: OutboundEvent[] = [];
export const eventEmitter = new EventEmitter();

export const queueEvent = (socketEvent: OutboundEvent) => {
  if(eventQueue.length < utils.constants.MAX_EVENT_QUEUE_SIZE) {
    eventQueue.push(socketEvent);
    if(eventQueue.length === 1) {
      eventEmitter.emit('event', eventQueue[0]);
    }
  } else {
    log.warn('Max queue size reached');
  }
};

export const handleCommit = () => {
  eventQueue.shift();
  if(eventQueue.length > 0) {
    eventEmitter.emit('event', eventQueue[0]);
  }
}

export const getCurrentEvent = () => {
  if(eventQueue.length > 0) {
    return eventQueue[0];
  }
};

export const getQueueSize = () => {
  return eventQueue.length;
};
