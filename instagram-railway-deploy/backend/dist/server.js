"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectedUsers = exports.io = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const db_1 = require("./database/db");
const auth_1 = require("./middleware/auth");
// Import routes
const auth_2 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const posts_1 = __importDefault(require("./routes/posts"));
const stories_1 = __importDefault(require("./routes/stories"));
const messages_1 = __importDefault(require("./routes/messages"));
// Initialize database
(0, db_1.initDatabase)();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
exports.io = io;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Static files for uploads
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Routes
app.use('/api/auth', auth_2.default);
app.use('/api/users', users_1.default);
app.use('/api/posts', posts_1.default);
app.use('/api/stories', stories_1.default);
app.use('/api/messages', messages_1.default);
// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Serve frontend static files
app.use(express_1.default.static(path_1.default.join(__dirname, '../../frontend/dist')));
// Catch-all route for SPA
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
        res.sendFile(path_1.default.join(__dirname, '../../frontend/dist/index.html'));
    }
});
// Socket.io connection handling
const connectedUsers = new Map(); // userId -> socketId
exports.connectedUsers = connectedUsers;
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication required'));
    }
    const payload = (0, auth_1.verifyToken)(token);
    if (!payload) {
        return next(new Error('Invalid token'));
    }
    socket.data.user = payload;
    next();
});
io.on('connection', (socket) => {
    const userId = socket.data.user.userId;
    const username = socket.data.user.username;
    console.log(`User connected: ${username} (${userId})`);
    // Store socket connection
    connectedUsers.set(userId, socket.id);
    // Join user's room for direct messages
    socket.join(`user:${userId}`);
    // Handle typing status
    socket.on('typing', (data) => {
        socket.to(`conversation:${data.conversationId}`).emit('typing', {
            userId,
            isTyping: data.isTyping
        });
    });
    // Handle join conversation
    socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation:${conversationId}`);
        console.log(`${username} joined conversation: ${conversationId}`);
    });
    // Handle leave conversation
    socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation:${conversationId}`);
        console.log(`${username} left conversation: ${conversationId}`);
    });
    // Handle new message
    socket.on('send_message', (data) => {
        // Broadcast to conversation room
        socket.to(`conversation:${data.conversationId}`).emit('new_message', {
            conversationId: data.conversationId,
            message: data.message
        });
        // Notify other participants
        const { v4: uuidv4 } = require('uuid');
        const db = require('./database/db').default;
        const participants = db.prepare(`
      SELECT userId FROM conversation_participants 
      WHERE conversationId = ? AND userId != ?
    `).all(data.conversationId, userId);
        participants.forEach((p) => {
            const socketId = connectedUsers.get(p.userId);
            if (socketId) {
                io.to(socketId).emit('new_message_notification', {
                    conversationId: data.conversationId,
                    message: data.message
                });
            }
        });
    });
    // Handle message read
    socket.on('message_read', (data) => {
        socket.to(`conversation:${data.conversationId}`).emit('message_read', {
            messageId: data.messageId,
            userId
        });
    });
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${username} (${userId})`);
        connectedUsers.delete(userId);
    });
});
// Make io accessible to routes
app.set('io', io);
app.set('connectedUsers', connectedUsers);
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
});
