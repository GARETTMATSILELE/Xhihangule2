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
  const existingUser = await User.findOne({ email: userData.email });
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