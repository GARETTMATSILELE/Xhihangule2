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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUser = exports.getCurrentUser = void 0;
const User_1 = require("../models/User");
const errorHandler_1 = require("../middleware/errorHandler");
const getCurrentUser = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!userId) {
        throw new errorHandler_1.AppError('User ID is required', 400);
    }
    try {
        const user = yield User_1.User.findById(userId).select('-password');
        if (!user) {
            throw new errorHandler_1.AppError('User not found', 404);
        }
        return user;
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching user', 500);
    }
});
exports.getCurrentUser = getCurrentUser;
const createUser = (userData) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Creating user with data:', userData);
    // Check if user already exists
    const existingUser = yield User_1.User.findOne({ email: userData.email });
    if (existingUser) {
        throw new errorHandler_1.AppError('User already exists', 400);
    }
    // Create new user
    const user = yield User_1.User.create(userData);
    console.log('User created successfully:', user);
    // Return user without password
    const _a = user.toObject(), { password } = _a, userWithoutPassword = __rest(_a, ["password"]);
    return userWithoutPassword;
});
exports.createUser = createUser;
