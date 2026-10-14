import { parsePortfolioCsv } from './portfolioImport';

describe('parsePortfolioCsv', () => {
  it('validates required property names and does not invent records', () => {
    const preview = parsePortfolioCsv('name,address,city\n12 Arundel Road,Alexandra Park,Harare\n,Borrowdale,\nAvondale Court,Avondale,Harare');
    expect(preview.validCount).toBe(2);
    expect(preview.invalidCount).toBe(1);
    expect(preview.rows[1].errors).toContain('Property name is required');
  });

  it('returns an empty preview for blank input', () => {
    const preview = parsePortfolioCsv('   ');
    expect(preview.rows).toEqual([]);
    expect(preview.validCount).toBe(0);
  });
});
