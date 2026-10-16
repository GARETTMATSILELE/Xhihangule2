"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signalOperationalFailure = signalOperationalFailure;
const logger_1 = require("../utils/logger");
/**
 * A structured error log. This process does not configure an external alert
 * transport. Azure log capture of the console is not proof that an alert fired.
 */
function signalOperationalFailure(signal, details = {}) {
    logger_1.logger.error(signal, Object.assign({ signal, alertRequested: true, alertDelivery: 'not_configured' }, details));
}
