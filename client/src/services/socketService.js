// src/services/socketService.js
import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
  }

  initialize(token) {
    // ✅ Prevent multiple connections
    if (this.connecting) {
      console.log('[Socket] Already connecting, skipping...');
      return this.socket;
    }

    if (this.socket && this.socket.connected) {
      console.log('[Socket] Already connected');
      return this.socket;
    }

    try {
      this.connecting = true;

      if (this.socket) {
        console.log('[Socket] Cleaning up existing connection');
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }

      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      console.log('[Socket] Initializing WhatsApp socket connection...');

      const serverUrl = window.location.origin;
      console.log('[Socket] Connecting to:', serverUrl);

      this.socket = io(serverUrl, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling'],
        upgrade: true,
        timeout: 20000,
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: this.maxReconnectAttempts,
        forceNew: false,
        autoConnect: true,
        rememberUpgrade: false,
        rejectUnauthorized: false
      });

      this.setupEventListeners();
      return this.socket;

    } catch (error) {
      console.error('[Socket] Initialization error:', error);
      this.connecting = false;
      this.connected = false;
      throw error;
    }
  }

	setupEventListeners() {
	  if (!this.socket) return;

	  this.socket.on('connect', () => {
	    console.log('✅ [Socket] Connected successfully with ID:', this.socket.id);
	    
	    this.connected = true;
	    this.connecting = false;
	    this.reconnectAttempts = 0;

	    if (this.reconnectTimeout) {
	      clearTimeout(this.reconnectTimeout);
	      this.reconnectTimeout = null;
	    }

	    // ✅ CRITICAL: Rejoin rooms on reconnect
	    this.socket.emit('rejoin_rooms');
	  });

	  // ✅ NEW: Handle contact updates from OTHER users
	  this.socket.on('contact_updated', (data) => {
	    if (!data?.contact) return;

	    console.log('📝 Contact updated by another user:', data.contact.phone_number);

	    // ✅ Update local contact list
	    window.dispatchEvent(new CustomEvent('contact_updated', {
	      detail: data.contact
	    }));
	  });

	  // ✅ NEW: Handle message sent by OTHER users
	  this.socket.on('message_sent_by_others', (messageData) => {
	    console.log('📨 Message sent by another agent:', messageData);

	    // ✅ Trigger UI update
	    window.dispatchEvent(new CustomEvent('message_from_other_agent', {
	      detail: messageData
	    }));
	  });


    this.socket.on('connect_error', (error) => {
      console.error('❌ [Socket] Connection error:', error.message);
      this.connected = false;
      this.connecting = false;

      if (error.message?.includes('Authentication') ||
          error.message?.includes('token') ||
          error.message?.includes('Invalid token')) {
        console.log('[Socket] Auth error - token may be expired');
        this.socket?.disconnect();
        return;
      }

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`[Socket] Scheduling reconnection attempt ${this.reconnectAttempts + 1} in ${delay}ms`);
        
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectAttempts++;
          if (this.socket && !this.socket.connected) {
            this.socket.connect();
          }
        }, delay);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('⚠️ [Socket] Disconnected:', reason);
      this.connected = false;
      this.connecting = false;

      if (reason === 'io client disconnect' || reason === 'io server disconnect') {
        console.log('[Socket] Intentional disconnect - not reconnecting');
        return;
      }

      if (reason !== 'ping timeout' && reason !== 'transport close') {
        this.reconnectAttempts = 0;
      }
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 [Socket] Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
      this.connecting = true;
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('✅ [Socket] Reconnected successfully after', attemptNumber, 'attempts');
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;

      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      this.socket.emit('rejoin_rooms');
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ [Socket] Reconnection failed after max attempts');
      this.connected = false;
      this.connecting = false;
      this.reconnectAttempts = 0;

      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    });

    this.socket.on('rooms_rejoined', (data) => {
      console.log('🏠 [Socket] Rooms rejoined:', data);
    });

    this.socket.on('error', (error) => {
      console.error('❌ [Socket] Socket error:', error);
    });

    this.socket.on('ping', () => {
      console.log('🏓 [Socket] Ping received');
    });

    this.socket.on('pong', (latency) => {
      console.log('🏓 [Socket] Pong received, latency:', latency, 'ms');
    });
  }

  on(event, callback) {
    if (this.socket && typeof callback === 'function') {
      this.socket.on(event, callback);
      return true;
    }
    console.warn('[Socket] Cannot register listener - socket not available or invalid callback');
    return false;
  }

  off(event, callback) {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
      return true;
    }
    return false
}

 emit(event, data, callback) {
   if (this.socket && this.connected) {
     if (callback && typeof callback === 'function') {
       this.socket.emit(event, data, callback);
     } else {
       this.socket.emit(event, data);
     }
     return true;
   } else {
     console.warn('[Socket] Cannot emit - not connected. Event:', event);
     
     if (this.socket && !this.connected) {
       this.socket.once('connect', () => {
         console.log('[Socket] Connection restored, emitting queued event:', event);
         this.socket.emit(event, data, callback);
       });
     }
     
     return false;
   }
 }

 disconnect() {
   if (this.socket) {
     console.log('[Socket] Disconnecting...');
     
     if (this.reconnectTimeout) {
       clearTimeout(this.reconnectTimeout);
       this.reconnectTimeout = null;
     }
     
     // Remove all listeners before disconnecting
     this.socket.removeAllListeners();
     
     // Disconnect the socket
     this.socket.disconnect();
     
     // Reset state
     this.socket = null;
     this.connected = false;
     this.connecting = false;
     this.reconnectAttempts = 0;
     
     console.log('[Socket] Disconnected and cleaned up');
   }
 }

 // ✅ Connection status check
 isConnected() {
   return this.connected && this.socket?.connected === true;
 }

 // ✅ Enhanced force reconnect method
 forceReconnect(token) {
   console.log('[Socket] Force reconnecting...');
   
   // Disconnect current connection
   this.disconnect();

   // Wait a bit before reconnecting to avoid immediate reconnection issues
   setTimeout(() => {
     if (token) {
       try {
         this.initialize(token);
       } catch (error) {
         console.error('[Socket] Force reconnect failed:', error);
       }
     } else {
       console.error('[Socket] Cannot force reconnect - no token provided');
     }
   }, 2000);
 }

 // ✅ Get connection statistics
 getConnectionStats() {
   if (!this.socket) {
     return {
       connected: false,
       socketId: null,
       transport: null,
       reconnectAttempts: this.reconnectAttempts
     };
   }

   return {
     connected: this.connected,
     socketId: this.socket.id || null,
     transport: this.socket.io?.engine?.transport?.name || null,
     reconnectAttempts: this.reconnectAttempts,
     connecting: this.connecting
   };
 }

 // ✅ Health check method
 healthCheck() {
   return new Promise((resolve, reject) => {
     if (!this.socket || !this.connected) {
       reject(new Error('Socket not connected'));
       return;
     }

     const timeout = setTimeout(() => {
       reject(new Error('Health check timeout'));
     }, 5000);

     this.socket.emit('ping', Date.now(), (response) => {
       clearTimeout(timeout);
       if (response) {
         resolve({
           status: 'healthy',
           latency: Date.now() - response,
           timestamp: new Date().toISOString()
         });
       } else {
         reject(new Error('No response to ping'));
       }
     });
   });
 }

 // ✅ Graceful cleanup method
 cleanup() {
   console.log('[Socket] Performing graceful cleanup...');
   
   if (this.reconnectTimeout) {
     clearTimeout(this.reconnectTimeout);
     this.reconnectTimeout = null;
   }
   
   if (this.socket) {
     // Remove all listeners
     this.socket.removeAllListeners();
     
     // If connected, send a cleanup signal to server
     if (this.connected) {
       this.socket.emit('client_cleanup');
     }
     
     // Disconnect
     this.socket.disconnect();
     this.socket = null;
   }
   
   // Reset all state
   this.connected = false;
   this.connecting = false;
   this.reconnectAttempts = 0;
   
   console.log('[Socket] Cleanup completed');
 }

 // ✅ Add method to update authentication token
 updateAuth(newToken) {
   if (this.socket && newToken) {
     console.log('[Socket] Updating authentication token');
     this.socket.auth.token = newToken;
     
     // If currently connected, emit auth update
     if (this.connected) {
       this.socket.emit('update_auth', { token: newToken });
     }
     
     return true;
   }
   return false;
 }

 // ✅ Get current socket instance (for debugging)
 getSocket() {
   return this.socket;
 }

 // ✅ Add listener for specific events with automatic cleanup
 addListener(event, callback, options = {}) {
   if (!this.socket || typeof callback !== 'function') {
     console.warn('[Socket] Cannot add listener - invalid socket or callback');
     return null;
   }

   const { once = false, timeout = null } = options;
   
   if (once) {
     this.socket.once(event, callback);
   } else {
     this.socket.on(event, callback);
   }

   // Add timeout if specified
   let timeoutId = null;
   if (timeout) {
     timeoutId = setTimeout(() => {
       this.socket.off(event, callback);
       console.log(`[Socket] Listener for '${event}' timed out after ${timeout}ms`);
     }, timeout);
   }

   // Return cleanup function
   return () => {
     if (timeoutId) {
       clearTimeout(timeoutId);
     }
     if (this.socket) {
       this.socket.off(event, callback);
     }
   };
 }

 // ✅ Batch emit multiple events
 batchEmit(events) {
   if (!Array.isArray(events)) {
     console.warn('[Socket] batchEmit expects an array of events');
     return false;
   }

   if (!this.connected) {
     console.warn('[Socket] Cannot batch emit - not connected');
     return false;
   }

   events.forEach(({ event, data, callback }) => {
     if (event && typeof event === 'string') {
       this.emit(event, data, callback);
     }
   });

   return true;
 }
}

// ✅ Export singleton instance
export default new SocketService();
