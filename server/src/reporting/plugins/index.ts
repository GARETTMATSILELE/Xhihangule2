import { ChartDTO, OwnerStatementDTO, ReportPluginSectionDTO } from '../dto';

export interface ReportingPlugin {
  id: string;
  registerOwnerStatementSections?(dto: OwnerStatementDTO): ReportPluginSectionDTO[];
  registerOwnerStatementCharts?(dto: OwnerStatementDTO): ChartDTO[];
}

export class PluginRegistry {
  private readonly plugins: ReportingPlugin[] = [];

  register(plugin: ReportingPlugin): void {
    if (this.plugins.some((existing) => existing.id === plugin.id)) return;
    this.plugins.push(plugin);
  }

  applyOwnerStatementPlugins(dto: OwnerStatementDTO): OwnerStatementDTO {
    const pluginSections = this.plugins.flatMap((plugin) => plugin.registerOwnerStatementSections?.(dto) || []);
    const charts = this.plugins.flatMap((plugin) => plugin.registerOwnerStatementCharts?.(dto) || []);
    return {
      ...dto,
      pluginSections: [...dto.pluginSections, ...pluginSections],
      charts: [...dto.charts, ...charts]
    };
  }
}

export const createDefaultPluginRegistry = (): PluginRegistry => new PluginRegistry();

