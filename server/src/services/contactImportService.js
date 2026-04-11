// services/contactImportService.js
const Papa = require('papaparse');
const xlsx = require('xlsx');
const Contact = require('../models/Contact');

class ContactImportService {
  /**
   * Parse CSV file
   */
  static parseCSV(fileBuffer) {
    return new Promise((resolve, reject) => {
      const fileContent = fileBuffer.toString('utf8');
      
      Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
        complete: (results) => {
          if (results.errors.length > 0) {
            console.error('CSV parsing errors:', results.errors);
          }
          resolve(results.data);
        },
        error: (error) => reject(error)
      });
    });
  }

  /**
   * Parse Excel file
   */
  static parseExcel(fileBuffer) {
    try {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const data = xlsx.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: ''
      });
      
      // Normalize headers
      return data.map(row => {
        const normalized = {};
        Object.keys(row).forEach(key => {
          normalized[key.trim().toLowerCase()] = row[key];
        });
        return normalized;
      });
    } catch (error) {
      throw new Error(`Excel parsing failed: ${error.message}`);
    }
  }

  /**
   * Validate and normalize phone number
   */
  static normalizePhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove all non-digit characters
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Handle Indian numbers
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return cleaned; // Already correct
    }
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      return '91' + cleaned.substring(1); // Remove leading 0, add 91
    }
    if (cleaned.length === 10) {
      return '91' + cleaned; // Add country code
    }
    
    // Invalid format
    if (cleaned.length < 10 || cleaned.length > 15) {
      return null;
    }
    
    return cleaned;
  }

  /**
   * Validate contact data
   */
  static validateContact(contact, index) {
    const errors = [];
    
    // Check for phone number
    const phoneFields = ['phone', 'phone_number', 'phonenumber', 'mobile', 'contact'];
    let phoneNumber = null;
    
    for (const field of phoneFields) {
      if (contact[field]) {
        phoneNumber = this.normalizePhoneNumber(contact[field]);
        if (phoneNumber) break;
      }
    }
    
    if (!phoneNumber) {
      errors.push(`Row ${index + 2}: Missing or invalid phone number`);
      return { valid: false, errors, contact: null };
    }
    
    // Extract name
    const nameFields = ['name', 'customer_name', 'customername', 'full_name', 'fullname'];
    let name = null;
    
    for (const field of nameFields) {
      if (contact[field] && contact[field].trim()) {
        name = contact[field].trim();
        break;
      }
    }
    
    // If no name, use last 5 digits of phone
    if (!name) {
      name = phoneNumber.slice(-5);
    }
    
    return {
      valid: true,
      errors: [],
      contact: {
        phoneNumber,
        name,
        email: contact.email || contact.email_id || null,
        tags: contact.tags ? contact.tags.split(',').map(t => t.trim()) : [],
        customFields: {
          city: contact.city || null,
          state: contact.state || null,
          country: contact.country || null,
          company: contact.company || null,
          designation: contact.designation || null
        }
      }
    };
  }

  /**
   * Import contacts to database
   */
  static async importContacts(tenantId, contacts, source = 'import') {
    const results = {
      total: contacts.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      phoneNumbers: []
    };
    
    console.log(`Starting import of ${contacts.length} contacts for tenant ${tenantId}`);
    
    for (let i = 0; i < contacts.length; i++) {
      const rawContact = contacts[i];
      const validation = this.validateContact(rawContact, i);
      
      if (!validation.valid) {
        results.failed++;
        results.errors.push(...validation.errors);
        continue;
      }
      
      const { phoneNumber, name, email, tags, customFields } = validation.contact;
      
      try {
        // Check if contact exists
        const existingContact = await Contact.findOne({
          tenantId: tenantId,
          phone_number: phoneNumber
        });
        
        if (existingContact) {
          // Update existing contact
          existingContact.name = name;
          existingContact.profile_name = name;
          if (email) existingContact.email = email;
          if (tags.length > 0) {
            existingContact.tags = [...new Set([...existingContact.tags, ...tags])];
          }
          existingContact.source = source;
          existingContact.lastImportedAt = new Date();
          
          await existingContact.save();
          results.updated++;
          results.phoneNumbers.push(phoneNumber);
          
          console.log(`Updated contact: ${phoneNumber}`);
        } else {
          // Create new contact
          const newContact = new Contact({
            tenantId: tenantId,
            phone_number: phoneNumber,
            name: name,
            profile_name: name,
            email: email,
            tags: tags,
            source: source,
            lastMessage: '',
            timestamp: new Date(),
            unreadCount: 0,
            lastImportedAt: new Date(),
            customFields: customFields
          });
          
          await newContact.save();
          results.imported++;
          results.phoneNumbers.push(phoneNumber);
          
          console.log(`Imported new contact: ${phoneNumber}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${i + 2}: ${error.message}`);
        console.error(`Error importing contact ${phoneNumber}:`, error);
      }
    }
    
    console.log('Import completed:', {
      total: results.total,
      imported: results.imported,
      updated: results.updated,
      failed: results.failed
    });
    
    return results;
  }

  /**
   * Process file import
   */
  static async processFileImport(tenantId, file) {
    try {
      console.log('Processing file import:', {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });
      
      let parsedData;
      
      // Parse based on file type
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        parsedData = await this.parseCSV(file.buffer);
      } else if (
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')
      ) {
        parsedData = this.parseExcel(file.buffer);
      } else {
        throw new Error('Unsupported file format. Please upload CSV or Excel file.');
      }
      
      if (!parsedData || parsedData.length === 0) {
        throw new Error('No data found in file');
      }
      
      console.log(`Parsed ${parsedData.length} rows from file`);
      
      // Import contacts
      const results = await this.importContacts(tenantId, parsedData, 'csv_import');
      
      return {
        success: true,
        ...results,
        fileName: file.originalname
      };
      
    } catch (error) {
      console.error('File import error:', error);
      throw error;
    }
  }

  /**
   * Get sample CSV template
   */
  static getSampleCSVTemplate() {
    return `phone_number,name,email,tags,city,state
919876543210,John Doe,john@example.com,customer,Mumbai,Maharashtra
918765432109,Jane Smith,jane@example.com,"vip,premium",Delhi,Delhi
917654321098,Bob Johnson,bob@example.com,customer,Bangalore,Karnataka`;
  }

  /**
   * Validate import before processing
   */
  static async validateImport(tenantId, file) {
    try {
      let parsedData;
      
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        parsedData = await this.parseCSV(file.buffer);
      } else {
        parsedData = this.parseExcel(file.buffer);
      }
      
      const validation = {
        totalRows: parsedData.length,
        validRows: 0,
        invalidRows: 0,
        errors: [],
        preview: []
      };
      
      // Validate first 10 rows for preview
      const previewCount = Math.min(10, parsedData.length);
      
      for (let i = 0; i < parsedData.length; i++) {
        const result = this.validateContact(parsedData[i], i);
        
        if (result.valid) {
          validation.validRows++;
          if (i < previewCount) {
            validation.preview.push(result.contact);
          }
        } else {
          validation.invalidRows++;
          validation.errors.push(...result.errors);
        }
      }
      
      return validation;
      
    } catch (error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
  }
}

module.exports = ContactImportService;
