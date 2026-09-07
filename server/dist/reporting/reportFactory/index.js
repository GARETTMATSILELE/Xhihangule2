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
exports.reportFactory = exports.ReportFactory = void 0;
const builders_1 = require("../builders");
const exports_1 = require("../exports");
const plugins_1 = require("../plugins");
const readModels_1 = require("../readModels");
class ReportFactory {
    constructor(readModels = (0, readModels_1.createDefaultReportingReadModels)(), exportEngine = new exports_1.ExportEngine(), pluginRegistry = (0, plugins_1.createDefaultPluginRegistry)()) {
        this.exportEngine = exportEngine;
        this.pluginRegistry = pluginRegistry;
        this.ownerStatementBuilder = new builders_1.OwnerStatementBuilder(readModels);
    }
    createOwnerStatement(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const dto = yield this.ownerStatementBuilder.build(input);
            return this.pluginRegistry.applyOwnerStatementPlugins(dto);
        });
    }
    exportOwnerStatement(input, format) {
        return __awaiter(this, void 0, void 0, function* () {
            const dto = yield this.createOwnerStatement(input);
            return this.exportEngine.exportOwnerStatement(dto, format);
        });
    }
}
exports.ReportFactory = ReportFactory;
exports.reportFactory = new ReportFactory();
