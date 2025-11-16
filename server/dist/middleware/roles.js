"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdminOrSales = exports.canViewCommissions = exports.canViewSalesPayments = exports.canManagePayments = exports.canCreateProperty = exports.isAccountant = exports.isOwner = exports.isAdmin = exports.isAgent = void 0;
const errorHandler_1 = require("./errorHandler");
const isAgent = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    const roles = req.user.roles || [req.user.role];
    if (!roles.some(r => ['agent', 'sales'].includes(r))) {
        throw new errorHandler_1.AppError('Access denied. Agent role required.', 403);
    }
    next();
};
exports.isAgent = isAgent;
const isAdmin = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    const roles = req.user.roles || [req.user.role];
    if (!roles.includes('admin')) {
        throw new errorHandler_1.AppError('Access denied. Admin role required.', 403);
    }
    next();
};
exports.isAdmin = isAdmin;
const isOwner = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    const roles = req.user.roles || [req.user.role];
    if (!roles.includes('owner')) {
        throw new errorHandler_1.AppError('Access denied. Owner role required.', 403);
    }
    next();
};
exports.isOwner = isOwner;
const isAccountant = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    const roles = req.user.roles || [req.user.role];
    if (!roles.includes('accountant')) {
        throw new errorHandler_1.AppError('Access denied. Accountant role required.', 403);
    }
    next();
};
exports.isAccountant = isAccountant;
const canCreateProperty = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    const roles = req.user.roles || [req.user.role];
    if (!roles.some(r => ['admin', 'owner', 'agent', 'sales'].includes(r))) {
        throw new errorHandler_1.AppError('Access denied. Admin, Owner, or Agent role required to create properties.', 403);
    }
    next();
};
exports.canCreateProperty = canCreateProperty;
const canManagePayments = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    const roles = req.user.roles || [req.user.role];
    if (!roles.some(r => ['admin', 'accountant', 'agent', 'sales', 'principal', 'prea'].includes(r))) {
        throw new errorHandler_1.AppError('Access denied. Admin, Accountant, Agent, Sales, Principal or PREA role required to manage payments.', 403);
    }
    next();
};
exports.canManagePayments = canManagePayments;
// Allow viewing sales payments for Admin/Accountant/Agent/Sales
const canViewSalesPayments = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    const roles = req.user.roles || [req.user.role];
    if (!roles.some(r => ['admin', 'accountant', 'agent', 'sales'].includes(r))) {
        throw new errorHandler_1.AppError('Access denied. Admin, Accountant, Agent, or Sales role required to view sales payments.', 403);
    }
    next();
};
exports.canViewSalesPayments = canViewSalesPayments;
// Allow viewing commission reports for Admins and Accountants
const canViewCommissions = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    const roles = req.user.roles || [req.user.role];
    if (!roles.some(r => ['admin', 'accountant'].includes(r))) {
        throw new errorHandler_1.AppError('Access denied. Admin or Accountant role required to view commissions.', 403);
    }
    next();
};
exports.canViewCommissions = canViewCommissions;
const isAdminOrSales = (req, res, next) => {
    if (!req.user) {
        throw new errorHandler_1.AppError('Authentication required', 401);
    }
    const roles = req.user.roles || [req.user.role];
    if (!roles.some(r => ['admin', 'sales'].includes(r))) {
        throw new errorHandler_1.AppError('Access denied. Admin or Sales role required.', 403);
    }
    next();
};
exports.isAdminOrSales = isAdminOrSales;
