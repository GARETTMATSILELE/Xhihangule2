export interface TransformedMaintenanceRequest {
  _id: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  estimatedCost: number;
  createdAt: Date;
}

export interface PopulatedMaintenanceRequest {
  _id: string;
  propertyId: {
    _id: string;
    name: string;
    address: string;
  };
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  estimatedCost?: number;
  createdAt: Date;
} 