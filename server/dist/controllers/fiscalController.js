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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFiscalHealth = void 0;
const Company_1 = __importDefault(require("../models/Company"));
const getFiscalHealth = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = req.query.companyId || '';
        if (!companyId) {
            return res.status(400).json({ status: 'error', message: 'companyId is required' });
        }
        const company = yield Company_1.default.findById(companyId);
        if (!company) {
            return res.status(404).json({ status: 'error', message: 'Company not found' });
        }
        const fiscalConfig = company.fiscalConfig || {};
        const enabled = Boolean(fiscalConfig.enabled);
        if (!enabled) {
            return res.json({
                status: 'ok',
                enabled,
                connected: false,
                reason: 'disabled',
                checkedAt: new Date().toISOString(),
                details: {
                    providerName: fiscalConfig.providerName || null,
                    agentName: fiscalConfig.agentName || null,
                    deviceSerial: fiscalConfig.deviceSerial || null,
                    fdmsBaseUrl: fiscalConfig.fdmsBaseUrl || null
                }
            });
        }
        const fdmsBaseUrl = fiscalConfig.fdmsBaseUrl;
        // If we have an agent base URL, attempt a lightweight health probe
        if (fdmsBaseUrl) {
            let connected = false;
            let errorMessage;
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);
                try {
                    const url = fdmsBaseUrl.replace(/\/$/, '') + '/health';
                    const response = yield fetch(url, { method: 'GET', signal: controller.signal });
                    connected = response.ok;
                }
                finally {
                    clearTimeout(timeout);
                }
            }
            catch (e) {
                connected = false;
                errorMessage = (e === null || e === void 0 ? void 0 : e.message) || 'Health probe failed';
            }
            return res.json({
                status: 'ok',
                enabled,
                connected,
                checkedAt: new Date().toISOString(),
                details: {
                    providerName: fiscalConfig.providerName || null,
                    agentName: fiscalConfig.agentName || null,
                    deviceSerial: fiscalConfig.deviceSerial || null,
                    fdmsBaseUrl,
                    error: connected ? undefined : (errorMessage || 'Agent health endpoint not reachable')
                }
            });
        }
        // No agent URL; cannot verify connectivity programmatically
        return res.json({
            status: 'ok',
            enabled,
            connected: false,
            reason: 'no_agent_url',
            checkedAt: new Date().toISOString(),
            details: {
                providerName: fiscalConfig.providerName || null,
                agentName: fiscalConfig.agentName || null,
                deviceSerial: fiscalConfig.deviceSerial || null,
                fdmsBaseUrl: null
            }
        });
    }
    catch (error) {
        return res.status(500).json({ status: 'error', message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to check fiscal health' });
    }
});
exports.getFiscalHealth = getFiscalHealth;
