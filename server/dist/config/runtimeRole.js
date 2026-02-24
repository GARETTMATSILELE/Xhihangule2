"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRuntimeFeatures = void 0;
const toBool = (value, fallback) => {
    if (typeof value !== 'string')
        return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized))
        return true;
    if (['0', 'false', 'no', 'off'].includes(normalized))
        return false;
    return fallback;
};
const roleFromEnv = () => {
    const role = (process.env.APP_ROLE || 'api').trim().toLowerCase();
    if (role === 'worker' || role === 'all')
        return role;
    return 'api';
};
const getRuntimeFeatures = () => {
    const role = roleFromEnv();
    const isWorker = role === 'worker' || role === 'all';
    const defaultBackgroundOn = process.env.NODE_ENV !== 'production' || isWorker;
    return {
        role,
        runHttpServer: role !== 'worker',
        runSyncSchedules: toBool(process.env.ENABLE_SYNC_SCHEDULES, defaultBackgroundOn),
        runTrustBackground: toBool(process.env.ENABLE_TRUST_BACKGROUND, defaultBackgroundOn),
        runStartupMaintenance: toBool(process.env.ENABLE_STARTUP_MAINTENANCE, isWorker)
    };
};
exports.getRuntimeFeatures = getRuntimeFeatures;
