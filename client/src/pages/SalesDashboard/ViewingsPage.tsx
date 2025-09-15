import React from 'react';
import SalesSidebar from '../../components/Layout/SalesSidebar';
import { viewingService } from '../../services/viewingService';
import { useProperties } from '../../contexts/PropertyContext';
import dayjs from 'dayjs';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const cls = (...s: any[]) => s.filter(Boolean).join(' ');

export default function ViewingsPage() {
  const [events, setEvents] = React.useState<any[]>([]);
  const [selected, setSelected] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { properties: backendProperties } = useProperties();

  const propsById = React.useMemo(() => {
    const map: Record<string, any> = {};
    (backendProperties || []).forEach((p: any) => { if (p?._id) map[String(p._id)] = p; });
    return map;
  }, [backendProperties]);

  const getId = (maybe: any) => {
    if (!maybe) return undefined;
    if (typeof maybe === 'string') return maybe;
    if (typeof maybe === 'object' && maybe._id) return String(maybe._id);
    if (typeof maybe === 'object' && maybe.$oid) return String(maybe.$oid);
    return String(maybe);
  };

  const getPropertyName = (v: any) => {
    if (v?.propertyAddress) return v.propertyAddress;
    const pid = getId(v?.propertyId);
    if (pid && propsById[pid]?.name) return propsById[pid].name;
    return pid || 'Property';
  };

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const list: any[] = await viewingService.list();
      const mapped = (list || []).map(v => ({
        id: v._id,
        title: `${v?.buyerName || 'Client'}\n${getPropertyName(v)}\n${dayjs(v.when).format('HH:mm')} – ${dayjs(v.when).add(1, 'hour').format('HH:mm')}`,
        start: v.when,
        end: dayjs(v.when).add(1, 'hour').toISOString(),
        display: 'block',
        extendedProps: v
      }));
      setEvents(mapped);
    } catch (e: any) {
      setError(e?.message || 'Failed to load viewings');
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="w-full pl-0 pr-6 py-4 flex gap-6">
        <SalesSidebar />
        <div className="flex-1 max-w-6xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Viewings Calendar</h1>
            <button className="px-3 py-2 rounded-xl border bg-slate-900 text-white">+ Add Viewing</button>
          </div>
          {error && <div className="text-sm text-rose-600 mb-2">{error}</div>}
          <div className="bg-white rounded-2xl border calendar-wrapper">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
              events={events}
              editable
              expandRows
              dayMaxEventRows={false}
              dayMaxEvents={false}
              eventDrop={async (info: any) => {
                try {
                  const id = info.event.id;
                  const when = dayjs(info.event.start!).toISOString();
                  await viewingService.update(id, { when });
                } catch (e) { info.revert(); }
              }}
              eventClick={(info: any) => setSelected(info.event.extendedProps)}
              height="auto"
            />
          </div>
          <style>{`
            .calendar-wrapper .fc .fc-daygrid-day-frame { min-height: 200px; }
            .calendar-wrapper .fc .fc-daygrid-event { white-space: pre-wrap; line-height: 1.2; padding: 4px 6px; }
            .calendar-wrapper .fc .fc-daygrid-day.fc-day-today { background-color: #FFF7ED; }
          `}</style>
          {selected && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/30" onClick={()=>setSelected(null)} />
              <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-xl border">
                <div className="p-4 border-b flex items-center justify-between rounded-t-2xl">
                  <h3 className="text-lg font-semibold">Viewing Details</h3>
                  <button onClick={()=>setSelected(null)} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200">✕</button>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div><span className="font-medium">Client:</span> {selected?.buyerName || 'Client'}</div>
                  <div><span className="font-medium">Property:</span> {getPropertyName(selected)}</div>
                  <div><span className="font-medium">When:</span> {dayjs(selected?.when).format('YYYY-MM-DD HH:mm')}</div>
                  {selected?.notes && <div><span className="font-medium">Notes:</span> {selected?.notes}</div>}
                  <div className="pt-2 flex gap-2">
                    <button className="px-3 py-2 rounded-xl border">Reschedule</button>
                    <button className="px-3 py-2 rounded-xl border">Set Alarm</button>
                    <button className="px-3 py-2 rounded-xl border text-rose-700">Delete</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


