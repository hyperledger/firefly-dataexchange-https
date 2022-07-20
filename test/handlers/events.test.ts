import * as chai from 'chai';
import { expect } from 'chai';
import { randomInt } from 'crypto';
import { resolve } from 'path';
import sinonChai from 'sinon-chai';
import * as events from '../../src/handlers/events';
import { IConfig, OutboundEvent } from '../../src/lib/interfaces';
import { Logger, setLogLevel } from '../../src/lib/logger';
chai.use(sinonChai);

const log = new Logger("test/handlers/events.test.ts")

describe('events', () => {

  it('handles dispatches with maxInFlight limiting and acks in any order', async () => {
    setLogLevel('debug');

    await events.init({
      events: {
        maxInflight: 10,
        queueSize: 20,
      }
    } as IConfig)

    let firstTen: OutboundEvent[] = [];
    let secondTen: OutboundEvent[] = [];

    const firstTenDispatched = new Promise<void>((resolve) => {
      events.getEmitter().on('event', (event: OutboundEvent) => {
        const eventNumber = parseInt(event.id);
        if (eventNumber < 10) {
          firstTen.push(event);
          log.info(`Test recevied ${event.id} in first ten. Length=${firstTen.length}`)
        }
        if (firstTen.length === 10) {
          resolve();
        }
      });
    })

    let readyForSecond = false;
    const secondTenDispatched = new Promise<void>((resolve) => {
      events.getEmitter().on('event', (event: OutboundEvent) => {
        const eventNumber = parseInt(event.id);
        if (eventNumber >= 10) {
          secondTen.push(event);
          log.info(`Test recevied ${event.id} in second ten. Length=${secondTen.length}`)
          expect(readyForSecond).to.be.true;
        }
        if (secondTen.length === 10) {
          resolve();
        }            
      });
    })

    // Put 20 into the queue, and check we only get 10 dispatched
    for (let i = 0; i < 20; i++) {
      await events.queueEvent({
        id: `${i}`,
        type: 'message-received',
        message: `message_${i}`,
        sender: 'peer1',
        headers: {
          sample: 'abc'
        }
      }); 
    }
    await firstTenDispatched;
    
    // Now ack the first 10 in a random order
    expect(firstTen.length).to.equal(10)
    readyForSecond = true;
    for (let i = 0; i < 10; i++) {
      const idx = firstTen.length > 1 ? randomInt(firstTen.length - 1) : 0;
      const event = firstTen[idx];
      firstTen.splice(idx, 1);
      events.handleAck({
        type: 'ack',
        id: event.id,
      });
    }

    log.info('Second 10 events');
    await secondTenDispatched;

    // Now ack the second 10
    for (let i = 0; i < 10; i++) {
      events.handleAck({
        type: 'ack',
        id: secondTen.shift()!.id,
      })      
    }
    
    // Check everything drained ok
    expect(events.getStats().inFlightCount).to.equal(0);
    expect(events.getStats().messageQueueSize).to.equal(0);

  })

  it('blocks the sender when the queue is full', async () => {
    setLogLevel('debug');

    await events.init({
      events: {
        maxInflight: 1,
        queueSize: 5,
      }
    } as IConfig)
    
    let queued = 0;
    const queueAll = async () => {
      for (let i = 0; i < 7; i++) {
        await events.queueEvent({
          id: `${i}`,
          type: 'message-received',
          message: `message_${i}`,
          sender: 'peer1',
          headers: {
            sample: 'abc'
          }
        });
        queued++;
      }
      resolve();
    };

    const allQueuedPromise = queueAll();
    while (queued < 5) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    // should be blocked queuing number 7 (5 queued, plus 1 inflight)
    expect(queued).to.equal(6);

    // We can ack any of them, to unblock
    events.handleAck({ id: `0`, type: 'ack' });

    // Now should complete, as we unblocked by just consuming 1
    await allQueuedPromise;

  })

  it('ack with empty queue is no-op', async () => {

    await events.init({} as IConfig)
    events.handleAck({ type: 'ack' });

  })

  it('ack of something not in-flight is a no-op', async () => {

    await events.init({} as IConfig)

    await events.queueEvent({
      id: `right`,
      type: 'message-received',
      message: `message`,
      sender: 'peer1',
      headers: {
        sample: 'abc'
      }
    });

    events.handleAck({ id: `wrong`, type: 'ack' });
    expect(events.getStats().inFlightCount).to.equal(1);

  })

  it('ack without an id, just acks the last thing', async () => {

    await events.init({} as IConfig)

    await events.queueEvent({
      id: `right`,
      type: 'message-received',
      message: `message`,
      sender: 'peer1',
      headers: {
        sample: 'abc'
      }
    });

    events.handleAck({ type: 'ack' });
    expect(events.getStats().inFlightCount).to.equal(0);

  })

  it('re-dispatches in-flight when requested', async () => {

    await events.init({
      events: {
        maxInflight: 2,
        queueSize: 2,
      }
    } as IConfig)

    const received: string[] = [];
    const doubleDispatch = new Promise<void>(resolve => {
      events.getEmitter().addListener('event', (event: OutboundEvent) => {
        received.push(event.id)
        if (received.length === 4) {
          resolve();
        }
      })
    });

    await events.queueEvent({
      id: `1`,
      type: 'message-received',
      message: `message`,
      sender: 'peer1',
      headers: {
        sample: 'abc'
      }
    });
    await events.queueEvent({
      id: `2`,
      type: 'message-received',
      message: `message`,
      sender: 'peer1',
      headers: {
        sample: 'abc'
      }
    });

    events.reDispatchInFlight();
    
    await doubleDispatch;

    expect(received).to.deep.equal([
      '1',
      '2',
      '1',
      '2',
    ])

  })

})