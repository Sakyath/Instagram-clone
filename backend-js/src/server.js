const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { initDatabase } = require('./database/db');
const { verifyToken } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const storyRoutes = require('./routes/stories');
const messageRoutes = require('./routes/messages');

// Initialize database
initDatabase();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
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

// Serve frontend
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  }
});

// Socket.io
const connectedUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  const payload = verifyToken(token);
  if (!payload) return next(new Error('Invalid token'));
  socket.data.user = payload;
  next();
});

io.on('connection', (socket) => {
  const userId = socket.data.user.userId;
  const username = socket.data.user.username;
  
  console.log(`User connected: ${username} (${userId})`);
  connectedUsers.set(userId, socket.id);
  socket.join(`user:${userId}`);

  socket.on('typing', (data) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing', { userId, isTyping: data.isTyping });
  });

  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
  });

  socket.on('send_message', (data) => {
    socket.to(`conversation:${data.conversationId}`).emit('new_message', data);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${username} (${userId})`);
    connectedUsers.delete(userId);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { io, connectedUsers };
