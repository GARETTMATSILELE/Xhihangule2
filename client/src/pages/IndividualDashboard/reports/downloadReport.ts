import api from '../../../api/axios';
import { ReportQuery, reportParams } from '../../../services/individualWorkspaceService';
import { isDemoMode } from '../../../demo/demoMode';

function saveBlob(data: Blob, filename: string) {
  const href = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

async function downloadBlob(path: string, params: Record<string, string> | undefined, filename: string) {
  if (isDemoMode()) {
    throw new Error('Exports are unavailable in the sample workspace.');
  }
  const response = await api.get(path, { params, responseType: 'blob' });
  const contentType = String(response.headers?.['content-type'] || '');
  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    throw new Error('The export could not be prepared. Please try again.');
  }
  saveBlob(response.data, filename);
}

export async function downloadIndividualReport(reportType: string, format: 'pdf' | 'excel' | 'csv', query?: ReportQuery) {
  const extension = format === 'excel' ? 'xls' : format;
  const params = { ...(reportParams(query) || {}), format };
  await downloadBlob(`/individual/reports/${reportType}`, params, `${query?.reportKey || reportType}.${extension}`);
}

export async function downloadApiFile(apiUrl: string, filename: string) {
  const path = apiUrl.replace(/^\/api/, '');
  const [pathname, search] = path.split('?');
  const params = Object.fromEntries(new URLSearchParams(search || '').entries());
  await downloadBlob(pathname, params, filename);
}
