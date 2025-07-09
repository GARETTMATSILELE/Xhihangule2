import api from '../api/axios';
import { Payment } from '../types/payment';
import { useAuth } from '../contexts/AuthContext';

// Commented out for future use
/*
interface RevenueData {
  totalRevenue: {
    monthly: number;
    quarterly: number;
    annual: number;
  };
  bySource: Array<{ name: string; value: number }>;
  byProperty: Array<{ name: string; value: number }>;
  byComplex: Array<{ name: string; value: number }>;
  monthlyTrend: Array<{ month: string; revenue: number }>;
  agentRevenue: Array<{ name: string; value: number }>;
}

export const useRevenueService = () => {
  const { user, isAuthenticated } = useAuth();

  const getRevenueData = async (): Promise<RevenueData> => {
    if (!isAuthenticated) {
      throw new Error('Authentication required to access revenue data');
    }

    try {
      // Get payments for the current month
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const [paymentsResponse, leasesResponse] = await Promise.all([
        api.get('/payments'),
        api.get('/leases')
      ]);

      const monthlyPayments = paymentsResponse.data.filter((payment: Payment) => {
        const paymentDate = new Date(payment.paymentDate);
        return paymentDate >= startOfMonth && 
               paymentDate <= endOfMonth && 
               payment.status === 'completed';
      });

      const activeLeases = leasesResponse.data.filter((lease: any) => lease.status === 'active');

      if (!Array.isArray(monthlyPayments) || !Array.isArray(activeLeases)) {
        throw new Error('Invalid data format received from server');
      }

      // Calculate total monthly revenue
      const totalMonthlyRevenue = monthlyPayments.reduce((sum: number, payment: Payment) => 
        sum + (payment.amountInUSD || payment.amount), 0);

      // Calculate revenue by source
      const revenueBySource = [
        { name: 'Rent', value: totalMonthlyRevenue * 0.85 }, // 85% from rent
        { name: 'Fees', value: totalMonthlyRevenue * 0.10 }, // 10% from fees
        { name: 'Services', value: totalMonthlyRevenue * 0.05 } // 5% from services
      ];

      // Calculate revenue by property
      const revenueByProperty = activeLeases.reduce((acc: any[], lease: any) => {
        const propertyPayments = monthlyPayments.filter((p: Payment) => 
          p.propertyId === lease.propertyId
        );
        const propertyRevenue = propertyPayments.reduce((sum: number, p: Payment) => 
          sum + (p.amountInUSD || p.amount), 0);
        
        // Safely access property name with fallback
        const propertyName = lease.property?.name || `Property ${lease.propertyId}`;
        
        acc.push({
          name: propertyName,
          value: propertyRevenue
        });
        return acc;
      }, []);

      // Calculate revenue by complex
      const revenueByComplex = revenueByProperty.reduce((acc: any[], property: any) => {
        const complexName = property.name.split(' ')[0] || 'Unknown Complex';
        const existing = acc.find(item => item.name === complexName);
        if (existing) {
          existing.value += property.value;
        } else {
          acc.push({ name: complexName, value: property.value });
        }
        return acc;
      }, []);

      // Calculate agent revenue
      const agentRevenue = activeLeases.reduce((acc: any[], lease: any) => {
        const agentName = lease.agent?.name || 'Unknown Agent';
        const agentCommission = (lease.rentAmount || 0) * 0.1; // 10% commission
        const existing = acc.find(item => item.name === agentName);
        if (existing) {
          existing.value += agentCommission;
        } else {
          acc.push({ name: agentName, value: agentCommission });
        }
        return acc;
      }, []);

      // Generate monthly trend data
      const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        const monthPayments = monthlyPayments.filter((p: Payment) => {
          const paymentDate = new Date(p.paymentDate);
          return paymentDate >= monthStart && paymentDate <= monthEnd;
        });

        const monthRevenue = monthPayments.reduce((sum: number, p: Payment) => 
          sum + (p.amountInUSD || p.amount), 0);

        return {
          month: date.toLocaleString('default', { month: 'short' }),
          revenue: monthRevenue
        };
      }).reverse();

      return {
        totalRevenue: {
          monthly: totalMonthlyRevenue,
          quarterly: totalMonthlyRevenue * 3,
          annual: totalMonthlyRevenue * 12
        },
        bySource: revenueBySource,
        byProperty: revenueByProperty,
        byComplex: revenueByComplex,
        monthlyTrend,
        agentRevenue
      };
    } catch (error: any) {
      console.error('Error fetching revenue data:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required to access revenue data');
      }
      throw new Error(error.response?.data?.message || 'Failed to fetch revenue data');
    }
  };

  return {
    getRevenueData
  };
};
*/

// Temporary placeholder service
export const useRevenueService = () => {
  return {
    getRevenueData: async () => {
      throw new Error('Revenue tracking features are currently disabled');
    }
  };
}; 