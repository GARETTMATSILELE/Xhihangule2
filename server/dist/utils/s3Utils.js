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
exports.getSignedUrl = exports.deleteFromS3 = exports.uploadToS3 = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const uuid_1 = require("uuid");
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || '';
const uploadToS3 = (file) => __awaiter(void 0, void 0, void 0, function* () {
    const fileExtension = file.originalname.split('.').pop();
    const key = `files/${(0, uuid_1.v4)()}.${fileExtension}`;
    const command = new client_s3_1.PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
    });
    yield s3Client.send(command);
    return key;
});
exports.uploadToS3 = uploadToS3;
const deleteFromS3 = (key) => __awaiter(void 0, void 0, void 0, function* () {
    const command = new client_s3_1.DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });
    yield s3Client.send(command);
});
exports.deleteFromS3 = deleteFromS3;
const getSignedUrl = (key) => __awaiter(void 0, void 0, void 0, function* () {
    const command = new client_s3_1.GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });
    return (0, s3_request_presigner_1.getSignedUrl)(s3Client, command, { expiresIn: 3600 });
});
exports.getSignedUrl = getSignedUrl;
