const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const User = require('../../models/v1/User');

let io;
const connectedUsers = new Map(); // userId -> socketId

exports.init = (server) => {
    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    // Middleware to authenticate socket connections
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error'));
            }

            // Verify JWT
            const decoded = jwt.verify(token, config.JWT_SECRET);
            socket.userId = decoded.sub || decoded.id; // Support both structures
            next();
        } catch (err) {
            console.error('Socket authentication error:', err.message);
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`🔌 User connected: ${socket.userId}`);
        connectedUsers.set(socket.userId, socket.id);

        // Join user to their personal room (for 1-on-1 chats and notifications)
        socket.join(`user_${socket.userId}`);

        // Join Squad rooms
        socket.on('join_squad', (squadId) => {
            console.log(`🔌 User ${socket.userId} joined squad ${squadId}`);
            socket.join(`squad_${squadId}`);
        });

        socket.on('leave_squad', (squadId) => {
            socket.leave(`squad_${squadId}`);
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`🔌 User disconnected: ${socket.userId}`);
            connectedUsers.delete(socket.userId);
        });
    });

    return io;
};

exports.getIO = () => {
    if (!io) {
        throw new Error('Socket.io is not initialized!');
    }
    return io;
};

exports.emitToUser = (userId, event, data) => {
    if (io) {
        io.to(`user_${userId}`).emit(event, data);
    }
};

exports.emitToSquad = (squadId, event, data) => {
    if (io) {
        io.to(`squad_${squadId}`).emit(event, data);
    }
};

exports.isUserOnline = (userId) => {
    return connectedUsers.has(userId.toString());
};
