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
exports.updateSalesOwner = exports.getSalesOwnerById = exports.getSalesOwners = exports.createSalesOwner = void 0;
const SalesOwner_1 = require("../models/SalesOwner");
const createSalesOwner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!req.user.companyId) {
            return res.status(401).json({ message: 'Company ID not found' });
        }
        const { email, password, firstName, lastName, phone } = req.body;
        if (!email || !password || !firstName || !lastName || !phone) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        const existing = yield SalesOwner_1.SalesOwner.findOne({ email, companyId: req.user.companyId });
        if (existing) {
            return res.status(400).json({ message: 'Sales owner with this email already exists' });
        }
        const owner = new SalesOwner_1.SalesOwner({
            email,
            password,
            firstName,
            lastName,
            phone,
            companyId: req.user.companyId,
            creatorId: req.user.userId
        });
        yield owner.save();
        const response = owner.toObject();
        delete response.password;
        res.status(201).json(response);
    }
    catch (error) {
        console.error('Error creating sales owner:', error);
        res.status(500).json({ message: 'Error creating sales owner' });
    }
});
exports.createSalesOwner = createSalesOwner;
const getSalesOwners = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'Company ID not found' });
        }
        // Admins/accountants should see all sales owners within the company.
        // Sales agents see only the owners they created.
        const filter = { companyId: req.user.companyId };
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        if (!role || String(role).toLowerCase() === 'sales') {
            filter.creatorId = req.user.userId;
        }
        const owners = yield SalesOwner_1.SalesOwner.find(filter).select('-password');
        res.json({ owners });
    }
    catch (error) {
        console.error('Error fetching sales owners:', error);
        res.status(500).json({ message: 'Error fetching sales owners' });
    }
});
exports.getSalesOwners = getSalesOwners;
const getSalesOwnerById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'Company ID not found' });
        }
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({ message: 'Sales owner ID is required' });
        }
        const owner = yield SalesOwner_1.SalesOwner.findOne({ _id: id, companyId: req.user.companyId }).select('-password');
        if (!owner) {
            return res.status(404).json({ message: 'Sales owner not found' });
        }
        res.json(owner);
    }
    catch (error) {
        console.error('Error fetching sales owner by id:', error);
        res.status(500).json({ message: 'Error fetching sales owner' });
    }
});
exports.getSalesOwnerById = getSalesOwnerById;
const updateSalesOwner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'Company ID not found' });
        }
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({ message: 'Sales owner ID is required' });
        }
        // Allow updating selected fields only
        const { firstName, lastName, email, phone, properties } = req.body || {};
        const update = {};
        if (typeof firstName === 'string')
            update.firstName = firstName;
        if (typeof lastName === 'string')
            update.lastName = lastName;
        if (typeof email === 'string')
            update.email = email;
        if (typeof phone === 'string')
            update.phone = phone;
        if (Array.isArray(properties))
            update.properties = properties;
        const owner = yield SalesOwner_1.SalesOwner.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, update, { new: true }).select('-password');
        if (!owner) {
            return res.status(404).json({ message: 'Sales owner not found' });
        }
        res.json(owner);
    }
    catch (error) {
        console.error('Error updating sales owner:', error);
        res.status(500).json({ message: 'Error updating sales owner' });
    }
});
exports.updateSalesOwner = updateSalesOwner;
