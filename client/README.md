# Property Management System - Frontend

This is the frontend application for the Property Management System, built with React, TypeScript, and Material-UI.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Setup

1. Clone the repository
2. Navigate to the client directory:
   ```bash
   cd client
   ```
3. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```
4. Create a `.env` file in the client directory and add the following:
   ```
   REACT_APP_API_URL=http://localhost:5000
   ```
5. Start the development server:
   ```bash
   npm start
   # or
   yarn start
   ```

The application will be available at `http://localhost:3000`.

## Features

- User authentication and authorization
- Property management
- Tenant management
- Lease management
- Payment tracking
- User settings

## Project Structure

```
src/
  ├── components/     # Reusable components
  ├── contexts/       # React contexts
  ├── pages/         # Page components
  ├── theme.ts       # Material-UI theme configuration
  ├── App.tsx        # Main application component
  └── index.tsx      # Application entry point
```

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm test` - Launches the test runner
- `npm run build` - Builds the app for production
- `npm run eject` - Ejects from Create React App

## Dependencies

- React
- TypeScript
- Material-UI
- React Router
- Axios
- Recharts (for charts and graphs)
