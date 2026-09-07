"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultPluginRegistry = exports.PluginRegistry = void 0;
class PluginRegistry {
    constructor() {
        this.plugins = [];
    }
    register(plugin) {
        if (this.plugins.some((existing) => existing.id === plugin.id))
            return;
        this.plugins.push(plugin);
    }
    applyOwnerStatementPlugins(dto) {
        const pluginSections = this.plugins.flatMap((plugin) => { var _a; return ((_a = plugin.registerOwnerStatementSections) === null || _a === void 0 ? void 0 : _a.call(plugin, dto)) || []; });
        const charts = this.plugins.flatMap((plugin) => { var _a; return ((_a = plugin.registerOwnerStatementCharts) === null || _a === void 0 ? void 0 : _a.call(plugin, dto)) || []; });
        return Object.assign(Object.assign({}, dto), { pluginSections: [...dto.pluginSections, ...pluginSections], charts: [...dto.charts, ...charts] });
    }
}
exports.PluginRegistry = PluginRegistry;
const createDefaultPluginRegistry = () => new PluginRegistry();
exports.createDefaultPluginRegistry = createDefaultPluginRegistry;
