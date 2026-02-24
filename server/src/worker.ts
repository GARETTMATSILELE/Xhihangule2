import dotenv from 'dotenv';
import path from 'path';
import { connectDatabase, closeDatabase } from './config/database';
import { getRuntimeFeatures } from './config/runtimeRole';
import { initializeSyncServices, shutdownSyncServices } from './scripts/startSyncServices';
import { startTrustEventListener, stopTrustEventListener } from './services/trustEventListener';
import { startTrustReconciliationJob, stopTrustReconciliationJob } from './jobs/trustReconciliationJob';

const ENV_FILE = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
const ENV_PATH = path.resolve(__dirname, '..', ENV_FILE);
dotenv.config({ path: ENV_PATH });

const runtimeFeatures = getRuntimeFeatures();

const startWorker = async (): Promise<void> => {
  console.log('Starting worker runtime with configuration:', {
    role: runtimeFeatures.role,
    runSyncSchedules: runtimeFeatures.runSyncSchedules,
    runTrustBackground: runtimeFeatures.runTrustBackground
  });

  if (runtimeFeatures.runHttpServer) {
    console.warn('Worker entrypoint started with an HTTP-enabled role. Set APP_ROLE=worker for worker deployments.');
  }

  await connectDatabase();
  console.log('Worker connected to MongoDB');

  if (runtimeFeatures.runTrustBackground) {
    startTrustEventListener();
    startTrustReconciliationJob();
    console.log('Trust background services started');
  } else {
    console.log('Trust background services disabled by configuration');
  }

  if (runtimeFeatures.runSyncSchedules) {
    await initializeSyncServices();
    console.log('Scheduled synchronization services started');
  } else {
    console.log('Scheduled synchronization services disabled by configuration');
  }
};

const stopWorker = async (): Promise<void> => {
  try {
    stopTrustEventListener();
    stopTrustReconciliationJob();
    await shutdownSyncServices();
  } catch (error) {
    console.error('Error while stopping worker services:', error);
  }

  try {
    await closeDatabase();
  } catch (error) {
    console.error('Error closing DB during worker shutdown:', error);
  }
};

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
