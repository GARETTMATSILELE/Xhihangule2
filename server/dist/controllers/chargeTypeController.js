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
exports.deleteChargeType = exports.deactivateChargeType = exports.updateChargeType = exports.createChargeType = exports.listChargeTypes = void 0;
const chargeTypeService_1 = __importDefault(require("../services/chargeTypeService"));
const errorHandler_1 = require("../middleware/errorHandler");
const getCompanyId = (req) => { var _a; return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) ? String(req.user.companyId) : undefined; };
const getUserId = (req) => { var _a; return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) ? String(req.user.userId) : undefined; };
const handleError = (res, error) => {
    if (error instanceof errorHandler_1.AppError) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: (error === null || error === void 0 ? void 0 : error.message) || 'Charge type operation failed' });
};
const listChargeTypes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
        const data = yield chargeTypeService_1.default.listChargeTypes(getCompanyId(req), includeInactive);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
exports.listChargeTypes = listChargeTypes;
const createChargeType = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield chargeTypeService_1.default.createChargeType(req.body, getCompanyId(req), getUserId(req));
        return res.status(201).json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
exports.createChargeType = createChargeType;
const updateChargeType = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield chargeTypeService_1.default.updateChargeType(req.params.id, req.body, getCompanyId(req), getUserId(req));
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
exports.updateChargeType = updateChargeType;
const deactivateChargeType = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield chargeTypeService_1.default.deactivateChargeType(req.params.id, getCompanyId(req), getUserId(req));
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
exports.deactivateChargeType = deactivateChargeType;
const deleteChargeType = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield chargeTypeService_1.default.deleteChargeType(req.params.id, getCompanyId(req));
        return res.json({ success: true });
    }
    catch (error) {
        return handleError(res, error);
    }
});
exports.deleteChargeType = deleteChargeType;
