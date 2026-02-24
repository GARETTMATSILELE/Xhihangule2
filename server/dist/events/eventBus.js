"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribe = exports.emitEvent = void 0;
const events_1 = require("events");
const emitter = new events_1.EventEmitter();
emitter.setMaxListeners(100);
const emitEvent = (eventName, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const listeners = emitter.listeners(eventName);
    for (const handler of listeners) {
        try {
            yield Promise.resolve(handler(payload));
        }
        catch (error) {
            // isolate listener failures; do not block other subscribers
            console.error(`Event handler failed for ${eventName}:`, error);
        }
    }
});
exports.emitEvent = emitEvent;
const subscribe = (eventName, handler) => {
    emitter.on(eventName, handler);
    return () => emitter.off(eventName, handler);
};
exports.subscribe = subscribe;
exports.default = {
    emitEvent: exports.emitEvent,
    subscribe: exports.subscribe
};
