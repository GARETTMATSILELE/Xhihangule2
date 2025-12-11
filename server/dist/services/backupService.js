"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.runDatabaseBackup = runDatabaseBackup;
exports.listBackups = listBackups;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const BackupJob_1 = __importDefault(require("../models/BackupJob"));
const logger_1 = require("../utils/logger");
function ensureDirSync(dir) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
function runDatabaseBackup() {
    return __awaiter(this, void 0, void 0, function* () {
        const startedAt = new Date();
        const useS3 = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_BUCKET_NAME);
        const provider = useS3 ? 's3' : 'local';
        const job = yield BackupJob_1.default.create({
            provider,
            status: 'pending',
            startedAt
        });
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/xhihangule';
        const dumpCmd = process.env.MONGODUMP_PATH || 'mongodump';
        const ts = startedAt.toISOString().replace(/[:.]/g, '-');
        const baseName = `backup-${ts}.archive.gz`;
        const localDir = path_1.default.resolve(process.cwd(), 'backups');
        ensureDirSync(localDir);
        const localPath = path_1.default.join(localDir, baseName);
        yield BackupJob_1.default.updateOne({ _id: job._id }, { $set: { status: 'running', path: provider === 'local' ? localPath : undefined } });
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            try {
                const out = fs_1.default.createWriteStream(localPath);
                const child = (0, child_process_1.spawn)(dumpCmd, ['--uri', mongoUri, '--archive', '--gzip'], { stdio: ['ignore', 'pipe', 'pipe'] });
                child.stdout.pipe(out);
                let stderrBuf = '';
                child.stderr.on('data', (d) => { stderrBuf += d.toString(); });
                child.on('close', (code) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        if (code !== 0) {
                            const errMsg = `mongodump exited with code ${code}: ${stderrBuf}`;
                            yield BackupJob_1.default.updateOne({ _id: job._id }, { $set: { status: 'failed', error: errMsg, completedAt: new Date() } });
                            return reject(new Error(errMsg));
                        }
                        const stats = fs_1.default.statSync(localPath);
                        if (useS3) {
                            const fileBuffer = fs_1.default.readFileSync(localPath);
                            const fakeFile = {
                                originalname: baseName,
                                buffer: fileBuffer,
                                mimetype: 'application/gzip'
                            };
                            const key = `backups/${baseName}`;
                            // We can't pass a key directly, uploadToS3 generates keys; wrap a simple uploader instead
                            // Fallback to uploadToS3 which returns a key; rename afterwards if needed
                            const s3Key = key;
                            // custom upload with S3 SDK to preserve key
                            const { S3Client, PutObjectCommand } = yield Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
                            const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1', credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID || '', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '' } });
                            yield s3.send(new PutObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: s3Key, Body: fileBuffer, ContentType: 'application/gzip' }));
                            try {
                                fs_1.default.unlinkSync(localPath);
                            }
                            catch (_a) { }
                            yield BackupJob_1.default.updateOne({ _id: job._id }, { $set: { status: 'success', key: s3Key, sizeBytes: stats.size, completedAt: new Date() } });
                            logger_1.logger.info(`Backup uploaded to S3: ${s3Key}`);
                            return resolve({ jobId: job._id.toString(), provider: 's3', key: s3Key, sizeBytes: stats.size });
                        }
                        else {
                            yield BackupJob_1.default.updateOne({ _id: job._id }, { $set: { status: 'success', path: localPath, sizeBytes: stats.size, completedAt: new Date() } });
                            logger_1.logger.info(`Backup saved locally: ${localPath}`);
                            return resolve({ jobId: job._id.toString(), provider: 'local', path: localPath, sizeBytes: stats.size });
                        }
                    }
                    catch (e) {
                        yield BackupJob_1.default.updateOne({ _id: job._id }, { $set: { status: 'failed', error: (e === null || e === void 0 ? void 0 : e.message) || String(e), completedAt: new Date() } });
                        reject(e);
                    }
                }));
            }
            catch (err) {
                yield BackupJob_1.default.updateOne({ _id: job._id }, { $set: { status: 'failed', error: (err === null || err === void 0 ? void 0 : err.message) || String(err), completedAt: new Date() } });
                reject(err);
            }
        }));
    });
}
function listBackups() {
    return __awaiter(this, arguments, void 0, function* (limit = 25) {
        return BackupJob_1.default.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    });
}
