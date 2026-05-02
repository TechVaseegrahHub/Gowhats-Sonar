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
  return String(phone).replace(/[\s\-\(\)\+]/g, '').replace(/\D/g, '');
};

// ✅ FIX 6: Escape special regex characters to prevent ReDoS attacks.
// Without this, a search like "(a+)+" causes catastrophic backtracking in MongoDB.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* -------------------- PAGINATED CONTACT LIST -------------------- */
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

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50)); // ✅ cap at 200
    const skip = (pageNum - 1) * limitNum;

    const cacheKey = `contacts:${tenantId}:p${pageNum}:l${limitNum}:s${search}:t${tags}:tab${tab}`;
    try {
      const cached = await redisService.getCachedJSON(cacheKey);
      if (cached) return res.json(cached);
    } catch (cacheError) {
      console.error('Redis cache read error:', cacheError.message);
    }

    const filter = { tenantId };

    if (tab === 'team') {
      filter.humanAgentRequested = true;
    } else if (tab === 'unread') {
      filter.unreadCount = { $gt: 0 };
    }

    if (tags) {
      const tagIds = tags.split(',').filter(Boolean);
      if (tagIds.length > 0) filter.tags = { $in: tagIds };
    }

    if (search) {
      // ✅ FIX 6: Escape search string before using in $regex
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { profile_name: { $regex: safeSearch, $options: 'i' } },
        { name: { $regex: safeSearch, $options: 'i' } },
        { phone_number: { $regex: safeSearch, $options: 'i' } },
        { lastMessage: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    const [contacts, total] = await Promise.all([
      Contact.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limitNum).lean(),
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

/* -------------------- CREATE CONTACT -------------------- */
router.post('/', auth, async (req, res) => {
  try {
    let { phone_number, name } = req.body;
    const tenantId = req.user.tenant_id;

    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    phone_number = String(phone_number).trim().replace(/[\s\-\(\)\+]/g, '').replace(/\D/g, '');

    if (phone_number.length < 7 || phone_number.length > 15) {
      return res.status(400).json({
        error: 'Invalid phone number. Please include country code (e.g. 919876543210 for India)'
      });
    }

    const existingContact = await Contact.findOne({ tenantId, phone_number });
    if (existingContact) {
      return res.status(400).json({ error: 'Contact with this phone number already exists' });
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

/* -------------------- GET UNREAD COUNTS -------------------- */
// ✅ ORDER: /counts must be registered before /:id routes to avoid
//    Express treating the string "counts" as a contact ID parameter.
router.get('/counts', auth, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const cacheKey = `contacts:counts:${tenantId}`;

    // ✅ FIX 3: Wrapped in try/catch — Redis failure now falls through to DB
    try {
      const cached = await redisService.getCachedJSON(cacheKey);
      if (cached) return res.json(cached);
    } catch (cacheError) {
      console.error('Redis cache read error (counts):', cacheError.message);
    }

    const [totalCount, unreadCount, teamCount] = await Promise.all([
      Contact.countDocuments({ tenantId }),
      Contact.countDocuments({ tenantId, unreadCount: { $gt: 0 } }),
      Contact.countDocuments({ tenantId, humanAgentRequested: true })
    ]);

    const counts = { total: totalCount, unread: unreadCount, team: teamCount };

    try {
      await redisService.cacheJSON(cacheKey, counts, 10);
    } catch (cacheError) {
      console.error('Redis cache write error (counts):', cacheError.message);
    }

    res.json(counts);
  } catch (err) {
    console.error('❌ Error fetching counts:', err);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

/* -------------------- GET BY PHONE -------------------- */
// ✅ ORDER: specific named paths must come before /:id wildcard
router.get('/phone/:phone', auth, async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone);
    const contact = await Contact.findOne({
      tenantId: req.user.tenant_id,
      phone_number: phone
    });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    // ✅ FIX 4: Added missing try/catch
    console.error('❌ Error fetching contact by phone:', err);
    res.status(500).json({ error: 'Failed to fetch contact' });
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

    await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);
    await redisService.deletePattern(`contacts:counts:${req.user.tenant_id}`);

    if (global.io) {
      global.io.to(req.user.tenant_id.toString()).emit('contact_updated', {
        contact,
        action: 'mark_read',
        timestamp: new Date()
      });
    }

    res.json(contact);
  } catch (err) {
    console.error('❌ Error marking contact read:', err);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

/* -------------------- MARK UNREAD -------------------- */
router.put('/:id/mark-unread', auth, async (req, res) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenant_id },
      { $set: { unreadCount: 1 } },
      { new: true }
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);

    if (global.io) {
      global.io.to(req.user.tenant_id.toString()).emit('contact_updated', {
        contact,
        action: 'mark_unread',
        timestamp: new Date()
      });
    }

    res.json(contact);
  } catch (err) {
    console.error('❌ Error marking contact unread:', err);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

/* -------------------- RESOLVE HUMAN AGENT -------------------- */
router.put('/:id/resolve-human-agent', auth, async (req, res) => {
  try {
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

    await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);

    if (global.io) {
      global.io.to(req.user.tenant_id.toString()).emit('contact_updated', {
        contact,
        action: 'resolve_human_agent',
        timestamp: new Date()
      });
    }

    res.json(contact);
  } catch (err) {
    // ✅ FIX 4: Added missing try/catch
    console.error('❌ Error resolving human agent:', err);
    res.status(500).json({ error: 'Failed to resolve human agent' });
  }
});

/* -------------------- UPDATE CONTACT -------------------- */
// ✅ FIX 1: Merged both duplicate PUT /:id handlers into ONE.
//    The original had two separate handlers — Express silently used only the first,
//    making alias and notes permanently impossible to update.
router.put('/:id', auth, async (req, res) => {
  try {
    // ✅ FIX 7: Only include phone_number in update if it was actually provided,
    //    preventing normalizePhone(undefined) → undefined from unsetting the field.
    const updateData = {
      name: req.body.name,
      timestamp: new Date()
    };

    if (req.body.phone_number !== undefined) {
      updateData.phone_number = normalizePhone(req.body.phone_number);
    }

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

    await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);

    res.json(contact);
  } catch (err) {
    // ✅ FIX 4: Added missing try/catch
    console.error('❌ Error updating contact:', err);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

/* -------------------- DELETE CONTACT -------------------- */
router.delete('/:id', auth, async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.user.tenant_id
    });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);

    res.json({ message: 'Contact deleted' });
  } catch (err) {
    // ✅ FIX 4: Added missing try/catch
    console.error('❌ Error deleting contact:', err);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

/* -------------------- TAGS -------------------- */
router.get('/:contactId/tags', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.contactId)) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    const contact = await Contact.findOne({
      _id: req.params.contactId,
      tenantId: req.user.tenant_id
    }).populate({ path: 'tags', match: { isActive: true } });

    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact.tags || []);
  } catch (err) {
    // ✅ FIX 4: Added missing try/catch
    console.error('❌ Error fetching contact tags:', err);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

router.put('/:contactId/tags', auth, async (req, res) => {
  try {
    const rawTags = req.body.tags || [];

    // ✅ FIX 5: Added array size limit to prevent DoS via huge tag arrays
    if (rawTags.length > 50) {
      return res.status(400).json({ error: 'Too many tags. Maximum 50 allowed.' });
    }

    // ✅ FIX 5: Single DB query instead of N sequential queries in a loop
    const validIds = rawTags.filter(id => mongoose.Types.ObjectId.isValid(id));
    const foundTags = await Tag.find({
      _id: { $in: validIds },
      tenantId: req.user.tenant_id,
      isActive: true
    }).select('_id');
    const validTags = foundTags.map(t => t._id);

    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.contactId, tenantId: req.user.tenant_id },
      { $set: { tags: validTags, lastInteractionAt: new Date() } },
      { new: true }
    ).populate('tags');

    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    await redisService.deletePattern(`contacts:${req.user.tenant_id}:*`);

    res.json({ success: true, data: contact });
  } catch (err) {
    // ✅ FIX 4: Added missing try/catch
    console.error('❌ Error updating contact tags:', err);
    res.status(500).json({ error: 'Failed to update tags' });
  }
});

module.exports = router;
