import api from '../api/axios';
import { OwnerStatementDTO, ReportFormat } from './dto';

export interface OwnerStatementQuery {
  period?: string;
  from?: string;
  to?: string;
  includeAllTransactions?: boolean;
}

const buildStatementParams = (query?: string | OwnerStatementQuery) => {
  const params = new URLSearchParams();
  if (!query) return params;
  if (typeof query === 'string') {
    params.set('period', query);
    return params;
  }
  if (query.period) params.set('period', query.period);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.includeAllTransactions) params.set('includeAllTransactions', 'true');
  return params;
};

export const reportingService = {
  async getOwnerStatement(propertyId: string, query?: string | OwnerStatementQuery): Promise<OwnerStatementDTO> {
    const params = buildStatementParams(query);
    const response = await api.get(`/reporting/owner/${propertyId}?${params.toString()}`);
    return response.data;
  },

  async downloadOwnerStatement(propertyId: string, format: ReportFormat, query?: string | OwnerStatementQuery): Promise<Blob> {
    const params = buildStatementParams(query);
    const response = await api.get(`/reporting/owner/${propertyId}/${format}?${params.toString()}`, {
      responseType: 'blob'
    });
    return response.data;
  }
};

export default reportingService;

