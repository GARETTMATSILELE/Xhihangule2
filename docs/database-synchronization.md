# Database Synchronization System

## Overview

The Database Synchronization System ensures that your accountant database stays in perfect sync with your main property management database. This system provides multiple synchronization strategies to maintain data consistency and integrity across both databases.

## Architecture

### Dual Database Setup

- **Main Database**: `property-management` - Contains all property management data
- **Accounting Database**: `accounting` - Contains property accounting records and financial data

### Synchronization Strategies

1. **Real-time Synchronization** - MongoDB Change Streams for immediate updates
2. **Scheduled Synchronization** - Cron-based jobs for periodic syncs
3. **Manual Synchronization** - On-demand full sync operations
4. **Data Consistency Validation** - Automated checks and fixes

## Components

### 1. DatabaseSyncService

The core service that handles real-time synchronization using MongoDB Change Streams.

**Key Features:**
- Monitors changes in critical collections (payments, properties, users)
- Automatically syncs data to accounting database
- Handles create, update, and delete operations
- Maintains sync statistics and error tracking
- Event-driven architecture for monitoring

**Collections Monitored:**
- `payments` - Rental payments and financial transactions
- `properties` - Property information and ownership
- `users` - User accounts and property owners

### 2. ScheduledSyncService

Manages periodic synchronization tasks using cron schedules.

**Default Schedules:**
- **Daily Sync** (2:00 AM) - Full database synchronization
- **Hourly Sync** - Quick sync of recent changes
- **Weekly Consistency Check** (Sunday 3:00 AM) - Data validation
- **Monthly Deep Sync** (1st of month 4:00 AM) - Full sync with cleanup

**Features:**
- Configurable cron expressions
- Automatic consistency fixes
- Performance monitoring
- Error handling and recovery

### 3. Sync Controller & Routes

RESTful API endpoints for managing synchronization.

**Endpoints:**
```
POST /api/sync/real-time/start     # Start real-time sync
POST /api/sync/real-time/stop      # Stop real-time sync
POST /api/sync/full                # Perform manual full sync
GET  /api/sync/status              # Get sync status
GET  /api/sync/stats               # Get sync statistics
GET  /api/sync/health              # Get system health
GET  /api/sync/consistency         # Validate data consistency
GET  /api/sync/schedules           # Get all schedules
POST /api/sync/schedules           # Add new schedule
PUT  /api/sync/schedules/:name     # Update schedule
DELETE /api/sync/schedules/:name   # Remove schedule
POST /api/sync/schedules/:name/enable   # Enable schedule
POST /api/sync/schedules/:name/disable  # Disable schedule
```

### 4. DatabaseSyncDashboard

React component for monitoring and controlling synchronization from the admin interface.

**Features:**
- Real-time status monitoring
- Control panel for sync operations
- Schedule management
- Error logging and reporting
- Health status indicators

## Data Flow

### Real-time Sync Flow

```
Property Management DB → Change Stream → DatabaseSyncService → Accounting DB
```

1. **Change Detection**: MongoDB Change Streams monitor collections
2. **Event Processing**: Changes are processed based on operation type
3. **Data Transformation**: Data is formatted for accounting database
4. **Synchronization**: Updates are applied to accounting database
5. **Event Emission**: Sync events are emitted for monitoring

### Scheduled Sync Flow

```
Cron Scheduler → ScheduledSyncService → DatabaseSyncService → Accounting DB
```

1. **Schedule Trigger**: Cron job executes at specified time
2. **Sync Execution**: Appropriate sync method is called
3. **Data Processing**: Full or incremental sync is performed
4. **Consistency Check**: Data validation and fixes are applied
5. **Reporting**: Sync results and statistics are logged

## Data Mapping

### Property Account Synchronization

**Main DB → Accounting DB:**
- `Property` → `PropertyAccount`
- `Payment` → `Transaction` (income)
- `User` → `Owner` information updates

**Key Fields:**
- `propertyId` - Links to main property record
- `propertyName` - Property name for display
- `propertyAddress` - Property address
- `ownerId` - Links to property owner
- `ownerName` - Owner's full name
- `transactions` - Array of financial transactions
- `runningBalance` - Current account balance
- `totalIncome` - Total income received
- `totalExpenses` - Total expenses incurred

### Transaction Types

- **income** - Rental payments, fees, etc.
- **expense** - Maintenance, repairs, management fees
- **owner_payout** - Payments to property owners
- **repair** - Property repair costs
- **maintenance** - Regular maintenance costs
- **other** - Miscellaneous transactions

## Configuration

### Environment Variables

```bash
# Database connections
MONGODB_URI=mongodb://localhost:27017/property-management
ACCOUNTING_DB_URI=mongodb://localhost:27017/accounting

# Sync configuration
SYNC_ENABLED=true
REAL_TIME_SYNC_ENABLED=true
SCHEDULED_SYNC_ENABLED=true
```

### Default Schedules

```typescript
// Daily sync at 2 AM
daily_sync: "0 2 * * *"

// Hourly sync
hourly_sync: "0 * * * *"

// Weekly consistency check (Sunday 3 AM)
weekly_consistency_check: "0 3 * * 0"

// Monthly deep sync (1st of month 4 AM)
monthly_deep_sync: "0 4 1 * *"
```

## Monitoring & Health Checks

### Health Status Indicators

- **Healthy** - All systems running, data consistent
- **Degraded** - Minor issues, some inconsistencies
- **Unhealthy** - Major issues, sync not running

### Metrics Tracked

- Total documents synced
- Success/error counts
- Sync duration
- Last sync time
- Schedule execution counts
- Data consistency issues

### Error Handling

- Automatic retry mechanisms
- Error logging and categorization
- Circuit breaker pattern for failures
- Graceful degradation

## Best Practices

### 1. Database Design

- Use consistent ID references between databases
- Implement proper indexing for sync performance
- Design schemas for easy synchronization

### 2. Monitoring

- Set up alerts for sync failures
- Monitor sync performance metrics
- Regular consistency validation
- Log all sync operations

### 3. Performance

- Use MongoDB Change Streams efficiently
- Implement batch processing for large datasets
- Optimize database queries
- Monitor resource usage

### 4. Security

- Secure database connections
- Implement proper authentication
- Audit sync operations
- Protect sensitive financial data

## Troubleshooting

### Common Issues

1. **Change Streams Not Working**
   - Check MongoDB replica set configuration
   - Verify Change Stream privileges
   - Check network connectivity

2. **Sync Performance Issues**
   - Review database indexes
   - Check for large data sets
   - Monitor system resources

3. **Data Inconsistencies**
   - Run consistency validation
   - Check sync error logs
   - Verify data integrity

### Debug Commands

```bash
# Check sync status
curl -X GET /api/sync/status

# Validate data consistency
curl -X GET /api/sync/consistency

# Perform manual sync
curl -X POST /api/sync/full

# Check system health
curl -X GET /api/sync/health
```

## Deployment

### Prerequisites

- MongoDB 4.0+ with replica set enabled
- Node.js 18+
- Proper network access between databases

### Installation

1. Install dependencies:
   ```bash
   npm install cron
   ```

2. Configure environment variables
3. Start the sync services
4. Monitor initial sync completion
5. Verify data consistency

### Production Considerations

- Use MongoDB Atlas or managed MongoDB service
- Implement proper logging and monitoring
- Set up backup and recovery procedures
- Configure alerts for sync failures
- Regular maintenance and optimization

## API Reference

### Sync Status Response

```json
{
  "success": true,
  "data": {
    "realTime": {
      "isRunning": true,
      "lastSync": "2024-01-01T00:00:00.000Z"
    },
    "scheduled": {
      "isRunning": true,
      "totalSchedules": 4,
      "enabledSchedules": 4,
      "nextRun": "2024-01-01T02:00:00.000Z"
    },
    "stats": {
      "totalSynced": 1500,
      "successCount": 1495,
      "errorCount": 5,
      "lastSyncTime": "2024-01-01T00:00:00.000Z",
      "syncDuration": 5000
    }
  }
}
```

### Schedule Management

```json
{
  "name": "custom_sync",
  "cronExpression": "0 */6 * * *",
  "description": "Custom sync every 6 hours",
  "enabled": true,
  "runCount": 0,
  "averageDuration": 0
}
```

## Future Enhancements

### Planned Features

- **Multi-database Support** - Sync to multiple accounting databases
- **Advanced Scheduling** - Dynamic schedule adjustment
- **Conflict Resolution** - Handle data conflicts automatically
- **Performance Optimization** - Parallel processing and caching
- **Advanced Monitoring** - Real-time dashboards and alerts

### Integration Opportunities

- **Accounting Software** - QuickBooks, Xero integration
- **Bank APIs** - Direct bank statement synchronization
- **Tax Systems** - Automated tax calculation and reporting
- **Audit Systems** - Comprehensive audit trail and compliance

## Support

For technical support or questions about the synchronization system:

1. Check the error logs for specific issues
2. Review the monitoring dashboard
3. Run consistency validation
4. Contact the development team

---

*This document is maintained by the development team. Last updated: January 2024*
