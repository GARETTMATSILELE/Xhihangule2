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
exports.deleteFile = exports.downloadFile = exports.uploadFile = exports.getFiles = void 0;
const File_1 = __importDefault(require("../models/File"));
const Property_1 = require("../models/Property");
// Get all files for a property
const getFiles = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        console.log('getFiles called: returning files for company', req.user.companyId);
        const files = yield File_1.default.find({ companyId: req.user.companyId })
            .populate('propertyId', 'name')
            .populate('uploadedBy', 'firstName lastName');
        console.log('Database query completed, found files:', files.length);
        const formattedFiles = files.map((file) => {
            var _a;
            const fileObj = file.toObject();
            return Object.assign(Object.assign({}, fileObj), { propertyName: ((_a = fileObj.propertyId) === null || _a === void 0 ? void 0 : _a.name) || 'N/A', uploadedByName: fileObj.uploadedBy ?
                    `${fileObj.uploadedBy.firstName} ${fileObj.uploadedBy.lastName}` :
                    'Unknown' });
        });
        console.log('Sending response with', formattedFiles.length, 'files');
        res.json(formattedFiles);
    }
    catch (error) {
        console.error('Error in getFiles:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getFiles = getFiles;
// Upload a file
const uploadFile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        console.log('Upload request received:', {
            file: req.file,
            body: req.body,
            user: req.user
        });
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const { propertyId, fileType } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        if (!propertyId || !fileType || !userId || !companyId) {
            return res.status(400).json({
                message: 'Missing required fields',
                details: { propertyId, fileType, userId, companyId }
            });
        }
        // Check if property exists
        const property = yield Property_1.Property.findOne({ _id: propertyId, companyId });
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }
        // Create file record
        const file = new File_1.default({
            propertyId,
            companyId,
            fileName: req.file.originalname,
            fileType,
            fileUrl: req.file.buffer.toString('base64'),
            uploadedBy: userId
        });
        yield file.save();
        res.status(201).json({
            message: 'File uploaded successfully',
            file: {
                _id: file._id,
                fileName: file.fileName,
                fileType: file.fileType,
                propertyId: file.propertyId,
                uploadedBy: file.uploadedBy,
                uploadedAt: file.uploadedAt
            }
        });
    }
    catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({
            message: 'Error uploading file',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.uploadFile = uploadFile;
// Download a file
const downloadFile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const file = yield File_1.default.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }
        // Convert base64 back to buffer
        const buffer = Buffer.from(file.fileUrl, 'base64');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
        res.send(buffer);
    }
    catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ message: 'Error downloading file' });
    }
});
exports.downloadFile = downloadFile;
// Delete a file
const deleteFile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const file = yield File_1.default.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }
        yield file.deleteOne();
        res.json({ message: 'File deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ message: 'Error deleting file' });
    }
});
exports.deleteFile = deleteFile;
