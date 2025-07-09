import React, { useEffect, useState } from 'react';
import { apiService } from '../../api';

interface HealthStatus {
  isHealthy: boolean;
  data?: {
    status: string;
    timestamp: string;
    database: {
      isConnected: boolean;
      isHealthy: boolean;
      lastCheck: string;
      circuitBreakerOpen: boolean;
      failureCount: number;
    };
    uptime: number;
  };
  error?: string;
}

const ConnectionStatus: React.FC = () => {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkHealth = async () => {
    setIsChecking(true);
    try {
      const healthStatus = await apiService.checkHealth();
      setStatus(healthStatus as HealthStatus);
    } catch (error) {
      setStatus({
        isHealthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (!status) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 ${
          status.isHealthy
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}
      >
        <div
          className={`w-3 h-3 rounded-full ${
            status.isHealthy ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span className="text-sm font-medium">
          {status.isHealthy ? 'Connected' : 'Disconnected'}
        </span>
        {isChecking && (
          <span className="text-sm text-gray-500">(Checking...)</span>
        )}
        {!status.isHealthy && status.error && (
          <span className="text-sm text-red-600">({status.error})</span>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus; 