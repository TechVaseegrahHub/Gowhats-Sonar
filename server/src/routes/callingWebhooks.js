const CallingSession = require('../models/CallingSession');

async function handleCallsWebhook(value, tenant) {
  const tenantId = tenant._id.toString();

  // 1. Handle Call Lifecycle Events (Connect / Terminate)
  if (value?.calls) {
    for (const call of value.calls) {
      console.log(`📞 Call Event: ${call.event} | Direction: ${call.direction} | ID: ${call.id}`);

      // --- INBOUND CALL: Customer is calling the Business ---
      if (call.event === 'connect' && call.direction === 'USER_INITIATED') {
        console.log(`✨ INCOMING CALL detected from customer: ${call.from}`);
        
        if (global.io) {
          // Notify the frontend that a call is ringing
          global.io.to(tenantId).emit('incoming_call', {
            callId: call.id,
            customerPhone: call.from,
            sdpOffer: call.session?.sdp, // Customer's WebRTC offer needed to answer
            tenantId: tenantId
          });
        }
        
        // Log session to DB as an inbound request
        await CallingSession.create({
          tenantId: tenant._id,
          callId: call.id,
          customerPhone: call.from,
          direction: 'USER_INITIATED',
          status: 'ringing',
          sdpOffer: call.session?.sdp,
          startedAt: new Date()
        });
        continue; // Move to next call in loop
      }

      // --- OUTBOUND CALL: Customer answered the call we started ---
      if (call.event === 'connect' && call.direction === 'BUSINESS_INITIATED') {
        await CallingSession.findOneAndUpdate(
          { callId: call.id },
          { sdpAnswer: call.session?.sdp, status: 'accepted' }
        );
        
        if (global.io) {
          global.io.to(tenantId).emit('call_sdp_answer', {
            callId: call.id,
            sdpAnswer: call.session?.sdp,
            customerPhone: call.to
          });
        }
        continue;
      }

      // --- TERMINATE: Call ended by either party ---
      if (call.event === 'terminate') {
        const finalStatus = call.status?.includes('COMPLETED') ? 'completed' : 'failed';
        
        await CallingSession.findOneAndUpdate(
          { callId: call.id },
          {
            status: finalStatus,
            endedAt: new Date(),
            duration: call.duration || 0
          }
        );

        if (global.io) {
          global.io.to(tenantId).emit('call_ended', {
            callId: call.id,
            status: call.status,
            duration: call.duration,
            customerPhone: call.to || call.from
          });
        }
      }
    }
  }

  // 2. Handle Call Status Updates (RINGING, ACCEPTED, REJECTED)
  if (value?.statuses) {
    for (const s of value.statuses) {
      if (s.type !== 'call') continue;
      console.log(`📞 Status Update: ${s.status} | ID: ${s.id}`);

      const statusMap = {
        RINGING: 'ringing', 
        ACCEPTED: 'accepted', 
        REJECTED: 'rejected'
      };

      await CallingSession.findOneAndUpdate(
        { callId: s.id },
        { status: statusMap[s.status] || s.status.toLowerCase() }
      );

      if (global.io) {
        global.io.to(tenantId).emit('call_status_update', {
          callId: s.id,
          status: s.status,
          customerPhone: s.recipient_id
        });
      }
    }
  }
}

module.exports = { handleCallsWebhook };
