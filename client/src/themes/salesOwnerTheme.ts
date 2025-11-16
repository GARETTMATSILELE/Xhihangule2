import { createTheme } from '@mui/material/styles';

export const salesOwnerTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#3B82F6', // Soft blue (trust)
      light: '#60A5FA',
      dark: '#2563EB',
    },
    secondary: {
      main: '#14B8A6', // Muted teal (growth / calm)
      light: '#2DD4BF',
      dark: '#0D9488',
    },
    success: {
      main: '#22C55E', // Green for positive metrics
      light: '#4ADE80',
      dark: '#16A34A',
    },
    warning: {
      main: '#F59E0B', // Amber for warnings
      light: '#FBBF24',
      dark: '#D97706',
    },
    error: {
      main: '#EF4444', // Red for critical
      light: '#F87171',
      dark: '#DC2626',
    },
    info: {
      main: '#06B6D4', // Cyan-teal as cool accent
      light: '#22D3EE',
      dark: '#0891B2',
    },
    background: {
      default: '#F8FAFC', // Very light, lots of whitespace
      paper: '#FFFFFF',
    },
    text: {
      primary: '#0F172A', // Slate-900
      secondary: '#475569', // Slate-600
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, fontSize: '2.5rem' },
    h2: { fontWeight: 700, fontSize: '2rem' },
    h3: { fontWeight: 600, fontSize: '1.5rem' },
    h4: { fontWeight: 600, fontSize: '1.25rem' },
    h5: { fontWeight: 600, fontSize: '1.125rem' },
    h6: { fontWeight: 600, fontSize: '1rem' },
    body1: { fontSize: '1rem', lineHeight: 1.5 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow:
            '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1E293B',
          color: '#FFFFFF',
          width: 280,
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '4px 8px',
          '&.Mui-selected': {
            backgroundColor: 'rgba(59, 130, 246, 0.10)',
            '&:hover': {
              backgroundColor: 'rgba(59, 130, 246, 0.16)',
            },
          },
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: '#FFFFFF',
          minWidth: 40,
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: { fontWeight: 500 },
        secondary: { color: 'rgba(255, 255, 255, 0.7)' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          color: '#0F172A',
          boxShadow:
            '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
          transition:
            'background-color 200ms, box-shadow 200ms, transform 120ms',
          '&:active': {
            transform: 'translateY(0.5px) scale(0.995)',
          },
        },
        contained: {
          boxShadow:
            '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          '&:hover': {
            boxShadow:
              '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #E2E8F0',
          padding: '16px',
        },
        head: {
          fontWeight: 600,
          backgroundColor: '#F8FAFC',
        },
      },
    },
  },
});


