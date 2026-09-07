import React from 'react';
import { BuiltReport } from '../core/types';
import { cellValue } from '../core/engine';
import { formatLongDateValue } from '../core/format';

export type ReportPrintLayoutProps<T> = {
  title: string;
  companyName: string;
  companyLogo?: string;
  generatedAt: string;
  report: BuiltReport<T>;
  getRowKey: (row: T) => string;
  filterLabels: string[];
};

const landscapeColumnThreshold = 5;

const logoSrc = (logo?: string): string | undefined => {
  const value = String(logo || '').trim();
  if (!value) return undefined;
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    return value;
  }
  return `data:image/png;base64,${value}`;
};

export function ReportPrintLayout<T>({
  title,
  companyName,
  companyLogo,
  generatedAt,
  report,
  getRowKey,
  filterLabels,
}: ReportPrintLayoutProps<T>) {
  const columnCount = report.selectedFields.length;
  const landscape = columnCount >= landscapeColumnThreshold;
  const src = logoSrc(companyLogo);

  return (
    <div className="report-print-root">
      <style>{`
        .report-print-root {
          font-family: "Segoe UI", Arial, sans-serif;
          color: #0f172a;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow: visible;
        }
        .report-print-root *,
        .report-print-root *::before,
        .report-print-root *::after { box-sizing: border-box; }
        .report-print-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 2px solid #0f172a;
          padding-bottom: 10px;
          margin-bottom: 14px;
        }
        .report-print-brand {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .report-print-title {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-top: 4px;
        }
        .report-print-logo {
          height: 42px;
          max-width: 160px;
          object-fit: contain;
        }
        .report-print-meta {
          font-size: 12px;
          color: #334155;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }
        .report-print-section {
          margin-top: 18px;
        }
        .report-print-section h2 {
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin: 0 0 8px;
          border-bottom: 1px solid #cbd5e1;
          padding-bottom: 4px;
        }
        .report-print-table {
          width: 100%;
          max-width: 100%;
          border-collapse: collapse;
          table-layout: ${columnCount > 6 ? 'fixed' : 'auto'};
        }
        .report-print-table thead { display: table-header-group; }
        .report-print-table tfoot { display: table-footer-group; }
        .report-print-table th,
        .report-print-table td {
          border-bottom: 1px solid #e2e8f0;
          padding: 6px 8px;
          text-align: left;
          font-size: 11px;
          vertical-align: top;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .report-print-table th {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          background: #f8fafc;
        }
        @page {
          size: A4 ${landscape ? 'landscape' : 'portrait'};
          margin: 12mm;
        }
        @media print {
          .report-print-root { width: 100% !important; overflow: visible !important; }
          .report-print-table { width: 100% !important; }
          .report-print-table thead { display: table-header-group !important; }
          .report-print-table tfoot { display: table-footer-group !important; }
          .report-print-table tr { break-inside: avoid; page-break-inside: avoid; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <header className="report-print-header">
        <div>
          <div className="report-print-brand">{companyName || 'Company'}</div>
          <div className="report-print-title">{title}</div>
        </div>
        {src ? <img alt="" src={src} className="report-print-logo" /> : null}
      </header>
      <div className="report-print-meta">
        <span>Generated: {formatLongDateValue(generatedAt)}</span>
        <span>Properties: {report.totalCount}</span>
        {filterLabels.length ? <span>Filters: {filterLabels.join(' / ')}</span> : null}
      </div>
      {report.sections.map((section) => (
        <section key={section.key} className="report-print-section">
          {section.label ? <h2>{section.label}</h2> : null}
          <table className="report-print-table">
            <thead>
              <tr>
                {report.selectedFields.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={getRowKey(row)}>
                  {report.selectedFields.map((field) => (
                    <td key={field.key}>{cellValue(field, row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
