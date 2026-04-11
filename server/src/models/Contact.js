const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  tenantId: {
    type: String, // UUID strings, not ObjectId
    required: true,
    index: true
  },
  phone_number: {
    type: String,
    required: true
  },
  name: String,
  profile_name: { type: String },
  lastMessage: String,
  lastMessageType: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  unreadCount: {
    type: Number,
    default: 0
  },
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag'
  }],
  lastInteractionAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'blocked', 'archived'],
    default: 'active'
  },
  source: {
    type: String,
    enum: ['manual', 'whatsapp', 'shopify', 'woocommerce', 'import', 'api', 'whatsapp_business_app'],
    default: 'whatsapp'
  },
  botMode: {
    type: Boolean,
    default: false
  },
  lastWelcomeMessageSent: {
    type: Date,
    default: null
  },
  lastBotActivation: {
    type: Date,
    default: null
  },
  lastHumanAgentRequest: {
    type: Date,
    default: null
  },
  lastBotInteraction: {
    type: Date,
    default: null
  },
  humanAgentRequested: {
    type: Boolean,
    default: false
  },
  humanAgentStatus: {
    type: String,
    enum: ['none', 'requested', 'assigned', 'resolved'],
    default: 'none'
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  assignedTo: { 
  type: mongoose.Schema.Types.ObjectId, 
  ref: 'User',
  index: true  // Add index for performance
},
assignedAt: { 
  type: Date 
},
assignedBy: { 
  type: String  // User ID who assigned
}

}, { timestamps: true });

// =========================================================
// ✅ OPTIMIZED INDEXES FOR HIGH-VOLUME CONTACTS
// =========================================================

// 1. Basic Lookups (Unique Contact per Tenant)
contactSchema.index({ tenantId: 1, phone_number: 1 }, { unique: true });

// 2. Default Sorting (Newest Chats First - CRITICAL for performance)
contactSchema.index({ tenantId: 1, timestamp: -1 });

// 3. Filter Tabs (CRITICAL for "Load All" Logic)
// Speeds up "Unread" tab filtering
contactSchema.index({ tenantId: 1, unreadCount: 1 }); 
// Speeds up "Team" tab filtering
contactSchema.index({ tenantId: 1, humanAgentRequested: 1 }); 
// Speeds up "Tags" filtering (using $in in the query)
contactSchema.index({ tenantId: 1, tags: 1 }); 

// 4. Search Optimization
contactSchema.index({ tenantId: 1, name: 1 });
contactSchema.index({ tenantId: 1, profile_name: 1 });
contactSchema.index({ tenantId: 1, lastInteractionAt: -1 });
contactSchema.index({ tenantId: 1, status: 1 });
contactSchema.index({ tenantId: 1, botMode: 1 });
contactSchema.index({ tenantId: 1, assignedTo: 1 });


// ENHANCED Static method for safe contact upserts (FIXED)
contactSchema.statics.safeUpsert = async function(tenantId, phoneNumber, updateData) {
  const maxRetries = 5; // Increased retries
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // Ensure tenantId is always a string
      const normalizedTenantId = tenantId.toString();

      console.log(`FIXED Contact upsert attempt ${attempt + 1} for:`, {
        tenantId: normalizedTenantId,
        phone: phoneNumber,
        updateData: {
          name: updateData.name,
          profileName: updateData.profile_name,
          lastMessage: updateData.lastMessage?.substring(0, 50)
        }
      });

      // FIXED: Separate the $inc operation from other updates
      const { $inc, ...regularUpdates } = updateData;

      // Step 1: Find existing contact
      let existingContact = await this.findOne({
        tenantId: normalizedTenantId,
        phone_number: phoneNumber
      });

      if (existingContact) {
        // Step 2: Update existing contact
        const updateObject = {
          ...regularUpdates,
          lastInteractionAt: new Date()
        };

        // Handle unread count increment separately
        if ($inc?.unreadCount) {
          updateObject.$inc = { unreadCount: $inc.unreadCount };
        }

        const updatedContact = await this.findOneAndUpdate(
          { _id: existingContact._id },
          updateObject,
          { new: true, runValidators: true }
        );

        console.log('FIXED Contact updated successfully:', {
          contactId: updatedContact._id,
          phoneNumber: updatedContact.phone_number,
          tenantId: updatedContact.tenantId,
          name: updatedContact.name,
          unreadCount: updatedContact.unreadCount
        });

        return updatedContact;

      } else {
        // Step 3: Create new contact (handle race conditions)
	const newContactData = {
	  tenantId: normalizedTenantId,
	  phone_number: phoneNumber,
	  ...regularUpdates,
	  // ✅ FIX: Use full phone number as fallback name (no .slice(-10))
	  name: regularUpdates.name || phoneNumber,
	  lastInteractionAt: new Date(),
	  unreadCount: $inc?.unreadCount || 1
	};

        try {
          const newContact = await this.create(newContactData);

          console.log('FIXED Contact created successfully:', {
            contactId: newContact._id,
            phoneNumber: newContact.phone_number,
            tenantId: newContact.tenantId,
            name: newContact.name,
            isNew: true
          });

          return newContact;

        } catch (createError) {
          if (createError.code === 11000) {
            // Race condition: another process created the contact
            console.log(`FIXED Race condition on attempt ${attempt + 1}, fetching existing contact`);

            const raceContact = await this.findOne({
              tenantId: normalizedTenantId,
              phone_number: phoneNumber
            });

            if (raceContact) {
              // Update the contact found in race condition
              const updateObject = {
                ...regularUpdates,
                lastInteractionAt: new Date()
              };

              if ($inc?.unreadCount) {
                updateObject.$inc = { unreadCount: $inc.unreadCount };
              }

              const finalContact = await this.findOneAndUpdate(
                { _id: raceContact._id },
                updateObject,
                { new: true }
              );

              console.log('FIXED Contact updated after race condition:', {
                contactId: finalContact._id,
                name: finalContact.name
              });

              return finalContact;
            }
          }
          throw createError;
        }
      }

    } catch (error) {
      attempt++;
      console.error(`FIXED Contact upsert error on attempt ${attempt}:`, {
        error: error.message,
        code: error.code,
        tenantId,
        phoneNumber
      });

      if (attempt >= maxRetries) {
        console.error('FIXED Failed to upsert contact after max retries:', error);
        throw error;
      }

      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
  }
};

// ENHANCED Instance method to safely increment unread count
contactSchema.methods.incrementUnreadCount = async function() {
  try {
    const updated = await this.constructor.findOneAndUpdate(
      { _id: this._id },
      {
        $inc: { unreadCount: 1 },
        lastInteractionAt: new Date()
      },
      { new: true }
    );
    return updated;
  } catch (error) {
    console.error('FIXED Error incrementing unread count:', error);
    return this;
  }
};

// ENHANCED Method to clear unread count
contactSchema.methods.clearUnreadCount = async function() {
  try {
    const updated = await this.constructor.findOneAndUpdate(
      { _id: this._id },
      {
        unreadCount: 0,
        lastInteractionAt: new Date()
      },
      { new: true }
    );
    return updated;
  } catch (error) {
    console.error('FIXED Error clearing unread count:', error);
    return this;
  }
};

// ENHANCED Static method to fix duplicate contacts
contactSchema.statics.fixDuplicateContacts = async function(tenantId) {
  console.log('FIXED: Starting duplicate contact cleanup for tenant:', tenantId);

  try {
    const pipeline = [
      { $match: { tenantId: tenantId.toString() } },
      {
        $group: {
          _id: "$phone_number",
          contacts: { $push: "$$ROOT" },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ];

    const duplicates = await this.aggregate(pipeline);
    let fixedCount = 0;

    for (const duplicate of duplicates) {
      const contacts = duplicate.contacts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const keepContact = contacts[0]; // Keep the most recent
      const removeContacts = contacts.slice(1);

      // Merge unread counts
      const totalUnread = contacts.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

      // Update the contact to keep
      await this.findByIdAndUpdate(keepContact._id, {
        unreadCount: totalUnread,
        lastInteractionAt: new Date()
      });

      // Remove duplicates
      for (const removeContact of removeContacts) {
        await this.findByIdAndDelete(removeContact._id);
        fixedCount++;
      }

      console.log(`FIXED: Merged ${removeContacts.length} duplicates for phone ${duplicate._id}`);
    }

    console.log(`FIXED: Cleanup completed. Removed ${fixedCount} duplicate contacts.`);
    return { duplicatesRemoved: fixedCount, phoneNumbersFixed: duplicates.length };

  } catch (error) {
    console.error('FIXED: Error during duplicate cleanup:', error);
    throw error;
  }
};

module.exports = mongoose.model('Contact', contactSchema);
