import { useState, useEffect, useRef } from 'react';
import api from '../utils/axios';
import { toast } from 'react-hot-toast';
import { Phone, PhoneOff, Mic, MicOff, User } from 'lucide-react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export default function CallingPanel({ contact, permissionStatus, activeCall, setActiveCall, socketRef, hideIncoming = false }) {

  const [callState, setCallState] = useState('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const durationTimerRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  // ─── Sync state from global activeCall ─────────────────────
  useEffect(() => {
    if (!activeCall) {
      cleanup();
      setCallState('idle');
      setCallDuration(0);
      return;
    }

    setCallState(activeCall.state || 'idle');

    if (activeCall.state === 'active' && !durationTimerRef.current) {
      durationTimerRef.current = setInterval(
        () => setCallDuration(prev => prev + 1),
        1000
      );
    }

    // When backend signals the SDP answer (outbound call accepted by customer)
    if (activeCall.state === 'active' && activeCall.sdpAnswer && peerRef.current) {
      const pc = peerRef.current;
      if (pc.signalingState === 'have-local-offer') {
        pc.setRemoteDescription({ type: 'answer', sdp: activeCall.sdpAnswer })
          .then(() => {
            // Drain any ICE candidates that arrived before remote description
            pendingCandidatesRef.current.forEach(c => pc.addIceCandidate(c).catch(() => {}));
            pendingCandidatesRef.current = [];
          })
          .catch(err => console.error('setRemoteDescription (answer) failed:', err));
      }
    }
  }, [activeCall]);

  // ─── Expose SDP answer handler for socket event ────────────
  // socket emits 'call_sdp_answer' → ChatContainer stores it in activeCall
  // The useEffect above handles it from there.

  const cleanup = () => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    durationTimerRef.current = null;

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    peerRef.current?.close();

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
    }

    peerRef.current = null;
    localStreamRef.current = null;
    remoteAudioRef.current = null;
    pendingCandidatesRef.current = [];
    setIsMuted(false);
  };

  // ─── Helper: create a PeerConnection and wire up common handlers ───
  const createPC = (onIceCandidate) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.ontrack = (event) => {
      if (!remoteAudioRef.current) {
        const audio = new Audio();
        audio.autoplay = true;
        remoteAudioRef.current = audio;
        document.body.appendChild(audio);
      }
      remoteAudioRef.current.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('WebRTC connection state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        toast.error('Call connection lost');
        endCall();
      }
    };

    return pc;
  };

  // ─── ANSWER INBOUND CALL ────────────────────────────────────
  const answerCall = async () => {
    if (!activeCall?.sdpOffer) {
      toast.error('No SDP offer available — check your backend stores sdpOffer on session create');
      return;
    }

    setCallState('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const pc = createPC(async (candidate) => {
        try {
          await api.post('/api/calling/ice-candidate', {
            callId: activeCall.callId,
            candidate,
            direction: 'answer',
          });
        } catch (err) {
          console.warn('ICE candidate send failed:', err.message);
        }
      });

      peerRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription({ type: 'offer', sdp: activeCall.sdpOffer });

      // If Meta sent ICE candidates before we set remote description, add them now
      pendingCandidatesRef.current.forEach(c => pc.addIceCandidate(c).catch(() => {}));
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await api.post('/api/calling/accept', {
        callId: activeCall.callId,
        sdpAnswer: answer.sdp,
      });

      setActiveCall(prev => ({ ...prev, state: 'active' }));
    } catch (err) {
      console.error('answerCall error:', err);
      toast.error('Failed to answer call: ' + err.message);
      endCall();
    }
  };

  // ─── START OUTBOUND CALL ────────────────────────────────────
  const startCall = async () => {
   console.log('🔵 startCall triggered', { contact, permissionStatus }); 
     if (!contact?.phone_number) {
    console.log('❌ No phone number');
    return;
  }

    if (permissionStatus !== 'temporary' && permissionStatus !== 'permanent') {
      // No permission yet — send the request message first
      try {
        await api.post('/api/calling/request-permission', {
          to: contact.phone_number,
          bodyText: 'We would like to call you via WhatsApp to assist you better. Please allow us to call.',
        });
        toast.success('Call permission request sent');
      } catch (err) {
        toast.error('Failed to send permission request');
      }
      return;
    }

    setCallState('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const pc = createPC(async (candidate) => {
        try {
          await api.post('/api/calling/ice-candidate', {
            callId: activeCall?.callId,
            candidate,
            direction: 'offer',
          });
        } catch (err) {
          console.warn('ICE candidate send failed:', err.message);
        }
      });

      peerRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Expose a resolver so the socket event can deliver the SDP answer
      window.__pendingSDPAnswer = async (sdpAnswer) => {
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
          pendingCandidatesRef.current.forEach(c => pc.addIceCandidate(c).catch(() => {}));
          pendingCandidatesRef.current = [];
          window.__pendingSDPAnswer = null;
        } catch (err) {
          console.error('setRemoteDescription (sdp answer) failed:', err);
        }
      };

      const response = await api.post('/api/calling/initiate', {
        to: contact.phone_number,
        sdpOffer: offer.sdp,
      });

      setActiveCall({
        callId: response.data.callId,
        customerPhone: contact.phone_number,
        state: 'ringing',
      });

    } catch (err) {
      console.error('startCall error:', err);
      toast.error('Failed to start call: ' + err.message);
      cleanup();
      setCallState('idle');
    }
  };

// CallingPanel.jsx — update endCall:
const endCall = async () => {
  try {
    if (activeCall?.callId) {
      await api.post('/api/calling/terminate', { callId: activeCall.callId });
    }
  } catch (err) {
    console.warn('terminate API error:', err.message);
  }

  // ✅ Also clean up global WebRTC resources (from answerGlobalCall)
  if (window.__globalCallPC) {
    window.__globalCallPC.close();
    window.__globalCallPC = null;
  }
  if (window.__globalCallStream) {
    window.__globalCallStream.getTracks().forEach(t => t.stop());
    window.__globalCallStream = null;
  }
  const audio = document.getElementById('__global_call_audio');
  if (audio) audio.remove();

  setActiveCall(null);
  cleanup();
};


  // ─── MUTE TOGGLE ────────────────────────────────────────────
  // CallingPanel.jsx — update toggleMute:
const toggleMute = () => {
  // Use local stream OR global stream
  const stream = localStreamRef.current || window.__globalCallStream;
  if (stream) {
    const enabled = !isMuted;
    stream.getAudioTracks().forEach(t => { t.enabled = enabled; });
    setIsMuted(!enabled);
  }
};

  const formatDuration = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// BEFORE (around line 120-145):
if (callState === 'incoming') {
  return null; // GlobalIncomingCallPopup handles incoming calls
}

// ─── UI: Connecting / Ringing ───────────────────────────────
if (callState === 'connecting' || callState === 'ringing') {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500 text-white rounded-full shadow-md">
      <div className="w-2 h-2 bg-white rounded-full animate-ping" />
      <span className="text-sm font-medium">
        {callState === 'ringing' ? 'Ringing…' : 'Connecting…'}
      </span>
      <button
        onClick={endCall}
        className="p-1.5 bg-red-500 hover:bg-red-400 rounded-full transition-colors ml-1"
        title="Cancel"
      >
        <PhoneOff size={15} />
      </button>
    </div>
  );
}

// ─── UI: Active call ────────────────────────────────────────
if (callState === 'active') {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-full shadow-md">
      <div className="w-2 h-2 bg-white rounded-full animate-ping" />
      <span className="text-sm font-mono font-bold">{formatDuration(callDuration)}</span>
      <button
        onClick={toggleMute}
        className={`p-1.5 rounded-full transition-colors ${
          isMuted ? 'bg-yellow-500 hover:bg-yellow-400' : 'bg-white bg-opacity-20 hover:bg-opacity-30'
        }`}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
      </button>
      <button
        onClick={endCall}
        className="p-1.5 bg-red-500 hover:bg-red-400 rounded-full transition-colors"
        title="End call"
      >
        <PhoneOff size={15} />
      </button>
    </div>
  );
}


  // ─── UI: Idle ───────────────────────────────────────────────
  // Show the call button only when a contact is selected
  if (!contact?.phone_number) return null;

  const hasPermission = permissionStatus === 'temporary' || permissionStatus === 'permanent';

  return (
    <button
      onClick={startCall}
      className={`p-2 rounded-full transition-colors ${
        hasPermission
          ? 'hover:bg-green-100 text-green-600'
          : 'hover:bg-gray-100 text-gray-400'
      }`}
      title={hasPermission ? 'Start WhatsApp call' : 'Request call permission'}
    >
      <Phone size={20} />
    </button>
  );
}
