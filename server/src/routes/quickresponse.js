const express = require('express');
const router = express.Router();
const QuickResponse = require('../models/QuickResponse');
const auth = require('../middleware/auth');

/**
 * @route   GET /api/quick-responses
 * @desc    Get all quick responses for the current tenant
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const responses = await QuickResponse.find({ 
      tenant_id: req.tenantId
    }).sort({ createdAt: -1 });
    
    res.json(responses);
  } catch (error) {
    console.error('Error fetching quick responses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/quick-responses/search/:term
 * @desc    Search quick responses by shortcut or message within tenant
 * @access  Private
 */
router.get('/search/:term', auth, async (req, res) => {
  try {
    const searchTerm = req.params.term;
    
    const responses = await QuickResponse.find({
      tenant_id: req.tenantId,
      $or: [
        { shortcut: { $regex: searchTerm, $options: 'i' } },
        { message: { $regex: searchTerm, $options: 'i' } }
      ]
    }).sort({ createdAt: -1 });
    
    res.json(responses);
  } catch (error) {
    console.error('Error searching quick responses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/quick-responses
 * @desc    Create a new quick response for the tenant
 * @access  Private
 */
router.post('/', auth, async (req, res) => {
  try {
    let { shortcut, message } = req.body;
    
    // Ensure shortcut starts with a forward slash
    if (!shortcut.startsWith('/')) {
      shortcut = `/${shortcut}`;
    }
    
    // Check if a quick response with this shortcut already exists for this tenant
    const existingResponse = await QuickResponse.findOne({ 
      tenant_id: req.tenantId,
      shortcut 
    });
    
    if (existingResponse) {
      return res.status(400).json({ message: 'A quick response with this shortcut already exists' });
    }
    
    const newResponse = new QuickResponse({
      shortcut,
      message,
      tenant_id: req.tenantId,
      created_by: req.user.id  // Optional: track creator
    });
    
    const savedResponse = await newResponse.save();
    res.status(201).json(savedResponse);
  } catch (error) {
    console.error('Error creating quick response:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/quick-responses/:id
 * @desc    Update a quick response within tenant
 * @access  Private
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const { shortcut, message } = req.body;
    
    // Add debug logs
    console.log('Attempting to update quick response:', req.params.id);
    console.log('For tenant:', req.tenantId);
    console.log('With data:', { shortcut, message });
    
    // Find the quick response and ensure it belongs to the current tenant
    let response = await QuickResponse.findOne({ 
      _id: req.params.id,
      tenant_id: req.tenantId
    });
    
    console.log('Found response to update:', response);
    
    if (!response) {
      return res.status(404).json({ message: 'Quick response not found' });
    }
    
    // Ensure shortcut starts with /
    let formattedShortcut = shortcut;
    if (formattedShortcut && !formattedShortcut.startsWith('/')) {
      formattedShortcut = `/${formattedShortcut}`;
    }
    
    // Check if another quick response with the updated shortcut already exists
    if (formattedShortcut && formattedShortcut !== response.shortcut) {
      const existingResponse = await QuickResponse.findOne({ 
        tenant_id: req.tenantId,
        shortcut: formattedShortcut,
        _id: { $ne: req.params.id }
      });
      
      if (existingResponse) {
        return res.status(400).json({ message: 'A quick response with this shortcut already exists' });
      }
    }
    
    // Build update object
    const updateData = {};
    if (formattedShortcut) updateData.shortcut = formattedShortcut;
    if (message !== undefined) updateData.message = message;
    updateData.updatedAt = Date.now();
    
    console.log('Update data:', updateData);
    
    // Update the quick response with explicit conditions
    const updateResult = await QuickResponse.findOneAndUpdate(
      { _id: req.params.id, tenant_id: req.tenantId },
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    console.log('Update result:', updateResult);
    
    if (!updateResult) {
      return res.status(404).json({ message: 'Update failed - quick response not found' });
    }
    
    res.json(updateResult);
  } catch (error) {
    console.error('Error updating quick response:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/quick-responses/:id
 * @desc    Delete a quick response within tenant
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    // Add debug logs
    console.log('Attempting to delete quick response:', req.params.id);
    console.log('For tenant:', req.tenantId);
    
    // Find the quick response and ensure it belongs to the current tenant
    const response = await QuickResponse.findOne({ 
      _id: req.params.id,
      tenant_id: req.tenantId
    });
    
    // Log to see if the item was found
    console.log('Found response to delete:', response);
    
    if (!response) {
      return res.status(404).json({ message: 'Quick response not found' });
    }
    
    // Use deleteOne instead of findByIdAndDelete for more explicit condition
    const deleteResult = await QuickResponse.deleteOne({
      _id: req.params.id,
      tenant_id: req.tenantId
    });
    
    console.log('Delete result:', deleteResult);
    
    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({ message: 'Failed to delete quick response' });
    }
    
    res.json({ message: 'Quick response deleted successfully' });
  } catch (error) {
    console.error('Error deleting quick response:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
module.exports = router;