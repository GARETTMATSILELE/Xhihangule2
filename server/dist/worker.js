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
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const database_1 = require("./config/database");
const runtimeRole_1 = require("./config/runtimeRole");
const startSyncServices_1 = require("./scripts/startSyncServices");
const trustEventListener_1 = require("./services/trustEventListener");
const trustReconciliationJob_1 = require("./jobs/trustReconciliationJob");
const ENV_FILE = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
const ENV_PATH = path_1.default.resolve(__dirname, '..', ENV_FILE);
dotenv_1.default.config({ path: ENV_PATH });
const runtimeFeatures = (0, runtimeRole_1.getRuntimeFeatures)();
const startWorker = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Starting worker runtime with configuration:', {
        role: runtimeFeatures.role,
        runSyncSchedules: runtimeFeatures.runSyncSchedules,
        runTrustBackground: runtimeFeatures.runTrustBackground
    });
    if (runtimeFeatures.runHttpServer) {
        console.warn('Worker entrypoint started with an HTTP-enabled role. Set APP_ROLE=worker for worker deployments.');
    }
    yield (0, database_1.connectDatabase)();
    console.log('Worker connected to MongoDB');
    if (runtimeFeatures.runTrustBackground) {
        (0, trustEventListener_1.startTrustEventListener)();
        (0, trustReconciliationJob_1.startTrustReconciliationJob)();
        console.log('Trust background services started');
    }
    else {
        console.log('Trust background services disabled by configuration');
    }
    if (runtimeFeatures.runSyncSchedules) {
        yield (0, startSyncServices_1.initializeSyncServices)();
        console.log('Scheduled synchronization services started');
    }
    else {
        console.log('Scheduled synchronization services disabled by configuration');
    }
});
const stopWorker = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (0, trustEventListener_1.stopTrustEventListener)();
        (0, trustReconciliationJob_1.stopTrustReconciliationJob)();
        yield (0, startSyncServices_1.shutdownSyncServices)();
    }
    catch (error) {
        console.error('Error while stopping worker services:', error);
    }
    try {
        yield (0, database_1.closeDatabase)();
    }
    catch (error) {
        console.error('Error closing DB during worker shutdown:', error);
    }
});
startWorker().catch((error) => {
    console.error('Worker startup failed:', error);
    process.exit(1);
});
process.on('SIGTERM', () => {
    console.log('SIGTERM received by worker. Shutting down...');
    stopWorker().finally(() => process.exit(0));
});
process.on('SIGINT', () => {
    console.log('SIGINT received by worker. Shutting down...');
    stopWorker().finally(() => process.exit(0));
});
