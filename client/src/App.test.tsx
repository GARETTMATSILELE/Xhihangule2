import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import { ThemeProvider } from '@mui/material';
import { theme } from './theme';
import { AuthProvider } from './contexts/AuthContext';
import { CompanyProvider } from './contexts/CompanyContext';

// Mock the components that require context
vi.mock('./components/common/ConnectionStatus', () => ({
  default: () => <div data-testid="connection-status" />
}));

vi.mock('./components/MockDataSetup', () => ({
  default: () => <div data-testid="mock-data-setup" />
}));

vi.mock('./components/CompanyInfo', () => ({
  default: () => <div data-testid="company-info" />
}));

const renderWithProviders = (component: React.ReactNode) => {
  return render(
    <ThemeProvider theme={theme}>
      <AuthProvider>
        <CompanyProvider>
          {component}
        </CompanyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

describe('App Component', () => {
  it('renders landing page by default', () => {
    renderWithProviders(<App />);
    // Add your test assertions here
    expect(screen.getByTestId('connection-status')).toBeInTheDocument();
    expect(screen.getByTestId('mock-data-setup')).toBeInTheDocument();
    expect(screen.getByTestId('company-info')).toBeInTheDocument();
  });
});
