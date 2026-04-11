const redisService = require('../services/redisService');
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Contact = require('../models/Contact');
const Tag = require('../models/Tag');
const auth = require('../middleware/auth');

/* -------------------- HELPERS -------------------- */
const normalizePhone = (phone) => {
  if (!phone) return phone;
  // Remove +, spaces, dashes, parens — keep all digits including country code
  return String(phone).replace(/[\s\-\(\)\+]/g, '').replace(/\D/g, '');
};

/* -------------------- ✅ NEW: PAGINATED CONTACT LIST -------------------- */
router.get('/', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const {
      page = 1,
      limit = 50,
      search = '',
      tags = '',
      tab = 'all'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // ✅ Try Redis cache
    const cacheKey = `contacts:${tenantId}:p${pageNum}:l${limitNum}:s${search}:t${tags}:tab${tab}`;
    try {
      const cached = await redisService.getCachedJSON(cacheKey);
      if (cached) {
        return res.json(cached);
      }
    } catch (cacheError) {
      console.error('Redis cache read error:', cacheError.message);
    }

    // ✅ Build filter
    const filter = { tenantId };

    if (tab === 'team') {
      filter.humanAgentRequested = true;
    } else if (tab === 'unread') {
      filter.unreadCount = { $gt: 0 };
    }

    if (tags) {
      const tagIds = tags.split(',').filter(Boolean);
      if (tagIds.length > 0) {
        filter.tags = { $in: tagIds };
      }
    }

    if (search) {
      filter.$or = [
        { profile_name: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { phone_number: { $regex: search, $options: 'i' } },
        { lastMessage: { $regex: search, $options: 'i' } }
      ];
    }

    // ✅ Run in parallel
    const [contacts, total] = await Promise.all([
      Contact.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Contact.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limitNum);

    const response = {
      contacts,
      pagination: {
        total,
        totalPages,
        currentPage: pageNum,
        hasMore: pageNum < totalPages,
        limit: limitNum
      }
    };

    // ✅ Cache for 15 seconds
    try {
      await redisService.cacheJSON(cacheKey, response, 15);
    } catch (cacheError) {
      console.error('Redis cache write error:', cacheError.message);
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts', details: error.message });
  }
});


router.post('/', auth, async (req, res) => {
  try {
    let { phone_number, name } = req.body;
    const tenantId = req.user.tenant_id;

    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Clean: remove +, spaces, dashes, parens
    phone_number = String(phone_number).trim().replace(/[\s\-\(\)\+]/g, '').replace(/\D/g, '');

    // Validate E.164 length (7–15 digits, must include country code)
    if (phone_number.length < 7 || phone_number.length > 15) {
      return res.status(400).json({
        error: "Invalid phone number. Please include country code (e.g. 919876543210 for India, 6591234567 for Singapore, 971501234567 for UAE)"
      });
    }

    // Check duplicate
    let existingContact = await Contact.findOne({ tenantId, phone_number });
    if (existingContact) {
      return res.status(400).json({ error: "Contact with this phone number already exists" });
    }

    const newContact = new Contact({
      tenantId,
      phone_number,
      name: name || phone_number,
      source: 'manual',
      timestamp: new Date(),
      unreadCount: 0,
      status: 'active'
    });

    await newContact.save();

    await redisService.deletePattern(`contacts:${tenantId}:*`);
    await redisService.deletePattern(`contacts:counts:${tenantId}`);

    if (global.io) {
      global.io.to(tenantId.toString()).emit('new_contact', {
        contact: newContact,
        tenantId,
        timestamp: new Date()
      });
    }

    res.status(201).json(newContact);
  } catch (err) {
    console.error('❌ Error adding contact:', err);
    res.status(500).json({ error: 'Failed to add contact' });
  }
});


/* -------------------- ✅ NEW: GET UNREAD COUNTS (FAST) -------------------- */
router.get('/counts', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    // ✅ Try cache first
    const cacheKey = `contacts:counts:${tenantId}`;
    const cached = await redisService.getCachedJSON(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const [totalCount, unreadCount, teamCount] = await Promise.all([
      Contact.countDocuments({ tenantId }),
      Contact.countDocuments({ tenantId, unreadCount: { $gt: 0 } }),
      Contact.countDocuments({ tenantId, humanAgentRequested: true })
    ]);

    const counts = {
      total: totalCount,
      unread: unreadCount,
      team: teamCount
    };

    // ✅ Cache for 10 seconds
    await redisService.cacheJSON(cacheKey, counts, 10);

    res.json(counts);
  } catch (err) {
    console.error('❌ Error fetching counts:', err);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

/* -------------------- MARK READ -------------------- */
router.put('/:id/read', auth, async (req, res) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenant_id },
      { $set: { unreadCount: 0 } },
      { new: true }
    );

    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    // ✅ Invalidate cache
    await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);
    await redisService.deletePattern(`contacts:counts:${req.user.tenant_id}`);

    // ✅ BROADCAST TO ALL AGENTS
    if (global.io) {
      global.io.to(req.user.tenant_id.toString()).emit('contact_updated', {
        contact: contact,
        action: 'mark_read',
        timestamp: new Date()
      });
    }

    res.json(contact);
  } catch {
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

/* -------------------- SEARCH (MUST BE ABOVE :id) -------------------- */
router.put('/:id', auth, async (req, res) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenant_id },
    {
      $set: {
        name: req.body.name,
        phone_number: normalizePhone(req.body.phone_number),
        timestamp: new Date()
      }
    },
    { new: true }
  );

  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  // ✅ Invalidate cache
  await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);

  res.json(contact);
});

/* -------------------- GET BY PHONE -------------------- */
router.get('/phone/:phone', auth, async (req, res) => {
  const phone = normalizePhone(req.params.phone);

  const contact = await Contact.findOne({
    tenantId: req.user.tenant_id,
    phone_number: phone
  });

  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json(contact);
});

/* -------------------- UPDATE CONTACT -------------------- */
router.put('/:id', auth, async (req, res) => {
  const updateData = {
    name: req.body.name,
    phone_number: normalizePhone(req.body.phone_number),
    timestamp: new Date()
  };

  if (req.body.alias !== undefined) {
    updateData.alias = req.body.alias;
  }

  if (req.body.notes !== undefined) {
    updateData.notes = req.body.notes;
  }

  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenant_id },
    { $set: updateData },
    { new: true }
  );

  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  // ✅ Invalidate cache
  await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);

  res.json(contact);
});


/* -------------------- DELETE CONTACT -------------------- */
router.delete('/:id', auth, async (req, res) => {
  const contact = await Contact.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenant_id
  });

  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  
  // ✅ Invalidate cache
  await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);
  
  res.json({ message: 'Contact deleted' });
});

/* -------------------- TAGS -------------------- */
router.get('/:contactId/tags', auth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.contactId)) {
    return res.status(400).json({ error: 'Invalid contact ID' });
  }

  const contact = await Contact.findOne({
    _id: req.params.contactId,
    tenantId: req.user.tenant_id
  }).populate({
    path: 'tags',
    match: { isActive: true }
  });

  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json(contact.tags || []);
});

router.put('/:contactId/tags', auth, async (req, res) => {
  const validTags = [];

  for (const id of req.body.tags || []) {
    if (mongoose.Types.ObjectId.isValid(id)) {
      const tag = await Tag.findOne({
        _id: id,
        tenantId: req.user.tenant_id,
        isActive: true
      });
      if (tag) validTags.push(id);
    }
  }

  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.contactId, tenantId: req.user.tenant_id },
    { $set: { tags: validTags, lastInteractionAt: new Date() } },
    { new: true }
  ).populate('tags');

  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

  // ✅ Invalidate cache
  await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);

  res.json({ success: true, data: contact });
});

/* -------------------- HUMAN AGENT RESOLVE -------------------- */
router.put('/:id/resolve-human-agent', auth, async (req, res) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenant_id },
    {
      $set: {
        humanAgentRequested: false,
        humanAgentStatus: 'resolved',
        resolvedAt: new Date()
      }
    },
    { new: true }
  );

  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  // ✅ Invalidate cache
  await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);

  // ✅ BROADCAST TO ALL AGENTS
  if (global.io) {
    global.io.to(req.user.tenant_id.toString()).emit('contact_updated', {
      contact: contact,
      action: 'resolve_human_agent',
      timestamp: new Date()
    });
  }

  res.json(contact);
});

/* -------------------- MARK UNREAD -------------------- */
router.put('/:id/mark-unread', auth, async (req, res) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenant_id },
    { $set: { unreadCount: 1 } },
    { new: true }
  );

  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  // ✅ Invalidate cache
  await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);

  // ✅ BROADCAST TO ALL AGENTS
  if (global.io) {
    global.io.to(req.user.tenant_id.toString()).emit('contact_updated', {
      contact: contact,
      action: 'mark_unread',
      timestamp: new Date()
    });
  }

  res.json(contact);
});

module.exports = router;
