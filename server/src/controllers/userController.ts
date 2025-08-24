import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '../types/auth';

export const getCurrentUser = async (userId: string) => {
  if (!userId) {
    throw new AppError('User ID is required', 400);
  }

  try {
    const user = await User.findById(userId).select('-password');
    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching user', 500);
  }
};

export const createUser = async (userData: any) => {
  console.log('Creating user with data:', userData);

  // Check if user already exists
  const existingUser = await User.findOne({ email: userData.email, companyId: userData.companyId });
  if (existingUser) {
    throw new AppError('User already exists', 400);
  }

  // Create new user
  const user = await User.create(userData);
  console.log('User created successfully:', user);

  // Return user without password
  const { password, ...userWithoutPassword } = user.toObject();
  return userWithoutPassword;
}; 

export const updateUserById = async (id: string, updates: any, currentCompanyId?: string) => {
  if (!id) {
    throw new AppError('User ID is required', 400);
  }

  const user = await User.findById(id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Enforce company scoping if provided
  if (currentCompanyId && user.companyId && user.companyId.toString() !== currentCompanyId) {
    throw new AppError('Forbidden: User does not belong to your company', 403);
  }

  // Apply allowed updates
  if (typeof updates.firstName === 'string') user.firstName = updates.firstName;
  if (typeof updates.lastName === 'string') user.lastName = updates.lastName;
  if (typeof updates.email === 'string') user.email = updates.email;
  if (typeof updates.role === 'string') user.role = updates.role;

  // If password provided and non-empty, set it so pre-save hook re-hashes
  if (typeof updates.password === 'string' && updates.password.trim().length > 0) {
    user.password = updates.password;
  }

  await user.save();

  const { password, ...userWithoutPassword } = user.toObject();
  return userWithoutPassword;
};