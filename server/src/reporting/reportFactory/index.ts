import { OwnerStatementBuilder } from '../builders';
import { OwnerStatementDTO, ReportFormat, ReportPeriodDTO } from '../dto';
import { ExportEngine, ExportResult } from '../exports';
import { createDefaultPluginRegistry, PluginRegistry } from '../plugins';
import { createDefaultReportingReadModels, ReportingReadModels } from '../readModels';

export interface OwnerStatementRequest {
  companyId: string;
  propertyId: string;
  period: ReportPeriodDTO;
  generatedBy?: string;
  companyName?: string;
  companyLogo?: string;
  correlationId?: string;
}

export class ReportFactory {
  private readonly ownerStatementBuilder: OwnerStatementBuilder;

  constructor(
    readModels: ReportingReadModels = createDefaultReportingReadModels(),
    private readonly exportEngine = new ExportEngine(),
    private readonly pluginRegistry: PluginRegistry = createDefaultPluginRegistry()
  ) {
    this.ownerStatementBuilder = new OwnerStatementBuilder(readModels);
  }

  async createOwnerStatement(input: OwnerStatementRequest): Promise<OwnerStatementDTO> {
    const dto = await this.ownerStatementBuilder.build(input);
    return this.pluginRegistry.applyOwnerStatementPlugins(dto);
  }

  async exportOwnerStatement(input: OwnerStatementRequest, format: ReportFormat): Promise<ExportResult> {
    const dto = await this.createOwnerStatement(input);
    return this.exportEngine.exportOwnerStatement(dto, format);
  }
}

export const reportFactory = new ReportFactory();

