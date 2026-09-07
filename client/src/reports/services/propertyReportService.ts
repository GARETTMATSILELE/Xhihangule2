import api from '../../api/axios';
import { PropertyDetailsReportResponse } from '../definitions/propertyDetails';

export const propertyReportService = {
  async getPropertyDetailsReport(scope: 'agent' | 'company' = 'agent'): Promise<PropertyDetailsReportResponse> {
    const path = scope === 'company'
      ? '/accountants/reports/property-details'
      : '/agents/reports/property-details';
    const response = await api.get(path);
    return response.data;
  },
};

export default propertyReportService;
