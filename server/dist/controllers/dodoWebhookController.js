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
exports.handleDodoWebhook = handleDodoWebhook;
const dodoWebhookService_1 = require("../services/subscriptionPayments/dodoWebhookService");
function handleDodoWebhook(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
            if (!rawBody)
                return res.status(400).json({ message: 'Webhook body is required.', code: 'DODO_BODY_REQUIRED' });
            const event = (0, dodoWebhookService_1.verifyDodoWebhook)(rawBody, req.headers);
            const eventId = String(req.headers['webhook-id'] || '');
            const result = yield (0, dodoWebhookService_1.processVerifiedDodoEvent)(event, eventId);
            return res.status(result.status).json(result.body);
        }
        catch (error) {
            const coded = error;
            const status = coded.statusCode === 503 ? 503 : 401;
            return res.status(status).json({ message: coded.message || 'Invalid Dodo signature', code: coded.code || 'DODO_SIGNATURE_INVALID' });
        }
    });
}
