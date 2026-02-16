import api from '../api/axios';

export interface ValuationRecord {
  _id?: string;
  companyId: string;
  agentId: string;
  createdAt?: string;
  updatedAt?: string;
  propertyAddress: string;
  country: string;
  city: string;
  suburb: string;
  category: 'residential' | 'commercial_office' | 'industrial';
  propertyType?: 'townhouse' | 'house' | 'apartment' | 'cluster' | 'semidetached';
  bedrooms?: number;
  bathrooms?: number;
  landSize?: number;
  zoning?: string;
  amenitiesResidential?: string[];
  amenitiesCommercial?: string[];
  amenitiesIndustrial?: string[];
  outBuildings?: boolean;
  staffQuarters?: boolean;
  cottage?: boolean;
  estimatedValue?: number;
}
 
async function create(record: ValuationRecord): Promise<ValuationRecord> {
  const payload = { ...record, createdAt: new Date().toISOString() };
  const res = await api.post('/valuations', payload);
  // Prefer server response, fall back to payload if server returns empty body
  return (res.data as ValuationRecord) || payload;
}

async function listByCompany(companyId: string): Promise<ValuationRecord[]> {
  const res = await api.get('/valuations', { params: { companyId } });
  const arr = Array.isArray(res.data) ? res.data : (Array.isArray((res.data as any)?.data) ? (res.data as any).data : []);
  return arr as ValuationRecord[];
}

async function listByAgent(agentId: string): Promise<ValuationRecord[]> {
  const res = await api.get('/valuations', { params: { agentId } });
  const arr = Array.isArray(res.data) ? res.data : (Array.isArray((res.data as any)?.data) ? (res.data as any).data : []);
  return arr as ValuationRecord[];
}

async function update(id: string, record: Partial<ValuationRecord>): Promise<ValuationRecord> {
  const res = await api.patch(`/valuations/${id}`, record);
  return res.data as ValuationRecord;
}

export default {
  create,
  listByCompany,
  listByAgent,
  update,
};


