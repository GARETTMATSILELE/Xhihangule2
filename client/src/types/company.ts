export interface Company {
  _id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  registrationNumber: string;
  taxNumber: string;
  ownerId: string;
  description?: string;
  logo?: string;
  isActive: boolean;
  subscriptionStatus: 'active' | 'inactive' | 'trial';
  subscriptionEndDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCompany {
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  registrationNumber: string;
  taxNumber: string;
  description?: string;
} 