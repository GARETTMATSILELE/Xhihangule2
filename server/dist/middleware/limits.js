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
exports.enforcePropertyLimit = void 0;
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const errorHandler_1 = require("./errorHandler");
const enforcePropertyLimit = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
        }
        const company = yield Company_1.Company.findById(req.user.companyId).select('propertyLimit');
        if (!company) {
            throw new errorHandler_1.AppError('Company not found', 404);
        }
        if (company.propertyLimit == null) {
            return next();
        }
        const count = yield Property_1.Property.countDocuments({ companyId: req.user.companyId });
        if (count >= (company.propertyLimit || 0)) {
            return res.status(403).json({ message: 'Property limit reached for your plan' });
        }
        next();
    }
    catch (error) {
        next(error);
    }
});
exports.enforcePropertyLimit = enforcePropertyLimit;
