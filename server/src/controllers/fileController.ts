import { Request, Response } from 'express';
import File, { IFile } from '../models/File';
import { Property } from '../models/Property';
import { AuthRequest } from '../middleware/auth';
import { Types } from 'mongoose';

interface PopulatedProperty {
  _id: Types.ObjectId;
  name: string;
}

interface PopulatedUser {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
}

interface PopulatedFile extends Omit<IFile, 'propertyId' | 'uploadedBy'> {
  propertyId: PopulatedProperty;
  uploadedBy: PopulatedUser;
}

// Get all files for a property
export const getFiles = async (req: AuthRequest, res: Response) => {
  try {
    console.log('getFiles called: returning all files');
    
    const files = await File.find()
      .populate<{ propertyId: PopulatedProperty }>('propertyId', 'name')
      .populate<{ uploadedBy: PopulatedUser }>('uploadedBy', 'firstName lastName');
    
    console.log('Database query completed, found files:', files.length);

    const formattedFiles = files.map((file: any) => {
      const fileObj = file.toObject() as PopulatedFile;
      return {
        ...fileObj,
        propertyName: fileObj.propertyId?.name || 'N/A',
        uploadedByName: fileObj.uploadedBy ? 
          `${fileObj.uploadedBy.firstName} ${fileObj.uploadedBy.lastName}` : 
          'Unknown'
      };
    });
    
    console.log('Sending response with', formattedFiles.length, 'files');
    res.json(formattedFiles);
  } catch (error) {
    console.error('Error in getFiles:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Upload a file
export const uploadFile = async (req: AuthRequest, res: Response) => {
  try {
    console.log('Upload request received:', {
      file: req.file,
      body: req.body,
      user: req.user
    });

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { propertyId, fileType } = req.body;
    const userId = req.user?.userId;

    if (!propertyId || !fileType || !userId) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        details: { propertyId, fileType, userId }
      });
    }

    // Check if property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Create file record
    const file = new File({
      propertyId,
      fileName: req.file.originalname,
      fileType,
      fileUrl: req.file.buffer.toString('base64'),
      uploadedBy: userId
    });

    await file.save();

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        _id: file._id,
        fileName: file.fileName,
        fileType: file.fileType,
        propertyId: file.propertyId,
        uploadedBy: file.uploadedBy,
        uploadedAt: file.uploadedAt
      }
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ 
      message: 'Error uploading file',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Download a file
export const downloadFile = async (req: Request, res: Response) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Convert base64 back to buffer
    const buffer = Buffer.from(file.fileUrl, 'base64');

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ message: 'Error downloading file' });
  }
};

// Delete a file
export const deleteFile = async (req: Request, res: Response) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    await file.deleteOne();
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Error deleting file' });
  }
}; 