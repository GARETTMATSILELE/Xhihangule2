// @ts-nocheck
import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import valuationsService from '../../services/valuationsService';

const cls = (...s: any[]) => s.filter(Boolean).join(' ');

const Card = ({ className = '', children }) => (
  <div className={cls('rounded-2xl shadow-sm border border-slate-200 bg-white', className)}>{children}</div>
);
const CardHeader = ({ className = '', children }) => (
  <div className={cls('p-4 border-b bg-gradient-to-b from-gray-50 to-white rounded-t-2xl', className)}>{children}</div>
);
const CardTitle = ({ children, className = '' }) => (
  <h3 className={cls('text-lg font-semibold', className)}>{children}</h3>
);
const CardContent = ({ className = '', children }) => (
  <div className={cls('p-4', className)}>{children}</div>
);
const Input = (props) => (
  <input {...props} className={cls('w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring', props.className)} />
);
const Select = (props) => (
  <select {...props} className={cls('w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring', props.className)} />
);
const Checkbox = ({ label, ...props }) => (
  <label className="inline-flex items-center gap-2 text-sm">
    <input type="checkbox" {...props} />
    <span>{label}</span>
  </label>
);
const Button = ({ children, className = '', ...props }) => (
  <button {...props} className={cls('px-3 py-2 rounded-xl border text-sm font-medium hover:shadow-sm transition active:scale-[.99] border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200', className)}>
    {children}
  </button>
);

export default function ValuationsPage() {
  const { user } = useAuth();
  const { company } = useCompany();

  const companyId = user?.companyId || company?._id || '';
  const agentId = user?._id || '';

  const [agentVals, setAgentVals] = React.useState<any[]>([]);
  const [companyVals, setCompanyVals] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({
    propertyAddress: '',
    country: 'Zimbabwe',
    city: '',
    suburb: '',
    category: 'residential',
    propertyType: 'house',
    bedrooms: 3,
    bathrooms: 2,
    landSize: '',
    zoning: '',
    amenitiesResidential: { borehole: false, solar: false, security: false },
    amenitiesCommercial: { powerBackup: false, security: false, strongRoom: false, parking: false, borehole: false, waterTanks: false },
    amenitiesIndustrial: { warehouse: false, factory: false, offices: false, loadingFacilities: false, coldStorage: false, heavyMachineryFoundations: false, specializedPower: false, laboratories: false, cranes: false, parking: false },
    outBuildings: false,
    staffQuarters: false,
    cottage: false,
    estimatedValue: ''
  });

  const load = React.useCallback(async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      setError(null);
      const [agentList, companyList] = await Promise.all([
        valuationsService.listByAgent(agentId),
        valuationsService.listByCompany(companyId)
      ]);
      setAgentVals(agentList);
      setCompanyVals(companyList);
    } catch (e: any) {
      setError(e?.message || 'Failed to load valuations');
      setAgentVals([]);
      setCompanyVals([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, companyId]);

  React.useEffect(() => { load(); }, [load]);

  const onSubmit = async (e: any) => {
    e.preventDefault();
    if (!companyId || !agentId) return;
    const payload = {
      companyId,
      agentId,
      propertyAddress: form.propertyAddress,
      country: form.country,
      city: form.city,
      suburb: form.suburb,
      category: form.category,
      propertyType: form.category === 'residential' ? form.propertyType : undefined,
      bedrooms: form.category === 'residential' ? Number(form.bedrooms || 0) : undefined,
      bathrooms: form.category === 'residential' ? Number(form.bathrooms || 0) : undefined,
      landSize: form.landSize ? Number(form.landSize) : undefined,
      zoning: form.zoning || undefined,
      amenitiesResidential: form.category === 'residential' ? Object.keys(form.amenitiesResidential).filter(k => form.amenitiesResidential[k]) : undefined,
      amenitiesCommercial: form.category === 'commercial_office' ? Object.keys(form.amenitiesCommercial).filter(k => form.amenitiesCommercial[k]) : undefined,
      amenitiesIndustrial: form.category === 'industrial' ? Object.keys(form.amenitiesIndustrial).filter(k => form.amenitiesIndustrial[k]) : undefined,
      outBuildings: !!form.outBuildings,
      staffQuarters: !!form.staffQuarters,
      cottage: !!form.cottage,
      estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
    } as any;
    await valuationsService.create(payload);
    setFormOpen(false);
    setForm({ ...form, propertyAddress: '', city: '', suburb: '', estimatedValue: '' });
    await load();
  };

  const [filters, setFilters] = React.useState({ city: '', suburb: '', category: '' });

  const filteredCompany = companyVals.filter(v => (
    (!filters.city || (v.city||'').toLowerCase().includes(filters.city.toLowerCase())) &&
    (!filters.suburb || (v.suburb||'').toLowerCase().includes(filters.suburb.toLowerCase())) &&
    (!filters.category || v.category === filters.category)
  ));

  // Coordinates for common Harare suburbs (approximate)
  const SUBURB_COORDS: Record<string, [number, number]> = React.useMemo(() => ({
    'avondale': [-17.789, 31.04],
    'belvedere': [-17.839, 31.018],
    'borrowdale': [-17.747, 31.09],
    'greendale': [-17.806, 31.114],
    'highlands': [-17.783, 31.125],
    'mount pleasant': [-17.764, 31.05],
    'marlborough': [-17.773, 30.993],
    'mabelreign': [-17.824, 30.997],
    'eastlea': [-17.826, 31.076],
    'milton park': [-17.83, 31.034],
    'ardyne': [-17.797, 31.03],
    'emerald hill': [-17.787, 31.006],
    'glen lorne': [-17.764, 31.12],
    'greystone park': [-17.748, 31.115],
    'vainona': [-17.756, 31.093],
    'chisipite': [-17.782, 31.138],
    'strathaven': [-17.802, 31.027],
    'alexandra park': [-17.793, 31.05],
    'harare cbd': [-17.829, 31.053],
    'cbd': [-17.829, 31.053],
  }), []);

  const normalize = (s: any) => String(s || '').trim().toLowerCase();

  // Compute averages per suburb with coordinates available
  const suburbPoints = React.useMemo(() => {
    const bySuburb: Record<string, { sum: number; count: number }> = {};
    filteredCompany.forEach(v => {
      const suburbKey = normalize(v.suburb);
      const val = Number(v.estimatedValue || 0);
      if (!suburbKey || !SUBURB_COORDS[suburbKey] || !(val > 0)) return;
      if (!bySuburb[suburbKey]) bySuburb[suburbKey] = { sum: 0, count: 0 };
      bySuburb[suburbKey].sum += val;
      bySuburb[suburbKey].count += 1;
    });
    const rows = Object.entries(bySuburb)
      .filter(([, s]) => s.count > 0)
      .map(([suburb, s]) => ({
        suburb,
        avg: s.sum / s.count,
        coords: SUBURB_COORDS[suburb] as [number, number]
      }));
    // Sort by suburb name for stable order
    rows.sort((a, b) => a.suburb.localeCompare(b.suburb));
    return rows;
  }, [filteredCompany, SUBURB_COORDS]);

  const [minAvg, maxAvg] = React.useMemo(() => {
    if (suburbPoints.length === 0) return [0, 0];
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    suburbPoints.forEach(p => {
      if (p.avg < min) min = p.avg;
      if (p.avg > max) max = p.avg;
    });
    return [min, max];
  }, [suburbPoints]);

  const valueToColor = React.useCallback((value: number) => {
    if (minAvg === maxAvg) return '#ff7f00';
    const t = (value - minAvg) / (maxAvg - minAvg); // 0..1
    // Green (low) -> Yellow -> Red (high)
    const hue = 120 - 120 * t; // 120 (green) to 0 (red)
    return `hsl(${hue}, 85%, 50%)`;
  }, [minAvg, maxAvg]);

  // Very simple area average grid (kept for quick reference)
  const areaAverages = React.useMemo(() => {
    const byArea: Record<string, { sum: number; count: number }> = {};
    filteredCompany.forEach(v => {
      const key = `${v.city || ''} | ${v.suburb || ''}`.trim();
      const val = Number(v.estimatedValue || 0);
      if (!byArea[key]) byArea[key] = { sum: 0, count: 0 };
      if (val > 0) { byArea[key].sum += val; byArea[key].count += 1; }
    });
    return Object.entries(byArea)
      .filter(([, s]) => s.count > 0)
      .map(([k, s]) => ({ area: k, avg: Math.round(s.sum / s.count) }))
      .sort((a, b) => a.area.localeCompare(b.area));
  }, [filteredCompany]);

  return (
    <div className="flex-1 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Valuations</h1>
        <Button className="bg-slate-900 text-white border-slate-900" onClick={()=>setFormOpen(true)}>Add Valuation</Button>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}

      {formOpen && (
        <Card>
          <CardHeader><CardTitle>New Valuation</CardTitle></CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={onSubmit}>
              <div className="md:col-span-3">
                <label className="text-sm">Property Address</label>
                <Input required value={form.propertyAddress} onChange={e=>setForm({ ...form, propertyAddress: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Country</label>
                <Input value={form.country} onChange={e=>setForm({ ...form, country: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">City</label>
                <Input value={form.city} onChange={e=>setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Suburb</label>
                <Input value={form.suburb} onChange={e=>setForm({ ...form, suburb: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Category</label>
                <Select value={form.category} onChange={e=>setForm({ ...form, category: e.target.value })}>
                  <option value="residential">Residential</option>
                  <option value="commercial_office">Commercial (Offices)</option>
                  <option value="industrial">Industrial</option>
                </Select>
              </div>
              {form.category === 'residential' && (
                <>
                  <div>
                    <label className="text-sm">Property Type</label>
                    <Select value={form.propertyType} onChange={e=>setForm({ ...form, propertyType: e.target.value })}>
                      <option value="house">House</option>
                      <option value="townhouse">Townhouse</option>
                      <option value="apartment">Apartment</option>
                      <option value="cluster">Cluster</option>
                      <option value="semidetached">Semi-detached</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm">Bedrooms</label>
                    <Input type="number" value={form.bedrooms} onChange={e=>setForm({ ...form, bedrooms: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm">Bathrooms</label>
                    <Input type="number" value={form.bathrooms} onChange={e=>setForm({ ...form, bathrooms: e.target.value })} />
                  </div>
                </>
              )}
              <div>
                <label className="text-sm">Land Size (sqm)</label>
                <Input type="number" value={form.landSize} onChange={e=>setForm({ ...form, landSize: e.target.value })} />
              </div>
              <div>
                <label className="text-sm">Zoning</label>
                <Input value={form.zoning} onChange={e=>setForm({ ...form, zoning: e.target.value })} />
              </div>
              {/* Amenities */}
              {form.category === 'industrial' && (
                <div className="md:col-span-3">
                  <div className="text-sm font-medium">Industrial Amenities</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                    {[
                      ['warehouse','Warehouse'],
                      ['factory','Factory'],
                      ['offices','Offices'],
                      ['loadingFacilities','Loading Facilities'],
                      ['coldStorage','Cold Storage'],
                      ['heavyMachineryFoundations','Heavy Machinery Foundations'],
                      ['specializedPower','Specialized Power Supply'],
                      ['laboratories','Laboratories'],
                      ['cranes','Cranes'],
                      ['parking','Parking'],
                    ].map(([key, label]) => (
                      <Checkbox key={key} label={label as string} checked={form.amenitiesIndustrial[key]} onChange={e=>setForm({ ...form, amenitiesIndustrial: { ...form.amenitiesIndustrial, [key]: e.target.checked } })} />
                    ))}
                  </div>
                </div>
              )}
              {form.category === 'residential' && (
                <div className="md:col-span-3">
                  <div className="text-sm font-medium">Residential Amenities</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                    {[
                      ['borehole','Borehole'],
                      ['solar','Solar'],
                      ['security','Security/Alarm'],
                    ].map(([key, label]) => (
                      <Checkbox key={key} label={label as string} checked={form.amenitiesResidential[key]} onChange={e=>setForm({ ...form, amenitiesResidential: { ...form.amenitiesResidential, [key]: e.target.checked } })} />
                    ))}
                  </div>
                </div>
              )}
              {form.category === 'commercial_office' && (
                <div className="md:col-span-3">
                  <div className="text-sm font-medium">Commercial Office Amenities</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                    {[
                      ['powerBackup','Power Backup'],
                      ['security','Security'],
                      ['strongRoom','Strong Room'],
                      ['parking','Parking'],
                      ['borehole','Borehole'],
                      ['waterTanks','Water Tanks'],
                    ].map(([key, label]) => (
                      <Checkbox key={key} label={label as string} checked={form.amenitiesCommercial[key]} onChange={e=>setForm({ ...form, amenitiesCommercial: { ...form.amenitiesCommercial, [key]: e.target.checked } })} />
                    ))}
                  </div>
                </div>
              )}
              <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <Checkbox label="Out Buildings" checked={form.outBuildings} onChange={e=>setForm({ ...form, outBuildings: e.target.checked })} />
                <Checkbox label="Staff Quarters" checked={form.staffQuarters} onChange={e=>setForm({ ...form, staffQuarters: e.target.checked })} />
                <Checkbox label="Cottage" checked={form.cottage} onChange={e=>setForm({ ...form, cottage: e.target.checked })} />
              </div>
              <div>
                <label className="text-sm">Estimated Value (USD)</label>
                <Input type="number" value={form.estimatedValue} onChange={e=>setForm({ ...form, estimatedValue: e.target.value })} />
              </div>
              <div className="md:col-span-3 flex justify-end gap-2 pt-2">
                <Button type="button" onClick={()=>setFormOpen(false)}>Cancel</Button>
                <Button className="bg-slate-900 text-white border-slate-900" type="submit">Save Valuation</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>My Valuations</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {agentVals.length === 0 && (
                  <div className="text-sm text-slate-500">No valuations yet.</div>
                )}
                {agentVals.map(v => (
                  <div key={v._id} className="p-3 rounded-xl border">
                    <div className="font-medium text-sm">{v.propertyAddress}</div>
                    <div className="text-xs text-slate-500">{v.city} · {v.suburb} · {v.category}</div>
                    {(v.bedrooms || v.bathrooms || v.landSize) && (
                      <div className="text-xs text-slate-500">
                        {v.bedrooms ? `${v.bedrooms} bd` : ''}
                        {v.bedrooms && v.bathrooms ? ' · ' : ''}
                        {v.bathrooms ? `${v.bathrooms} ba` : ''}
                        {(v.bedrooms || v.bathrooms) && v.landSize ? ' · ' : ''}
                        {v.landSize ? `${v.landSize} sqm` : ''}
                      </div>
                    )}
                    {v.estimatedValue && (
                      <div className="text-sm">Est: ${Number(v.estimatedValue).toLocaleString()}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company Valuations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
              <Input placeholder="City" value={filters.city} onChange={e=>setFilters({ ...filters, city: e.target.value })} />
              <Input placeholder="Suburb" value={filters.suburb} onChange={e=>setFilters({ ...filters, suburb: e.target.value })} />
              <Select value={filters.category} onChange={e=>setFilters({ ...filters, category: e.target.value })}>
                <option value="">All Categories</option>
                <option value="residential">Residential</option>
                <option value="commercial_office">Commercial</option>
                <option value="industrial">Industrial</option>
              </Select>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {filteredCompany.length === 0 && (
                <div className="text-sm text-slate-500">No valuations found.</div>
              )}
              {filteredCompany.map(v => (
                <div key={v._id} className="p-3 rounded-xl border">
                  <div className="font-medium text-sm">{v.propertyAddress}</div>
                  <div className="text-xs text-slate-500">{v.city} · {v.suburb} · {v.category}</div>
                  {(v.bedrooms || v.bathrooms || v.landSize) && (
                    <div className="text-xs text-slate-500">
                      {v.bedrooms ? `${v.bedrooms} bd` : ''}
                      {v.bedrooms && v.bathrooms ? ' · ' : ''}
                      {v.bathrooms ? `${v.bathrooms} ba` : ''}
                      {(v.bedrooms || v.bathrooms) && v.landSize ? ' · ' : ''}
                      {v.landSize ? `${v.landSize} sqm` : ''}
                    </div>
                  )}
                  {v.estimatedValue && (
                    <div className="text-sm">Est: ${Number(v.estimatedValue).toLocaleString()}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Harare Valuation Heat Map */}
      <Card>
        <CardHeader><CardTitle>Harare Valuation Heat Map</CardTitle></CardHeader>
        <CardContent>
          {suburbPoints.length === 0 ? (
            <div className="text-sm text-slate-500">No suburb data with coordinates yet.</div>
          ) : (
            <div className="space-y-3">
              <div className="w-full h-[420px] rounded-xl overflow-hidden border">
                <MapContainer center={[-17.829, 31.053]} zoom={12} style={{ width: '100%', height: '100%' }} scrollWheelZoom={false}>
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {suburbPoints.map(p => (
                    <CircleMarker
                      key={p.suburb}
                      center={p.coords}
                      radius={8 + Math.min(20, Math.max(0, Math.sqrt(p.avg) / 200))}
                      pathOptions={{ color: valueToColor(p.avg), fillColor: valueToColor(p.avg), fillOpacity: 0.6 }}
                    >
                      <LeafletTooltip direction="top" offset={[0, -6]} opacity={1} permanent={false}>
                        <div style={{ fontSize: 12 }}>
                          <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{p.suburb}</div>
                          <div>Avg: ${Math.round(p.avg).toLocaleString()}</div>
                        </div>
                      </LeafletTooltip>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {areaAverages.map(a => (
                  <div key={a.area} className="p-3 rounded-xl border flex items-center justify-between">
                    <div className="text-sm text-slate-700">{a.area}</div>
                    <div className="text-sm font-semibold">${a.avg.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



