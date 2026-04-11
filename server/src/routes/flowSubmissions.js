// routes/flowSubmissions.js - View speaker questions submitted via WhatsApp Flow
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// Get or create FlowSubmission model
function getFlowSubmissionModel() {
  try {
    return mongoose.model('FlowSubmission');
  } catch (e) {
    const schema = new mongoose.Schema({
      tenantId: { type: String, required: true, index: true },
      flowToken: String,
      screen: String,
      speaker: String,
      question: String,
      submittedAt: { type: Date, default: Date.now }
    });
    return mongoose.model('FlowSubmission', schema);
  }
}

// GET /api/flow-submissions - Get all questions for this tenant
router.get('/', auth, async (req, res) => {
  try {
    const FlowSubmission = getFlowSubmissionModel();
    const { speaker, page = 1, limit = 50 } = req.query;
    const tenantId = req.user.tenant_id;

    const query = { tenantId };
    if (speaker && speaker !== 'all') query.speaker = speaker;

    const total = await FlowSubmission.countDocuments(query);
    const submissions = await FlowSubmission.find(query)
      .sort({ submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // Group by speaker for summary
    const summary = await FlowSubmission.aggregate([
      { $match: { tenantId } },
      { $group: { _id: '$speaker', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({ success: true, submissions, total, summary });
  } catch (e) {
    console.error('Flow submissions fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/flow-submissions/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const FlowSubmission = getFlowSubmissionModel();
    await FlowSubmission.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenant_id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
