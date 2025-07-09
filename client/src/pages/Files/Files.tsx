import React, { useState, useEffect, ChangeEvent } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  SelectChangeEvent,
  Collapse,
} from '@mui/material';
import {
  Add as AddIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import api from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { usePropertyService } from '../../services/propertyService';
import publicApi from '../../api/publicApi';

interface Property {
  _id: string;
  name: string;
  address: string;
}

interface FileDocument {
  _id: string;
  propertyId: string;
  propertyName: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  uploadedAt: string;
  uploadedByName: string;
}

const FILE_TYPES = [
  'Lease Document',
  'Inspection Report',
  'Correspondence',
  'Receipt',
  'Quotation',
  'Acknowledgment of Receipt',
  'Application Form',
  'City of Harare Bill',
  'Title Deed',
  'Other',
] as const;

type FileType = typeof FILE_TYPES[number];

export const Files: React.FC = () => {
  const { user } = useAuth();
  const propertyService = usePropertyService();
  const [properties, setProperties] = useState<Property[]>([]);
  const [files, setFiles] = useState<FileDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [selectedFileType, setSelectedFileType] = useState<FileType>('Other');
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedPropertyId, setExpandedPropertyId] = useState<string | null>(null);
  const [propertyUpload, setPropertyUpload] = useState<{ file: File | null; fileType: FileType; uploading: boolean; error: string | null }>({ file: null, fileType: 'Other', uploading: false, error: null });

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('Files page: starting to load data');
        
        const [propertiesResponse, filesResponse] = await Promise.all([
          propertyService.getPublicProperties(),
          publicApi.get('/files')
        ]);
        
        console.log('Properties response:', propertiesResponse);
        console.log('Files response:', filesResponse.data);
        console.log('Files response type:', typeof filesResponse.data);
        console.log('Files response is array:', Array.isArray(filesResponse.data));
        if (Array.isArray(filesResponse.data)) {
          console.log('First file structure:', filesResponse.data[0]);
        }
        
        setProperties(propertiesResponse);
        
        // Ensure files data is in the correct format
        if (Array.isArray(filesResponse.data)) {
          const formattedFiles = filesResponse.data.map((file: any) => ({
            _id: file._id,
            propertyId: file.propertyId,
            propertyName: file.propertyName || 'N/A',
            fileName: file.fileName,
            fileType: file.fileType,
            fileUrl: file.fileUrl,
            uploadedAt: file.uploadedAt,
            uploadedByName: file.uploadedByName || 'Unknown'
          }));
          setFiles(formattedFiles);
        } else {
          console.error('Files response is not an array:', filesResponse.data);
          setFiles([]);
        }
        
        console.log('Files page: data loaded, files count:', Array.isArray(filesResponse.data) ? filesResponse.data.length : 0);
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load data');
      } finally {
        setLoading(false);
        console.log('Files page: loading set to false');
      }
    };

    loadData();
  }, []);

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handlePropertyChange = (event: SelectChangeEvent) => {
    setSelectedProperty(event.target.value);
  };

  const handleFileTypeChange = (event: SelectChangeEvent<FileType>) => {
    setSelectedFileType(event.target.value as FileType);
  };

  const handleUpload = async () => {
    if (!selectedProperty || !selectedFileType || !selectedFile) {
      setError('Please fill in all fields and select a file');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', selectedFile as Blob);
      formData.append('propertyId', selectedProperty);
      formData.append('fileType', selectedFileType);

      await api.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setOpenDialog(false);
      setSelectedProperty('');
      setSelectedFileType('Other');
      setSelectedFile(null);
      
      // Reload files data
      try {
        const response = await publicApi.get('/files');
        if (Array.isArray(response.data)) {
          const formattedFiles = response.data.map((file: any) => ({
            _id: file._id,
            propertyId: file.propertyId,
            propertyName: file.propertyName || 'N/A',
            fileName: file.fileName,
            fileType: file.fileType,
            fileUrl: file.fileUrl,
            uploadedAt: file.uploadedAt,
            uploadedByName: file.uploadedByName || 'Unknown'
          }));
          setFiles(formattedFiles);
        } else {
          console.error('Files response is not an array:', response.data);
          setFiles([]);
        }
      } catch (error) {
        console.error('Error reloading files:', error);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: FileDocument) => {
    try {
      const response = await api.get(`/files/download/${file._id}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setError('Failed to download file');
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!window.confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      await api.delete(`/files/${fileId}`);
      
      // Reload files data
      try {
        const response = await publicApi.get('/files');
        if (Array.isArray(response.data)) {
          const formattedFiles = response.data.map((file: any) => ({
            _id: file._id,
            propertyId: file.propertyId,
            propertyName: file.propertyName || 'N/A',
            fileName: file.fileName,
            fileType: file.fileType,
            fileUrl: file.fileUrl,
            uploadedAt: file.uploadedAt,
            uploadedByName: file.uploadedByName || 'Unknown'
          }));
          setFiles(formattedFiles);
        } else {
          console.error('Files response is not an array:', response.data);
          setFiles([]);
        }
      } catch (error) {
        console.error('Error reloading files:', error);
      }
    } catch (err: any) {
      setError('Failed to delete file');
    }
  };

  // Filter files for a property
  const getFilesForProperty = (propertyId: string) => files.filter(f => f.propertyId === propertyId);

  // Handle property row click
  const handlePropertyClick = (propertyId: string) => {
    setExpandedPropertyId(expandedPropertyId === propertyId ? null : propertyId);
    setPropertyUpload({ file: null, fileType: 'Other', uploading: false, error: null });
  };

  // Handle upload for property section
  const handlePropertyFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPropertyUpload(prev => ({ ...prev, file }));
    }
  };
  const handlePropertyFileTypeChange = (event: SelectChangeEvent<FileType>) => {
    setPropertyUpload(prev => ({ ...prev, fileType: event.target.value as FileType }));
  };
  const handlePropertyUpload = async (propertyId: string) => {
    if (!propertyUpload.fileType || !propertyUpload.file) {
      setPropertyUpload(prev => ({ ...prev, error: 'Please select a file and type' }));
      return;
    }
    setPropertyUpload(prev => ({ ...prev, uploading: true, error: null }));
    try {
      const formData = new FormData();
      formData.append('file', propertyUpload.file as Blob);
      formData.append('propertyId', propertyId);
      formData.append('fileType', propertyUpload.fileType);
      await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      // Reload files data
      const response = await publicApi.get('/files');
      if (Array.isArray(response.data)) {
        const formattedFiles = response.data.map((file: any) => ({
          _id: file._id,
          propertyId: file.propertyId,
          propertyName: file.propertyName || 'N/A',
          fileName: file.fileName,
          fileType: file.fileType,
          fileUrl: file.fileUrl,
          uploadedAt: file.uploadedAt,
          uploadedByName: file.uploadedByName || 'Unknown'
        }));
        setFiles(formattedFiles);
      }
      setPropertyUpload({ file: null, fileType: 'Other', uploading: false, error: null });
    } catch (err: any) {
      setPropertyUpload(prev => ({ ...prev, uploading: false, error: err.response?.data?.message || 'Failed to upload file' }));
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Property Files
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
        >
          Upload File
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : files.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Typography variant="h6" color="textSecondary">
            No files found. Upload a file to get started.
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Property</TableCell>
                <TableCell>File Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Uploaded By</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {files.map((file, idx) => {
                const isFirstForProperty =
                  idx === 0 || file.propertyId !== files[idx - 1].propertyId;
                return (
                  <React.Fragment key={file._id}>
                    <TableRow>
                      <TableCell>
                        {isFirstForProperty ? (
                          <Button
                            variant="text"
                            color="primary"
                            onClick={() => handlePropertyClick(file.propertyId)}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                          >
                            {file.propertyName}
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell>{file.fileName}</TableCell>
                      <TableCell>{file.fileType}</TableCell>
                      <TableCell>{file.uploadedByName}</TableCell>
                      <TableCell>{new Date(file.uploadedAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <IconButton onClick={() => handleDownload(file)} color="primary">
                          <DownloadIcon />
                        </IconButton>
                        <IconButton onClick={() => handleDelete(file._id)} color="error">
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    {isFirstForProperty && expandedPropertyId === file.propertyId && (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ bgcolor: '#f9f9f9', p: 2 }}>
                          <Box mb={2}>
                            <Typography variant="h6">Documents for {file.propertyName}</Typography>
                            <Table size="small" sx={{ mt: 1 }}>
                              <TableHead>
                                <TableRow>
                                  <TableCell>File Name</TableCell>
                                  <TableCell>Type</TableCell>
                                  <TableCell>Uploaded By</TableCell>
                                  <TableCell>Date</TableCell>
                                  <TableCell>Actions</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {getFilesForProperty(file.propertyId).map(doc => (
                                  <TableRow key={doc._id}>
                                    <TableCell>{doc.fileName}</TableCell>
                                    <TableCell>{doc.fileType}</TableCell>
                                    <TableCell>{doc.uploadedByName}</TableCell>
                                    <TableCell>{new Date(doc.uploadedAt).toLocaleDateString()}</TableCell>
                                    <TableCell>
                                      <IconButton onClick={() => handleDownload(doc)} color="primary">
                                        <DownloadIcon />
                                      </IconButton>
                                      <IconButton onClick={() => handleDelete(doc._id)} color="error">
                                        <DeleteIcon />
                                      </IconButton>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </Box>
                          <Box>
                            <Typography variant="subtitle1" sx={{ mb: 1 }}>Upload New Document</Typography>
                            <Grid container spacing={2} alignItems="center">
                              <Grid item xs={12} sm={5}>
                                <FormControl fullWidth>
                                  <InputLabel>File Type</InputLabel>
                                  <Select
                                    value={propertyUpload.fileType}
                                    onChange={handlePropertyFileTypeChange}
                                    label="File Type"
                                  >
                                    {FILE_TYPES.map((type) => (
                                      <MenuItem key={type} value={type}>
                                        {type}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              </Grid>
                              <Grid item xs={12} sm={5}>
                                <Button
                                  variant="outlined"
                                  component="label"
                                  startIcon={<UploadIcon />}
                                  fullWidth
                                >
                                  Select File
                                  <input
                                    type="file"
                                    hidden
                                    onChange={handlePropertyFileSelect}
                                  />
                                </Button>
                                {propertyUpload.file && (
                                  <Typography variant="body2" sx={{ mt: 1 }}>
                                    Selected: {propertyUpload.file.name}
                                  </Typography>
                                )}
                              </Grid>
                              <Grid item xs={12} sm={2}>
                                <Button
                                  variant="contained"
                                  onClick={() => handlePropertyUpload(file.propertyId)}
                                  disabled={propertyUpload.uploading}
                                  fullWidth
                                >
                                  {propertyUpload.uploading ? <CircularProgress size={24} /> : 'Upload'}
                                </Button>
                              </Grid>
                              {propertyUpload.error && (
                                <Grid item xs={12}>
                                  <Alert severity="error">{propertyUpload.error}</Alert>
                                </Grid>
                              )}
                            </Grid>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload File</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Property</InputLabel>
                <Select
                  value={selectedProperty}
                  onChange={handlePropertyChange}
                  label="Property"
                >
                  {properties.map((property) => (
                    <MenuItem key={property._id} value={property._id}>
                      {property.name} - {property.address}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>File Type</InputLabel>
                <Select
                  value={selectedFileType}
                  onChange={handleFileTypeChange}
                  label="File Type"
                >
                  {FILE_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadIcon />}
                fullWidth
              >
                Select File
                <input
                  type="file"
                  hidden
                  onChange={handleFileSelect}
                />
              </Button>
              {selectedFile && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Selected: {selectedFile.name}
                </Typography>
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={!selectedProperty || !selectedFileType || !selectedFile || uploading}
          >
            {uploading ? <CircularProgress size={24} /> : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}; 