const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';

async function testCharts() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to database');

    const { PropertyOwner } = require('./dist/models/PropertyOwner');
    const { Property } = require('./dist/models/Property');
    const { MaintenanceRequest } = require('./dist/models/MaintenanceRequest');

    // Find the PropertyOwner
    const propertyOwner = await PropertyOwner.findOne({ 
      email: 'ebrahim@thebenjaminsrealty.co.zw' 
    });
    
    if (!propertyOwner) {
      console.log('PropertyOwner not found');
      return;
    }

    console.log('PropertyOwner found:', {
      id: propertyOwner._id,
      email: propertyOwner.email,
      companyId: propertyOwner.companyId,
      properties: propertyOwner.properties
    });

    // Test the getPropertyOwnerContext logic
    console.log('\n=== Testing getPropertyOwnerContext Logic ===');
    
    // First, try to find the property owner document (this is the primary source)
    let foundPropertyOwner = await PropertyOwner.findById(propertyOwner._id);
    if (foundPropertyOwner) {
      console.log(`Found PropertyOwner record: ${foundPropertyOwner.email} with companyId: ${foundPropertyOwner.companyId}`);
      console.log('Properties array:', foundPropertyOwner.properties);
    }

    // Test property retrieval
    console.log('\n=== Testing Property Retrieval ===');
    let propertyIds = [];
    if (foundPropertyOwner.properties && foundPropertyOwner.properties.length > 0) {
      propertyIds = foundPropertyOwner.properties;
      console.log('Using properties from PropertyOwner array:', propertyIds);
    } else {
      console.log('No properties in PropertyOwner array, falling back to ownerId query');
      const query = { ownerId: propertyOwner._id };
      if (foundPropertyOwner.companyId) {
        query.companyId = foundPropertyOwner.companyId;
      }
      const properties = await Property.find(query);
      propertyIds = properties.map(p => p._id);
      console.log('Found properties by ownerId:', propertyIds);
    }

    if (propertyIds.length === 0) {
      console.log('No properties found for this owner');
      return;
    }

    // Test occupancy calculation
    console.log('\n=== Testing Occupancy Calculation ===');
    const query = { _id: { $in: propertyIds } };
    if (foundPropertyOwner.companyId) {
      query.companyId = foundPropertyOwner.companyId;
    }
    const properties = await Property.find(query);
    
    console.log('Found properties:', properties.map(p => ({
      id: p._id,
      name: p.name,
      units: p.units,
      occupiedUnits: p.occupiedUnits,
      totalRentCollected: p.totalRentCollected,
      currentArrears: p.currentArrears
    })));
    
    const totalUnits = properties.reduce((sum, property) => sum + (property.units || 1), 0);
    const occupiedUnits = properties.reduce((sum, property) => sum + (property.occupiedUnits || 0), 0);
    const vacantUnits = totalUnits - occupiedUnits;

    console.log('Occupancy calculation:', {
      totalUnits,
      occupiedUnits,
      vacantUnits,
      occupancyRate: totalUnits > 0 ? (occupiedUnits / totalUnits * 100).toFixed(2) + '%' : '0%'
    });

    // Test revenue calculation
    console.log('\n=== Testing Revenue Calculation ===');
    const totalIncome = properties.reduce((sum, property) => sum + (property.totalRentCollected || 0), 0);
    const totalExpenses = properties.reduce((sum, property) => sum + (property.currentArrears || 0), 0);

    console.log('Revenue calculation:', {
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses
    });

    // Test maintenance calculation
    console.log('\n=== Testing Maintenance Calculation ===');
    const maintenanceQuery = { propertyId: { $in: propertyIds } };
    if (foundPropertyOwner.companyId) {
      maintenanceQuery.companyId = foundPropertyOwner.companyId;
    }
    const maintenanceRequests = await MaintenanceRequest.find(maintenanceQuery);

    const statusCounts = {
      pending: maintenanceRequests.filter(req => req.status === 'pending').length,
      'in_progress': maintenanceRequests.filter(req => req.status === 'in_progress').length,
      completed: maintenanceRequests.filter(req => req.status === 'completed').length
    };

    console.log('Maintenance calculation:', {
      totalRequests: maintenanceRequests.length,
      statusCounts
    });

    console.log('\n=== Chart Data Summary ===');
    console.log('Occupancy Data:', [
      { name: 'Occupied', value: occupiedUnits },
      { name: 'Vacant', value: vacantUnits }
    ]);

    console.log('Revenue Data:', [
      { name: 'Income', value: totalIncome },
      { name: 'Expenses', value: totalExpenses }
    ]);

    console.log('Maintenance Data:', [
      { name: 'Pending', value: statusCounts.pending },
      { name: 'In Progress', value: statusCounts['in_progress'] },
      { name: 'Completed', value: statusCounts.completed }
    ]);

  } catch (error) {
    console.error('Error testing charts:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
}

testCharts(); 