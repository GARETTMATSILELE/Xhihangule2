import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { uploadToS3 } from '../utils/s3Utils';
import BackupJob from '../models/BackupJob';
import { logger } from '../utils/logger';

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function runDatabaseBackup(): Promise<any> {
  const startedAt = new Date();
  const useS3 = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_BUCKET_NAME);
  const provider: 'local' | 's3' = useS3 ? 's3' : 'local';
  const job = await BackupJob.create({
    provider,
    status: 'pending',
    startedAt
  } as any);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/xhihangule';
  const dumpCmd = process.env.MONGODUMP_PATH || 'mongodump';
  const ts = startedAt.toISOString().replace(/[:.]/g, '-');
  const baseName = `backup-${ts}.archive.gz`;
  const localDir = path.resolve(process.cwd(), 'backups');
  ensureDirSync(localDir);
  const localPath = path.join(localDir, baseName);

  await BackupJob.updateOne({ _id: job._id }, { $set: { status: 'running', path: provider === 'local' ? localPath : undefined } });

  return new Promise(async (resolve, reject) => {
    try {
      const out = fs.createWriteStream(localPath);
      const child = spawn(dumpCmd, ['--uri', mongoUri, '--archive', '--gzip'], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.pipe(out);

      let stderrBuf = '';
      child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

      child.on('close', async (code) => {
        try {
          if (code !== 0) {
            const errMsg = `mongodump exited with code ${code}: ${stderrBuf}`;
            await BackupJob.updateOne({ _id: job._id }, { $set: { status: 'failed', error: errMsg, completedAt: new Date() } });
            return reject(new Error(errMsg));
          }
          const stats = fs.statSync(localPath);

          if (useS3) {
            const fileBuffer = fs.readFileSync(localPath);
            const fakeFile: any = {
              originalname: baseName,
              buffer: fileBuffer,
              mimetype: 'application/gzip'
            };
            const key = `backups/${baseName}`;
            // We can't pass a key directly, uploadToS3 generates keys; wrap a simple uploader instead
            // Fallback to uploadToS3 which returns a key; rename afterwards if needed
            const s3Key = key;
            // custom upload with S3 SDK to preserve key
            const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
            const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1', credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID || '', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '' } });
            await s3.send(new PutObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME!, Key: s3Key, Body: fileBuffer, ContentType: 'application/gzip' }));
            try { fs.unlinkSync(localPath); } catch {}
            await BackupJob.updateOne({ _id: job._id }, { $set: { status: 'success', key: s3Key, sizeBytes: stats.size, completedAt: new Date() } });
            logger.info(`Backup uploaded to S3: ${s3Key}`);
            return resolve({ jobId: job._id.toString(), provider: 's3', key: s3Key, sizeBytes: stats.size });
          } else {
            await BackupJob.updateOne({ _id: job._id }, { $set: { status: 'success', path: localPath, sizeBytes: stats.size, completedAt: new Date() } });
            logger.info(`Backup saved locally: ${localPath}`);
            return resolve({ jobId: job._id.toString(), provider: 'local', path: localPath, sizeBytes: stats.size });
          }
        } catch (e: any) {
          await BackupJob.updateOne({ _id: job._id }, { $set: { status: 'failed', error: e?.message || String(e), completedAt: new Date() } });
          reject(e);
        }
      });
    } catch (err: any) {
      await BackupJob.updateOne({ _id: job._id }, { $set: { status: 'failed', error: err?.message || String(err), completedAt: new Date() } });
      reject(err);
    }
  });
}

export async function listBackups(limit: number = 25) {
  return BackupJob.find({}).sort({ createdAt: -1 }).limit(limit).lean();
}





