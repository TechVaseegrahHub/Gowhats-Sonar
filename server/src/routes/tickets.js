const express = require('express');
const router = express.Router();
const EventTicket = require('../models/EventTicket');
const RegistrationConfig = require('../models/RegistrationConfig');
const auth = require('../middleware/auth');
const checkTenant = require('../middleware/tenantMiddleware');

// ─── VALIDATE TICKET ──────────────────────────────────────────────────────────
router.post('/validate', [auth, checkTenant], async (req, res) => {
  try {
    const { qrData } = req.body;
    const tenantId = req.user.tenant_id;

    if (!qrData) return res.status(400).json({ success: false, message: 'QR data is required' });

    let parsed;
    try {
      parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid QR Code Format' });
    }

    const qrParticipantCount = parsed.cnt || 1;
    const orderId = parsed.oid;
    const mainTicketId = parsed.tid;

    if (!orderId || !mainTicketId) {
      return res.status(400).json({ success: false, message: 'Invalid Ticket Data' });
    }
    if (parsed.t_id !== tenantId) {
      return res.status(403).json({ success: false, message: 'Ticket belongs to different organization' });
    }

    const ticket = await EventTicket.findOne({ ticketId: mainTicketId, tenantId });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket Not Found' });

    let totalParticipants = 1;
    if (ticket.orderId) {
      totalParticipants = await EventTicket.countDocuments({
        orderId: ticket.orderId, tenantId, status: { $ne: 'cancelled' }
      });
    }
    if (qrParticipantCount > totalParticipants) totalParticipants = qrParticipantCount;

    if (ticket.status === 'used') {
      let timeDisplay = 'Previously';
      if (ticket.checkInTime) {
        timeDisplay = new Date(ticket.checkInTime).toLocaleTimeString('en-US', {
          hour: 'numeric', minute: 'numeric', hour12: true, timeZone: 'Asia/Kolkata'
        });
      }
      return res.status(400).json({
        success: false,
        message: totalParticipants > 1
          ? `Already Used at ${timeDisplay} (${totalParticipants} Participants)`
          : `Already Used at ${timeDisplay}`,
        ticket: {
          id: ticket.ticketId, orderId: ticket.orderId,
          name: ticket.customerName, phone: ticket.customerPhone,
          status: ticket.status, participantCount: totalParticipants,
          checkInTime: ticket.checkInTime, isMultiParticipant: totalParticipants > 1
        }
      });
    }

    if (ticket.orderId && totalParticipants > 1) {
      await EventTicket.updateMany(
        { orderId: ticket.orderId, tenantId, status: { $ne: 'cancelled' } },
        { $set: { status: 'used', checkInTime: new Date(), checkedInBy: req.user.id || req.user._id } }
      );
    } else {
      ticket.status = 'used';
      ticket.checkInTime = new Date();
      ticket.checkedInBy = req.user.id || req.user._id;
      await ticket.save();
    }

    return res.json({
      success: true,
      message: totalParticipants > 1
        ? `✅ Valid Ticket - ${totalParticipants} Participants Admitted`
        : '✅ Valid Ticket - Access Granted',
      ticket: {
        id: ticket.ticketId, orderId: ticket.orderId,
        name: ticket.customerName, phone: ticket.customerPhone,
        participantCount: totalParticipants,
        checkInTime: ticket.checkInTime || new Date(),
        isMultiParticipant: totalParticipants > 1,
        admitMessage: totalParticipants > 1
          ? `Please admit ${totalParticipants} persons`
          : 'Please admit 1 person'
      }
    });

  } catch (error) {
    console.error('❌ Ticket validation error:', error);
    return res.status(500).json({ success: false, message: 'Validation failed', error: error.message });
  }
});

// ─── GET ALL TICKETS ──────────────────────────────────────────────────────────
router.get('/', [auth, checkTenant], async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || '';
    const paymentFilter = req.query.paymentFilter || 'all';

    let matchStage = { tenantId };

    if (search) {
      matchStage.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { ticketId: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        {
          $expr: {
            $gt: [{
              $size: {
                $filter: {
                  input: { $objectToArray: { $ifNull: ['$flowData', {}] } },
                  as: 'kv',
                  cond: { $regexMatch: { input: { $toString: '$$kv.v' }, regex: search, options: 'i' } }
                }
              }
            }, 0]
          }
        }
      ];
    }

    const basePipeline = [
      { $match: matchStage },

      // Participant count
      {
        $lookup: {
          from: 'eventtickets',
          let: { orderId: '$orderId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$orderId', '$$orderId'] },
                    { $ne: ['$status', 'cancelled'] }
                  ]
                }
              }
            },
            { $count: 'count' }
          ],
          as: 'orderCount'
        }
      },

      // ✅ Order lookup with tenantId safety
      {
        $lookup: {
          from: 'orders',
          let: { orderId: '$orderId', tenantId: '$tenantId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$orderId', '$$orderId'] },
                    { $eq: ['$tenantId', '$$tenantId'] }
                  ]
                }
              }
            }
          ],
          as: 'orderData'
        }
      },

      {
        $addFields: {
          totalParticipants: { $ifNull: [{ $arrayElemAt: ['$orderCount.count', 0] }, 1] },
          order: { $arrayElemAt: ['$orderData', 0] },
          // ✅ effectivePaymentStatus: manualPaymentStatus takes priority
          effectivePaymentStatus: {
            $cond: {
              if: { $and: [{ $ne: ['$manualPaymentStatus', null] }, { $ne: ['$manualPaymentStatus', ''] }] },
              then: '$manualPaymentStatus',
              else: {
                $cond: {
                  if: { $eq: [{ $arrayElemAt: ['$orderData.paymentStatus', 0] }, 'completed'] },
                  then: 'paid',
                  else: 'unpaid'
                }
              }
            }
          }
        }
      },

      // ✅ Payment filter uses effectivePaymentStatus
      ...(paymentFilter === 'paid'
        ? [{ $match: { effectivePaymentStatus: 'paid' } }]
        : paymentFilter === 'pending'
          ? [{ $match: { effectivePaymentStatus: 'unpaid' } }]
          : []
      ),

      { $sort: { createdAt: -1 } }
    ];

    const [tickets, totalArr] = await Promise.all([
      EventTicket.aggregate([...basePipeline, { $skip: skip }, { $limit: limit }]),
      EventTicket.aggregate([...basePipeline, { $count: 'total' }])
    ]);

    const total = totalArr[0]?.total || 0;
    const config = await RegistrationConfig.findOne({ tenantId });

    return res.json({
      success: true,
      tickets,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      mapping: config ? config.fieldMapping : null
    });

  } catch (error) {
    console.error('Error fetching tickets:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

// ─── PATCH PAYMENT STATUS (manual override saved on ticket) ──────────────────
router.patch('/:id/payment-status', [auth, checkTenant], async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const tenantId = req.user.tenant_id;

    if (!['paid', 'unpaid'].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Use paid or unpaid' });
    }

    // ✅ Save directly on EventTicket — survives refresh, no Order dependency
    const ticket = await EventTicket.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { manualPaymentStatus: paymentStatus } },
      { new: true }
    );

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    console.log(`✅ Manual payment status: ${ticket.ticketId} → ${paymentStatus}`);

    return res.json({
      success: true,
      message: paymentStatus === 'paid' ? 'Marked as Paid ✓' : 'Marked as Unpaid',
      data: { _id: ticket._id, manualPaymentStatus: ticket.manualPaymentStatus }
    });

  } catch (error) {
    console.error('❌ Payment status error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PATCH AMOUNT ─────────────────────────────────────────────────────────────
router.patch('/:id/amount', [auth, checkTenant], async (req, res) => {
  try {
    const { amount } = req.body;
    const tenantId = req.user.tenant_id;

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const ticket = await EventTicket.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { amount: parsed } },
      { new: true }
    );

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    return res.json({ success: true, message: 'Amount saved', data: { _id: ticket._id, amount: ticket.amount } });

  } catch (error) {
    console.error('[PATCH ticket amount]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE TICKET ────────────────────────────────────────────────────────────
router.delete('/:id', [auth, checkTenant], async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;

    const ticket = await EventTicket.findOneAndDelete({ _id: id, tenantId });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    return res.json({ success: true, message: `Ticket ${ticket.ticketId} deleted successfully` });

  } catch (error) {
    console.error('❌ Delete ticket error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete ticket', error: error.message });
  }
});

module.exports = router;
