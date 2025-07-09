"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOwnerAuthenticated = exports.isAuthenticated = void 0;
// Helper function to check if request is authenticated
const isAuthenticated = (req) => {
    return req.user !== undefined;
};
exports.isAuthenticated = isAuthenticated;
// Helper function to check if request is owner authenticated
const isOwnerAuthenticated = (req) => {
    return req.owner !== undefined;
};
exports.isOwnerAuthenticated = isOwnerAuthenticated;
