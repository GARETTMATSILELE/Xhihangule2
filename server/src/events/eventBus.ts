import { EventEmitter } from 'events';

type EventHandler<T = any> = (payload: T) => Promise<void> | void;

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export const emitEvent = async <T = any>(eventName: string, payload: T): Promise<void> => {
  const listeners = emitter.listeners(eventName) as EventHandler<T>[];
  for (const handler of listeners) {
    try {
      await Promise.resolve(handler(payload));
    } catch (error) {
      // isolate listener failures; do not block other subscribers
      console.error(`Event handler failed for ${eventName}:`, error);
    }
  }
};

export const subscribe = <T = any>(eventName: string, handler: EventHandler<T>): (() => void) => {
  emitter.on(eventName, handler as any);
  return () => emitter.off(eventName, handler as any);
};

export default {
  emitEvent,
  subscribe
};
