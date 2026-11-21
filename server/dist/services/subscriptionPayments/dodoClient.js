"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDodoGatewayForTests = setDodoGatewayForTests;
exports.createDodoGateway = createDodoGateway;
exports.getDodoGateway = getDodoGateway;
const dodopayments_1 = __importDefault(require("dodopayments"));
const providerAvailability_1 = require("./providerAvailability");
let gatewayOverride;
function setDodoGatewayForTests(gateway) {
    gatewayOverride = gateway;
}
function createDodoGateway(env = process.env) {
    const config = (0, providerAvailability_1.readDodoConfig)(env);
    if (!config.apiKey || config.mode === 'invalid')
        return null;
    return new dodopayments_1.default({
        bearerToken: config.apiKey,
        webhookKey: config.webhookKey || null,
        environment: config.mode === 'live' ? 'live_mode' : 'test_mode'
    });
}
function getDodoGateway(env = process.env) {
    if (gatewayOverride !== undefined)
        return gatewayOverride;
    return createDodoGateway(env);
}
