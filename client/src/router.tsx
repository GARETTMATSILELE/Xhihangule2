import React from 'react';
import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';
import App from './App';

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="*" element={<App />} />
  ),
  {
    future: {
      v7_relativeSplatPath: true
    }
  }
);

export default router;


