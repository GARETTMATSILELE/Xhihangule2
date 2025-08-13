const mongoose = require('mongoose');
const { PaymentRequest } = require('../dist/models/PaymentRequest');
const { Tenant } = require('../dist/models/Tenant');
const { PropertyOwner } = require('../dist/models/PropertyOwner');
const { Property } = require('../dist/models/Property');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/property-management', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function fixPaymentRequests() {
  try {
    console.log('Starting payment request data migration...');
    
    // Get all payment requests
    const paymentRequests = await PaymentRequest.find({});
    console.log(`Found ${paymentRequests.length} payment requests to check`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const paymentRequest of paymentRequests) {
      try {
        let needsUpdate = false;
        const updateData = {};
        
        // Check and fix propertyId
        if (paymentRequest.propertyId && typeof paymentRequest.propertyId === 'string') {
          // Try to find the property by name if it's not a valid ObjectId
          if (!mongoose.Types.ObjectId.isValid(paymentRequest.propertyId)) {
            const property = await Property.findOne({ name: paymentRequest.propertyId });
            if (property) {
              updateData.propertyId = property._id;
              needsUpdate = true;
              console.log(`Fixed propertyId for payment request ${paymentRequest._id}: "${paymentRequest.propertyId}" -> ${property._id}`);
            } else {
              console.log(`Warning: Could not find property with name "${paymentRequest.propertyId}" for payment request ${paymentRequest._id}`);
              errorCount++;
              continue;
            }
          }
        }
        
        // Check and fix tenantId
        if (paymentRequest.tenantId && typeof paymentRequest.tenantId === 'string') {
          if (!mongoose.Types.ObjectId.isValid(paymentRequest.tenantId)) {
            // Try to find tenant by name (firstName + lastName)
            const nameParts = paymentRequest.tenantId.split(' ');
            if (nameParts.length >= 2) {
              const firstName = nameParts[0];
              const lastName = nameParts.slice(1).join(' ');
              const tenant = await Tenant.findOne({ 
                firstName: firstName, 
                lastName: lastName,
                companyId: paymentRequest.companyId 
              });
              if (tenant) {
                updateData.tenantId = tenant._id;
                needsUpdate = true;
                console.log(`Fixed tenantId for payment request ${paymentRequest._id}: "${paymentRequest.tenantId}" -> ${tenant._id}`);
              } else {
                console.log(`Warning: Could not find tenant with name "${paymentRequest.tenantId}" for payment request ${paymentRequest._id}`);
                // Remove the invalid tenantId
                updateData.tenantId = null;
                needsUpdate = true;
              }
            } else {
              console.log(`Warning: Invalid tenant name format "${paymentRequest.tenantId}" for payment request ${paymentRequest._id}`);
              updateData.tenantId = null;
              needsUpdate = true;
            }
          }
        }
        
        // Check and fix ownerId
        if (paymentRequest.ownerId && typeof paymentRequest.ownerId === 'string') {
          if (!mongoose.Types.ObjectId.isValid(paymentRequest.ownerId)) {
            // Try to find owner by name
            const nameParts = paymentRequest.ownerId.split(' ');
            if (nameParts.length >= 2) {
              const firstName = nameParts[0];
              const lastName = nameParts.slice(1).join(' ');
              const owner = await PropertyOwner.findOne({ 
                firstName: firstName, 
                lastName: lastName,
                companyId: paymentRequest.companyId 
              });
              if (owner) {
                updateData.ownerId = owner._id;
                needsUpdate = true;
                console.log(`Fixed ownerId for payment request ${paymentRequest._id}: "${paymentRequest.ownerId}" -> ${owner._id}`);
              } else {
                console.log(`Warning: Could not find owner with name "${paymentRequest.ownerId}" for payment request ${paymentRequest._id}`);
                updateData.ownerId = null;
                needsUpdate = true;
              }
            } else {
              console.log(`Warning: Invalid owner name format "${paymentRequest.ownerId}" for payment request ${paymentRequest._id}`);
              updateData.ownerId = null;
              needsUpdate = true;
            }
          }
        }
        
        // Check and fix processedBy
        if (paymentRequest.processedBy && typeof paymentRequest.processedBy === 'string') {
          if (!mongoose.Types.ObjectId.isValid(paymentRequest.processedBy)) {
            console.log(`Warning: Invalid processedBy ObjectId "${paymentRequest.processedBy}" for payment request ${paymentRequest._id}`);
            updateData.processedBy = null;
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          await PaymentRequest.findByIdAndUpdate(paymentRequest._id, updateData);
          fixedCount++;
        } else {
          skippedCount++;
        }
        
      } catch (error) {
        console.error(`Error processing payment request ${paymentRequest._id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\nMigration completed:');
    console.log(`- Fixed: ${fixedCount} payment requests`);
    console.log(`- Skipped: ${skippedCount} payment requests`);
    console.log(`- Errors: ${errorCount} payment requests`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the migration
fixPaymentRequests(); 