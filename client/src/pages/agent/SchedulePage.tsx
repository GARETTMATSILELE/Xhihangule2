import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Chip,
  Tooltip
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Notifications as NotificationsIcon } from '@mui/icons-material';
import { useNotification } from '../../components/Layout/Header';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, parse, startOfWeek, getDay } from 'date-fns';

const locales = {
  'en-US': require('date-fns/locale/en-US'),
};
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

// Task types
const TASK_TYPES = [
  { value: 'viewing', label: 'Viewing' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
];

// Task interface
interface Task {
  id: string;
  type: string;
  title: string;
  date: string;
  time: string;
  clientName?: string;
  clientPhone?: string;
  address?: string;
  notes?: string;
  notified?: boolean;
}

const minimalistCardStyle = {
  borderRadius: 3,
  boxShadow: '0 2px 12px 0 rgba(0,0,0,0.04)',
  background: '#fff',
  mb: 2,
  p: 2,
  minWidth: 320,
};

const SchedulePage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    // Persist tasks in localStorage for demo
    const saved = localStorage.getItem('agent-tasks');
    return saved ? JSON.parse(saved) : [];
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<Partial<Task>>({ type: 'viewing' });
  const [notificationTasks, setNotificationTasks] = useState<Task[]>([]);
  const { addNotification } = useNotification();

  // Save tasks to localStorage
  useEffect(() => {
    localStorage.setItem('agent-tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Notification logic: find tasks 30 min before now
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const soonTasks = tasks.filter(task => {
        if (task.notified) return false;
        const taskDateTime = new Date(`${task.date}T${task.time}`);
        const diff = (taskDateTime.getTime() - now.getTime()) / 60000;
        return diff > 0 && diff <= 30 && (task.type === 'viewing' || task.type === 'meeting');
      });
      if (soonTasks.length > 0) {
        setNotificationTasks(soonTasks);
        // Mark as notified
        setTasks(prev => prev.map(t =>
          soonTasks.some(st => st.id === t.id) ? { ...t, notified: true } : t
        ));
        // Push notifications to global notification system
        soonTasks.forEach(task => {
          addNotification({
            id: `schedule-${task.id}-${task.date}-${task.time}`,
            title: task.type === 'viewing' ? 'Upcoming Viewing' : 'Upcoming Meeting',
            message: `${task.title} at ${task.time} on ${task.date}` + (task.type === 'viewing' && task.clientName ? ` with ${task.clientName}` : ''),
            link: '/agent-dashboard/schedule',
            read: false,
            createdAt: new Date(),
          });
        });
      }
    }, 60000); // check every minute
    return () => clearInterval(interval);
  }, [tasks, addNotification]);

  // Handle notification click (simulate notification pane)
  const handleNotificationClick = () => {
    // In real app, integrate with notification pane and redirect to schedule page
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setNotificationTasks([]);
  };

  // Open dialog for new/edit task
  const openDialog = (task?: Task) => {
    setEditingTask(task || null);
    setForm(task ? { ...task } : { type: 'viewing' });
    setDialogOpen(true);
  };

  // Handle form change
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

  // Save task
  const handleSave = () => {
    if (!form.type || !form.title || !form.date || !form.time) return;
    if (editingTask) {
      setTasks(ts => ts.map(t => t.id === editingTask.id ? { ...editingTask, ...form } as Task : t));
    } else {
      setTasks(ts => [
        ...ts,
        {
          ...form,
          id: Math.random().toString(36).substr(2, 9),
          notified: false,
        } as Task,
      ]);
    }
    setDialogOpen(false);
    setEditingTask(null);
    setForm({ type: 'viewing' });
  };

  // Delete task
  const handleDelete = (id: string) => {
    setTasks(ts => ts.filter(t => t.id !== id));
  };

  // Minimalist, modern design
  return (
    <div className="min-h-screen w-full bg-[#f7fafd] flex flex-col items-stretch justify-stretch px-0 py-0 font-sans" style={{ fontFamily: 'Poppins, ui-sans-serif, system-ui' }}>
      <div className="flex flex-col flex-grow h-full min-h-screen p-6 gap-8">
        {/* Header */}
        <div className="text-center mb-2">
          <h1 className="text-4xl font-bold tracking-wide text-gray-900">Schedule Overview</h1>
          <div className="mx-auto mt-2 w-16 h-1 bg-blue-500 rounded-full" />
          <p className="text-sm text-gray-500 mt-2">Plan your tasks effortlessly</p>
        </div>

        {/* Add Task Button */}
        <div className="flex justify-end mb-2">
          <button
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg shadow transition-colors"
            onClick={() => openDialog()}
          >
            <AddIcon fontSize="small" /> Add Task
          </button>
        </div>

        {/* Scheduled Events - Tiled Cards */}
        <div className="w-full overflow-x-auto pb-2">
          <div className="flex gap-4 min-w-[600px]">
            {tasks.length === 0 ? (
              <div className="flex-1 text-center text-gray-400">No tasks scheduled yet.</div>
            ) : (
              tasks
                .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
                .map((task, idx) => (
                  <div
                    key={task.id}
                    className={
                      `flex flex-col justify-between w-64 h-44 rounded-2xl shadow-md bg-white text-black font-semibold relative border-l-8 border-blue-500`
                    }
                    style={{ minWidth: '16rem', fontFamily: 'Poppins, ui-sans-serif, system-ui' }}
                  >
                    <div className="flex justify-between items-center mb-2 px-3 pt-3">
                      <span className="text-lg font-bold truncate">{task.title}</span>
                      <div className="flex gap-1">
                        <button onClick={() => openDialog(task)} className="hover:text-blue-600 transition-colors"><EditIcon fontSize="small" /></button>
                        <button onClick={() => handleDelete(task.id)} className="hover:text-red-600 transition-colors"><DeleteIcon fontSize="small" /></button>
                      </div>
                    </div>
                    {/* Four evenly spaced blue info boxes */}
                    <div className="flex gap-2 mb-2 px-3">
                      <div className="flex-1 bg-blue-100 text-blue-900 rounded-lg px-2 py-2 text-xs font-semibold text-center">{task.type || 'Type'}</div>
                      <div className="flex-1 bg-blue-100 text-blue-900 rounded-lg px-2 py-2 text-xs font-semibold text-center">{task.date}</div>
                      <div className="flex-1 bg-blue-100 text-blue-900 rounded-lg px-2 py-2 text-xs font-semibold text-center">{task.time}</div>
                      <div className="flex-1 bg-blue-100 text-blue-900 rounded-lg px-2 py-2 text-xs font-semibold text-center">{task.clientName || 'N/A'}</div>
                    </div>
                    <div className="px-3 pb-3">
                      {task.address && <div className="text-xs text-gray-500">📍 {task.address}</div>}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Calendar Section */}
        <div className="bg-white rounded-2xl p-6 shadow-md flex-grow w-full h-[60vh] min-h-[400px]">
          <Calendar
            localizer={localizer}
            events={tasks.map(task => ({
              id: task.id,
              title: task.title,
              start: new Date(`${task.date}T${task.time}`),
              end: new Date(`${task.date}T${task.time}`),
              allDay: false,
            }))}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%', width: '100%', background: 'transparent', color: 'black', borderRadius: '1.5rem', fontFamily: 'Poppins, ui-sans-serif, system-ui' }}
            className="text-black"
            eventPropGetter={() => ({ style: { backgroundColor: '#3b82f6', color: '#fff', borderRadius: '0.75rem', border: 'none', padding: '2px 8px', fontWeight: 600 } })}
            dayPropGetter={() => ({ style: { backgroundColor: 'transparent' } })}
            toolbar={true}
            views={['month', 'week', 'day']}
          />
        </div>

        {/* Add/Edit Task Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingTask ? 'Edit Task' : 'Add Task'}</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} mt={1}>
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  label="Type"
                  name="type"
                  value={form.type || ''}
                  onChange={handleFormChange}
                  fullWidth
                >
                  {TASK_TYPES.map(option => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Title"
                  name="title"
                  value={form.title || ''}
                  onChange={handleFormChange}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Date"
                  name="date"
                  type="date"
                  value={form.date || ''}
                  onChange={handleFormChange}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Time"
                  name="time"
                  type="time"
                  value={form.time || ''}
                  onChange={handleFormChange}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  required
                />
              </Grid>
              {form.type === 'viewing' && (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Client Name"
                      name="clientName"
                      value={form.clientName || ''}
                      onChange={handleFormChange}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Client Phone"
                      name="clientPhone"
                      value={form.clientPhone || ''}
                      onChange={handleFormChange}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Property Address"
                      name="address"
                      value={form.address || ''}
                      onChange={handleFormChange}
                      fullWidth
                    />
                  </Grid>
                </>
              )}
              <Grid item xs={12}>
                <TextField
                  label="Notes"
                  name="notes"
                  value={form.notes || ''}
                  onChange={handleFormChange}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} color="secondary">
              Cancel
            </Button>
            <Button onClick={handleSave} variant="contained" color="primary">
              Save
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    </div>
  );
};

export default SchedulePage; 