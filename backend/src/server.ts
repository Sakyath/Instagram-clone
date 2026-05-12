import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import { initDatabase } from './database/db';
import { verifyToken } from './middleware/auth';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import postRoutes from './routes/posts';
import storyRoutes from './routes/stories';
import messageRoutes from './routes/messages';

// Initialize database
initDatabase();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/messages', messageRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Catch-all route for SPA
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  }
});

// Socket.io connection handling
const connectedUsers = new Map<string, string>(); // userId -> socketId

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication required'));
  }

  const payload = verifyToken(token);
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
  socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing', {
      userId,
      isTyping: data.isTyping
    });
  });

  // Handle join conversation
  socket.on('join_conversation', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`);
    console.log(`${username} joined conversation: ${conversationId}`);
  });

  // Handle leave conversation
  socket.on('leave_conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
    console.log(`${username} left conversation: ${conversationId}`);
  });

  // Handle new message
  socket.on('send_message', (data: { conversationId: string; message: any }) => {
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

    participants.forEach((p: any) => {
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
  socket.on('message_read', (data: { conversationId: string; messageId: string }) => {
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

export { io, connectedUsers };
