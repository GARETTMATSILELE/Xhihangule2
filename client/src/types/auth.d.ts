export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId?: string;
}

export interface Company {
  _id: string;
  name: string;
  ownerId: string;
}

export interface CreateCompany {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  registrationNumber?: string;
  taxNumber?: string;
} 