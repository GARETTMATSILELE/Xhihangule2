import React, { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import api from '../../api/axios';

type PropertyOption = { _id: string; name?: string; address?: string };

const propertyNameAddress = (property?: { name?: string; address?: string } | null) => {
  const name = String(property?.name || '').trim();
  const address = String(property?.address || '').trim();
  if (name && address && name !== address) return `${name}, ${address}`;
  return name || address || 'Property';
};

const rowPropertyId = (row: any) => {
  const property = row?.propertyId;
  if (property && typeof property === 'object') return String(property._id || '');
  return property ? String(property) : '';
};

const NEXT: Record<string, string> = {
  OWNER_REQUESTED: 'READY_FOR_COLLECTION',
  READY_FOR_COLLECTION: 'COLLECTED',
  COLLECTED: 'ACKNOWLEDGED',
};

export const OwnerCollectionsPage: React.FC<{ apiBase: string }> = ({ apiBase }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  const load = () => {
    api.get(`${apiBase}/owner-collections`).then((res) => setRows(res.data?.data || [])).catch(() => setRows([]));
  };
  useEffect(() => { load(); }, [apiBase]);
  useEffect(() => {
    let cancelled = false;
    const loadProperties = async () => {
      const collected: PropertyOption[] = [];
      const pageSize = 250;
      for (let page = 1; page <= 10; page += 1) {
        const res = await api.get('/properties', { params: { limit: pageSize, page } });
        const data = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        collected.push(...data);
        if (data.length < pageSize) break;
      }
      if (!cancelled) setProperties(collected);
    };
    loadProperties().catch(() => {
      if (!cancelled) setProperties([]);
    });
    return () => { cancelled = true; };
  }, []);

  const propertiesById = useMemo(() => {
    const map = new Map<string, PropertyOption>();
    properties.forEach((property) => {
      if (property?._id) map.set(String(property._id), property);
    });
    return map;
  }, [properties]);

  const selectedProperty = propertiesById.get(propertyId) || null;

  const labelForRow = (row: any) => {
    const property = row?.propertyId;
    if (property && typeof property === 'object' && (property.name || property.address)) {
      return propertyNameAddress(property);
    }
    return propertyNameAddress(propertiesById.get(rowPropertyId(row)));
  };

  const create = async () => {
    const res = await api.post(`${apiBase}/owner-collections`, { propertyId, operationalAmount: Number(amount) });
    setMessage(res.data?.financialPosting === false ? 'Request recorded. No accounting entry was created.' : 'Request recorded.');
    setPropertyId('');
    setAmount('');
    load();
  };

  const advance = async (row: any) => {
    const status = NEXT[row.status];
    if (!status) return;
    await api.post(`${apiBase}/owner-collections/${row._id}/advance`, {
      status,
      acknowledgementReference: status === 'ACKNOWLEDGED' ? `ACK-${row._id}` : undefined,
    });
    load();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>Owner collections</Typography>
      <Typography variant="body2" sx={{ mb: 2, maxWidth: 720 }}>
        This queue tracks who is preparing or collecting owner funds. A status of Ready does not mean the money has been posted. Owner amounts stay on the property account.
      </Typography>
      {message && <Typography sx={{ mb: 2 }}>{message}</Typography>}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Autocomplete
              size="small"
              sx={{ minWidth: 320, flex: 1 }}
              options={[...properties].sort((a, b) => propertyNameAddress(a).localeCompare(propertyNameAddress(b)))}
              value={selectedProperty}
              onChange={(_, value) => setPropertyId(value?._id ? String(value._id) : '')}
              getOptionLabel={(option) => propertyNameAddress(option)}
              isOptionEqualToValue={(option, value) => String(option._id) === String(value._id)}
              renderInput={(params) => <TextField {...params} label="Property" placeholder="Name or address" />}
            />
            <TextField size="small" label="Operational amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button variant="contained" onClick={create} disabled={!propertyId || !amount}>Record owner request</Button>
          </Box>
        </CardContent>
      </Card>
      {rows.length === 0 ? (
        <Typography>No owner collections yet. Record a request when an owner asks to collect funds.</Typography>
      ) : rows.map((row) => (
        <Card key={row._id} sx={{ mb: 1 }}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{labelForRow(row)}</Typography>
              <Typography variant="body2">{row.currency} {Number(row.operationalAmount).toFixed(2)}</Typography>
              <Typography variant="body2">Status: {String(row.status).replace(/_/g, ' ')}</Typography>
              <Typography variant="caption">Operational request. Financial payment status is separate.</Typography>
            </Box>
            {NEXT[row.status] && (
              <Button onClick={() => advance(row)}>Mark {NEXT[row.status].replace(/_/g, ' ').toLowerCase()}</Button>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};
