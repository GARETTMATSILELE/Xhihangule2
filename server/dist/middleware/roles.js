"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canManagePayments = exports.canCreateProperty = exports.isAccountant = exports.isOwner = exports.isAdmin = exports.isAgent = void 0;
const errorHandler_1 = require("./errorHandler");
const isAgent = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    if (req.user.role !== 'agent') {
        throw new errorHandler_1.AppError('Access denied. Agent role required.', 403);
    }
    next();
};
exports.isAgent = isAgent;
const isAdmin = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    if (req.user.role !== 'admin') {
        throw new errorHandler_1.AppError('Access denied. Admin role required.', 403);
    }
    next();
};
exports.isAdmin = isAdmin;
const isOwner = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    if (req.user.role !== 'owner') {
        throw new errorHandler_1.AppError('Access denied. Owner role required.', 403);
    }
    next();
};
exports.isOwner = isOwner;
const isAccountant = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    if (req.user.role !== 'accountant') {
        throw new errorHandler_1.AppError('Access denied. Accountant role required.', 403);
    }
    next();
};
exports.isAccountant = isAccountant;
const canCreateProperty = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    if (!['admin', 'owner', 'agent'].includes(req.user.role)) {
        throw new errorHandler_1.AppError('Access denied. Admin, Owner, or Agent role required to create properties.', 403);
    }
    next();
};
exports.canCreateProperty = canCreateProperty;
const canManagePayments = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    if (!['admin', 'accountant', 'agent'].includes(req.user.role)) {
        throw new errorHandler_1.AppError('Access denied. Admin, Accountant, or Agent role required to manage payments.', 403);
    }
    next();
};
exports.canManagePayments = canManagePayments;
