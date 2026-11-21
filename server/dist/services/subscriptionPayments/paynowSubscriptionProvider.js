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
exports.createPaynowSubscriptionProvider = createPaynowSubscriptionProvider;
const paynowController_1 = require("../../controllers/paynowController");
function createPaynowSubscriptionProvider(req) {
    return {
        id: 'paynow',
        createCheckout(input) {
            return __awaiter(this, void 0, void 0, function* () {
                if (input.cycle === 'quarterly') {
                    const error = new Error('Paynow subscription checkout does not bill quarterly.');
                    error.statusCode = 400;
                    error.code = 'CYCLE_NOT_SUPPORTED';
                    throw error;
                }
                const checkout = yield (0, paynowController_1.initiatePaynowCheckout)(req, {
                    paymentSessionId: input.paymentSessionId,
                    plan: input.plan,
                    cycle: input.cycle,
                    email: input.customerEmail,
                    description: input.description
                });
                return {
                    redirectUrl: checkout.redirectUrl,
                    provider: 'paynow',
                    providerTransactionId: checkout.reference,
                    metadata: { pollUrl: checkout.pollUrl || '' }
                };
            });
        }
    };
}
