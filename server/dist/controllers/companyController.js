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
exports.uploadCompanyLogo = exports.getCompanyById = exports.updateCurrentCompany = exports.getCurrentCompany = exports.deleteCompany = exports.updateCompany = exports.createCompany = exports.getCompany = exports.getCompanies = void 0;
const Company_1 = require("../models/Company");
const plan_1 = require("../types/plan");
const PropertyOwner_1 = require("../models/PropertyOwner");
const errorHandler_1 = require("../middleware/errorHandler");
const mongoose_1 = __importDefault(require("mongoose"));
const chartController_1 = require("./chartController");
const User_1 = require("../models/User");
const getCompanies = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companies = yield Company_1.Company.find().select('-__v');
        res.json(companies);
    }
    catch (error) {
        throw new errorHandler_1.AppError('Error fetching companies', 500);
    }
});
exports.getCompanies = getCompanies;
const getCompany = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Fetching company by ID:', req.params.id);
        const company = yield Company_1.Company.findById(req.params.id).select('-__v');
        if (!company) {
            console.log('Company not found for ID:', req.params.id);
            return res.status(404).json({
                status: 'error',
                message: 'Company not found',
                code: 'COMPANY_NOT_FOUND'
            });
        }
        console.log('Company found:', {
            id: company._id,
            name: company.name
        });
        res.json({
            status: 'success',
            data: company
        });
    }
    catch (error) {
        console.error('Error in getCompany:', error);
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching company', 500);
    }
});
exports.getCompany = getCompany;
const createCompany = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber } = req.body;
        console.log('Creating company with data:', { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber });
        // Check if company with same name or email already exists
        const existingCompany = yield Company_1.Company.findOne({
            $or: [
                { name: { $regex: new RegExp(`^${name}$`, 'i') } },
                { email: { $regex: new RegExp(`^${email}$`, 'i') } }
            ]
        });
        if (existingCompany) {
            console.log('Company already exists:', existingCompany);
            throw new errorHandler_1.AppError('Company with this name or email already exists', 400);
        }
        const plan = (((_a = req.body) === null || _a === void 0 ? void 0 : _a.plan) && ['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(req.body.plan)) ? req.body.plan : 'ENTERPRISE';
        const config = plan_1.PLAN_CONFIG[plan];
        const company = new Company_1.Company({
            name,
            description,
            email,
            address,
            phone,
            website,
            registrationNumber,
            tinNumber,
            vatNumber,
            ownerId: req.user.userId,
            plan,
            propertyLimit: config.propertyLimit,
            featureFlags: config.featureFlags
        });
        console.log('Saving new company:', company);
        yield company.save();
        console.log('Company saved successfully:', company);
        // Link company to current user
        const currentUserId = req.user.userId;
        if (currentUserId) {
            try {
                yield User_1.User.findByIdAndUpdate(currentUserId, { companyId: company._id });
                console.log('Linked companyId to user:', currentUserId);
            }
            catch (linkErr) {
                console.warn('Failed to link companyId to user (non-fatal):', linkErr);
            }
        }
        // Initialize chart data for the new company
        console.log('Initializing chart data for company:', company._id);
        yield (0, chartController_1.updateChartMetrics)(company._id.toString());
        console.log('Chart data initialized successfully');
        // Verify the company was saved
        const savedCompany = yield Company_1.Company.findById(company._id);
        console.log('Verified saved company:', savedCompany);
        res.status(201).json(company);
    }
    catch (error) {
        console.error('Error in createCompany:', error);
        // Handle duplicate key errors gracefully (e.g., registrationNumber/email/tinNumber)
        if (error && (error.code === 11000 || error.name === 'MongoServerError')) {
            const key = Object.keys(error.keyPattern || {})[0] || 'unique_field';
            const value = error.keyValue ? error.keyValue[key] : undefined;
            const message = key === 'registrationNumber'
                ? 'Registration number already exists'
                : key === 'email'
                    ? 'Company email already exists'
                    : key === 'tinNumber'
                        ? 'TIN number already exists'
                        : 'Duplicate value for a unique field';
            return res.status(400).json({
                status: 'error',
                message,
                code: 'DUPLICATE_KEY',
                field: key,
                value
            });
        }
        // Fallback: pass to error handler without crashing
        return next(new errorHandler_1.AppError('Error creating company', 500));
    }
});
exports.createCompany = createCompany;
const updateCompany = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber, logo, bankAccounts, plan, fiscalConfig } = req.body;
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (description !== undefined)
            updateData.description = description;
        if (email !== undefined)
            updateData.email = email;
        if (address !== undefined)
            updateData.address = address;
        if (phone !== undefined)
            updateData.phone = phone;
        if (website !== undefined)
            updateData.website = website;
        if (registrationNumber !== undefined)
            updateData.registrationNumber = registrationNumber;
        if (tinNumber !== undefined)
            updateData.tinNumber = tinNumber;
        if (vatNumber !== undefined)
            updateData.vatNumber = vatNumber;
        if (logo !== undefined)
            updateData.logo = logo;
        if (bankAccounts !== undefined)
            updateData.bankAccounts = bankAccounts;
        if (fiscalConfig !== undefined)
            updateData.fiscalConfig = fiscalConfig;
        if (plan && ['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(plan)) {
            const cfg = plan_1.PLAN_CONFIG[plan];
            updateData.plan = plan;
            updateData.propertyLimit = cfg.propertyLimit;
            updateData.featureFlags = cfg.featureFlags;
        }
        const company = yield Company_1.Company.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true, runValidators: true });
        if (!company) {
            throw new errorHandler_1.AppError('Company not found', 404);
        }
        res.json(company);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error updating company', 500);
    }
});
exports.updateCompany = updateCompany;
const deleteCompany = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const company = yield Company_1.Company.findByIdAndDelete(req.params.id);
        if (!company) {
            throw new errorHandler_1.AppError('Company not found', 404);
        }
        res.json({ message: 'Company deleted successfully' });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error deleting company', 500);
    }
});
exports.deleteCompany = deleteCompany;
const getCurrentCompany = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        const userRole = (_c = req.user) === null || _c === void 0 ? void 0 : _c.role;
        console.log('getCurrentCompany - Request data:', {
            userId,
            companyId,
            userRole
        });
        if (!userId) {
            console.error('getCurrentCompany: No userId in request');
            return res.status(401).json({
                status: 'error',
                message: 'User not authenticated',
                code: 'NO_USER_ID'
            });
        }
        let company = null;
        // First try to find company by companyId if it exists
        if (companyId && mongoose_1.default.Types.ObjectId.isValid(companyId)) {
            console.log('Searching for company by companyId:', companyId);
            company = yield Company_1.Company.findById(companyId);
            if (company) {
                console.log('Found company by companyId:', {
                    companyId: company._id,
                    name: company.name
                });
            }
            else {
                console.log('No company found by companyId:', companyId);
            }
        }
        // If no company found by companyId, try to find by ownerId
        if (!company) {
            console.log('Searching for company by ownerId:', userId);
            company = yield Company_1.Company.findOne({ ownerId: userId });
            if (company) {
                console.log('Found company by ownerId:', {
                    companyId: company._id,
                    name: company.name
                });
            }
            else {
                console.log('No company found by ownerId:', userId);
            }
        }
        // If still no company found and user is a property owner, check their companyId
        if (!company && userRole === 'owner') {
            console.log('User is property owner, checking PropertyOwner model for companyId');
            const propertyOwner = yield PropertyOwner_1.PropertyOwner.findById(userId);
            if (propertyOwner && propertyOwner.companyId) {
                console.log('Found companyId in PropertyOwner:', propertyOwner.companyId);
                company = yield Company_1.Company.findById(propertyOwner.companyId);
                if (company) {
                    console.log('Found company for property owner:', {
                        companyId: company._id,
                        name: company.name
                    });
                }
                else {
                    console.log('No company found for property owner companyId:', propertyOwner.companyId);
                }
            }
            else {
                console.log('Property owner has no companyId');
            }
        }
        if (!company) {
            console.log('No company found for user:', {
                userId,
                companyId,
                role: userRole
            });
            return res.status(404).json({
                status: 'error',
                message: 'No company found. Please ensure you are associated with a company.',
                code: 'NO_COMPANY'
            });
        }
        console.log('Returning company data:', {
            companyId: company._id,
            name: company.name
        });
        res.json({ status: 'success', data: company });
    }
    catch (error) {
        console.error('Error in getCurrentCompany:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error while fetching company',
            error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
            code: 'INTERNAL_ERROR'
        });
    }
});
exports.getCurrentCompany = getCurrentCompany;
const updateCurrentCompany = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        const userRole = (_c = req.user) === null || _c === void 0 ? void 0 : _c.role;
        if (!userId) {
            throw new errorHandler_1.AppError('User not authenticated', 401);
        }
        // Find the current user's company
        let company = null;
        // First try to find company by companyId if it exists
        if (companyId && mongoose_1.default.Types.ObjectId.isValid(companyId)) {
            company = yield Company_1.Company.findById(companyId);
        }
        // If no company found by companyId, try to find by ownerId
        if (!company) {
            company = yield Company_1.Company.findOne({ ownerId: userId });
        }
        // If still no company found and user is a property owner, check their companyId
        if (!company && userRole === 'owner') {
            const propertyOwner = yield PropertyOwner_1.PropertyOwner.findById(userId);
            if (propertyOwner && propertyOwner.companyId) {
                company = yield Company_1.Company.findById(propertyOwner.companyId);
            }
        }
        if (!company) {
            throw new errorHandler_1.AppError('Company not found', 404);
        }
        // Update the company
        const { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber, logo, bankAccounts, plan, fiscalConfig } = req.body;
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (description !== undefined)
            updateData.description = description;
        if (email !== undefined)
            updateData.email = email;
        if (address !== undefined)
            updateData.address = address;
        if (phone !== undefined)
            updateData.phone = phone;
        if (website !== undefined)
            updateData.website = website;
        if (registrationNumber !== undefined)
            updateData.registrationNumber = registrationNumber;
        if (tinNumber !== undefined)
            updateData.tinNumber = tinNumber;
        if (vatNumber !== undefined)
            updateData.vatNumber = vatNumber;
        if (logo !== undefined)
            updateData.logo = logo;
        if (bankAccounts !== undefined)
            updateData.bankAccounts = bankAccounts;
        if (fiscalConfig !== undefined)
            updateData.fiscalConfig = fiscalConfig;
        if (plan && ['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(plan)) {
            const cfg = plan_1.PLAN_CONFIG[plan];
            updateData.plan = plan;
            updateData.propertyLimit = cfg.propertyLimit;
            updateData.featureFlags = cfg.featureFlags;
        }
        const updatedCompany = yield Company_1.Company.findByIdAndUpdate(company._id, { $set: updateData }, { new: true, runValidators: true });
        if (!updatedCompany) {
            throw new errorHandler_1.AppError('Error updating company', 500);
        }
        res.json(updatedCompany);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        console.error('Error in updateCurrentCompany:', error);
        throw new errorHandler_1.AppError('Error updating company', 500);
    }
});
exports.updateCurrentCompany = updateCurrentCompany;
const getCompanyById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = req.params.id;
        console.log('Fetching company by ID:', companyId);
        if (!mongoose_1.default.Types.ObjectId.isValid(companyId)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid company ID format',
                code: 'INVALID_ID'
            });
        }
        const company = yield Company_1.Company.findById(companyId);
        if (!company) {
            console.log('Company not found for ID:', companyId);
            return res.status(404).json({
                status: 'error',
                message: 'Company not found',
                code: 'COMPANY_NOT_FOUND'
            });
        }
        console.log('Company found:', {
            id: company._id,
            name: company.name
        });
        if (!company) {
            return res.status(404).json({ status: 'error', message: 'Company not found', code: 'NO_COMPANY' });
        }
        res.json({
            status: 'success',
            data: {
                _id: company._id,
                name: company.name,
                address: company.address,
                phone: company.phone,
                email: company.email,
                website: company.website,
                registrationNumber: company.registrationNumber,
                tinNumber: company.tinNumber,
                vatNumber: company.vatNumber,
                ownerId: company.ownerId,
                description: company.description,
                logo: company.logo,
                isActive: company.isActive,
                subscriptionStatus: company.subscriptionStatus,
                subscriptionEndDate: company.subscriptionEndDate,
                bankAccounts: company.bankAccounts,
                commissionConfig: company.commissionConfig,
                plan: company.plan,
                propertyLimit: company.propertyLimit,
                featureFlags: company.featureFlags,
                fiscalConfig: company.fiscalConfig,
                createdAt: company.createdAt,
                updatedAt: company.updatedAt
            }
        });
    }
    catch (error) {
        console.error('Error in getCompanyById:', error);
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching company', 500);
    }
});
exports.getCompanyById = getCompanyById;
const uploadCompanyLogo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const companyId = req.params.id;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        // Check if company exists and user has permission
        const company = yield Company_1.Company.findById(companyId);
        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }
        // Check if user is the owner of the company
        if (company.ownerId.toString() !== userId) {
            return res.status(403).json({ message: 'Unauthorized to update this company' });
        }
        // Convert file to base64 for storage
        const logoBase64 = req.file.buffer.toString('base64');
        // Update company with new logo
        const updatedCompany = yield Company_1.Company.findByIdAndUpdate(companyId, { logo: logoBase64 }, { new: true, runValidators: true });
        res.json({
            message: 'Logo uploaded successfully',
            company: updatedCompany
        });
    }
    catch (error) {
        console.error('Error uploading company logo:', error);
        res.status(500).json({
            message: 'Error uploading logo',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.uploadCompanyLogo = uploadCompanyLogo;
