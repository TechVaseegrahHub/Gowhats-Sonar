// routes/Tag.js - UPDATED for String tenantId
const express = require('express');
const router = express.Router();
const Tag = require('../models/Tag');
const auth = require('../middleware/auth');

/**
 * @route   GET api/tags
 * @desc    Get all tags for a specific tenant
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    console.log('🏷️ Fetching tags for tenant:', req.user.tenant_id);
    
    const tags = await Tag.find({ 
      tenantId: req.user.tenant_id, // ✅ Now works with UUID string
      isActive: true 
    }).sort({ name: 1 });
    
    console.log('✅ Found', tags.length, 'tags');
    
    res.json({ success: true, data: tags });
  } catch (err) {
    console.error('❌ Error fetching tags:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   POST api/tags
 * @desc    Create a new tag for a specific tenant
 * @access  Private
 */
router.post('/', auth, async (req, res) => {
  try {
    const { name, color, description, category } = req.body;
    
    console.log('🏷️ Creating new tag:', { name, color, category });
    
    // Check if tag with same name already exists for this tenant
    const existingTag = await Tag.findOne({
      tenantId: req.user.tenant_id,
      name: name.trim()
    });
    
    if (existingTag) {
      return res.status(400).json({
        success: false,
        message: 'A tag with this name already exists'
      });
    }
    
    // Create new tag with tenantId
    const newTag = new Tag({
      tenantId: req.user.tenant_id, // ✅ String UUID
      name: name.trim(),
      color: color || '#3B82F6',
      description: description?.trim(),
      category: category || 'other'
    });
    
    const tag = await newTag.save();
    console.log('✅ Tag created successfully:', tag._id);
    
    res.json({ success: true, data: tag });
  } catch (err) {
    console.error('❌ Error creating tag:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(err.errors).map(val => val.message)
      });
    }
    
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A tag with this name already exists'
      });
    }
    
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   PUT api/tags/:id
 * @desc    Update a tag for a specific tenant
 * @access  Private
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, color, description, category, isActive } = req.body;
    
    console.log('🏷️ Updating tag:', req.params.id);
    
    // Build tag object
    const tagFields = {};
    if (name !== undefined) tagFields.name = name.trim();
    if (color !== undefined) tagFields.color = color;
    if (description !== undefined) tagFields.description = description?.trim();
    if (category !== undefined) tagFields.category = category;
    if (isActive !== undefined) tagFields.isActive = isActive;
    
    // Find the tag by ID and tenantId
    let tag = await Tag.findOne({ 
      _id: req.params.id, 
      tenantId: req.user.tenant_id // ✅ String UUID
    });
    
    if (!tag) {
      return res.status(404).json({ success: false, message: 'Tag not found' });
    }
    
    // Check for duplicate name if name is being updated
    if (name && name.trim() !== tag.name) {
      const existingTag = await Tag.findOne({
        tenantId: req.user.tenant_id,
        name: name.trim(),
        _id: { $ne: req.params.id }
      });
      
      if (existingTag) {
        return res.status(400).json({
          success: false,
          message: 'A tag with this name already exists'
        });
      }
    }
    
    // Update the tag
    tag = await Tag.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenant_id },
      { $set: tagFields },
      { new: true, runValidators: true }
    );
    
    console.log('✅ Tag updated successfully');
    res.json({ success: true, data: tag });
  } catch (err) {
    console.error('❌ Error updating tag:', err);
    
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ success: false, message: 'Invalid tag ID' });
    }
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(err.errors).map(val => val.message)
      });
    }
    
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

/**
 * @route   DELETE api/tags/:id
 * @desc    Delete a tag for a specific tenant
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    console.log('🏷️ Deleting tag:', req.params.id);
    
    // Find the tag by ID and tenantId
    let tag = await Tag.findOne({ 
      _id: req.params.id, 
      tenantId: req.user.tenant_id // ✅ String UUID
    });
    
    if (!tag) {
      return res.status(404).json({ success: false, message: 'Tag not found' });
    }
    
    // Check if tag is being used by any contacts
    const Contact = require('../models/Contact');
    const contactsUsingTag = await Contact.countDocuments({
      tenantId: req.user.tenant_id,
      tags: req.params.id
    });
    
    if (contactsUsingTag > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete tag. It is currently assigned to ${contactsUsingTag} contact(s).`
      });
    }
    
    // Delete the tag
    await Tag.deleteOne({ 
      _id: req.params.id, 
      tenantId: req.user.tenant_id 
    });
    
    console.log('✅ Tag deleted successfully');
    res.json({ success: true, message: 'Tag removed' });
  } catch (err) {
    console.error('❌ Error deleting tag:', err);
    
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ success: false, message: 'Invalid tag ID' });
    }
    
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
