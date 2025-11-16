import api from '../api/axios';

export const salesFileService = {
  async upload(input: { file: File; propertyId: string; dealId?: string; stage?: string; docType: string }) {
    const fd = new FormData();
    fd.append('file', input.file);
    fd.append('propertyId', input.propertyId);
    if (input.dealId) fd.append('dealId', input.dealId);
    if (input.stage) fd.append('stage', input.stage);
    fd.append('docType', input.docType);
    const res = await api.post('/sales-files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data?.file || res.data;
  }
};


