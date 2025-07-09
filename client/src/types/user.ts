export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  phone?: string;
  address?: string;
  avatar?: string;
  preferences?: {
    notifications: boolean;
    theme: 'light' | 'dark';
  };
} 