const jwt = require('jsonwebtoken');

class SocketManager {
    constructor(io) {
        this.io = io;
        this.connectedUsers = new Map();
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.io.use((socket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) {
                    return next(new Error('Authentication error'));
                }
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.userId = decoded.id;
                socket.tenantId = decoded.tenant_id;
                socket.userEmail = decoded.email;
                console.log(`Client ${socket.id} authenticated for tenant: ${socket.tenantId}`);
                next();
            } catch (err) {
                console.error('Socket authentication failed:', err.message);
                next(new Error('Authentication failed'));
            }
        });

        this.io.on('connection', (socket) => {
            console.log(`Client connected: ${socket.id} (tenant: ${socket.tenantId})`);

            if (socket.tenantId) {
                socket.join(socket.tenantId.toString());
                console.log(`Socket ${socket.id} joined tenant room: ${socket.tenantId}`);
            }

            if (!this.connectedUsers.has(socket.userId)) {
                this.connectedUsers.set(socket.userId, new Set());
            }
            this.connectedUsers.get(socket.userId).add(socket.id);

            // FIXED: Handle chat room joining
            socket.on('join_chat', (phoneNumber) => {
                const roomName = `chat_${socket.tenantId}_${phoneNumber}`;
                socket.join(roomName);
                console.log(`Socket ${socket.id} joined chat room: ${roomName}`);
            });

            socket.on('rejoin_rooms', () => {
                if (socket.tenantId) {
                    socket.join(socket.tenantId.toString());
                    console.log(`Socket ${socket.id} rejoined tenant room: ${socket.tenantId}`);
                }
            });

            socket.on('disconnect', (reason) => {
                console.log(`Client disconnected: ${socket.id} Reason: ${reason}`);
                if (this.connectedUsers.has(socket.userId)) {
                    this.connectedUsers.get(socket.userId).delete(socket.id);
                    if (this.connectedUsers.get(socket.userId).size === 0) {
                        this.connectedUsers.delete(socket.userId);
                    }
                }
            });
        });
    }

    sendNotification(userId, type, data) {
        const socketIds = this.connectedUsers.get(userId);
        if (socketIds) {
            socketIds.forEach(socketId => {
                this.io.to(socketId).emit('notification', { type, data });
            });
        }
    }

    sendToTenant(tenantId, event, data) {
        this.io.to(tenantId.toString()).emit(event, data);
        console.log(`Sent ${event} to tenant ${tenantId}`);
    }

    // FIXED: Send message to specific chat room
    sendToChat(tenantId, phoneNumber, event, data) {
        const roomName = `chat_${tenantId}_${phoneNumber}`;
        this.io.to(roomName).emit(event, data);
        console.log(`Sent ${event} to chat room: ${roomName}`);
    }
}

module.exports = SocketManager;
