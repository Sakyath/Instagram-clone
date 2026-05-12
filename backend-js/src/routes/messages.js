const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get conversations
router.get('/conversations', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const conversations = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversationId = c.id AND m.senderId != ? AND m.isRead = 0) as unreadCount
      FROM conversations c JOIN conversation_participants cp ON c.id = cp.conversationId
      WHERE cp.userId = ? ORDER BY c.updatedAt DESC
    `).all(userId, userId);

    for (const conv of conversations) {
      conv.participants = db.prepare(`
        SELECT u.id, u.username, u.fullName, u.avatar, u.isVerified
        FROM conversation_participants cp JOIN users u ON cp.userId = u.id
        WHERE cp.conversationId = ? AND cp.userId != ?
      `).all(conv.id, userId);

      conv.lastMessage = db.prepare(`
        SELECT m.*, u.username, u.fullName, u.avatar FROM messages m
        JOIN users u ON m.senderId = u.id WHERE m.conversationId = ? ORDER BY m.createdAt DESC LIMIT 1
      `).get(conv.id);
    }

    res.json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or get conversation
router.post('/conversations', authMiddleware, (req, res) => {
  try {
    const { userId: otherUserId } = req.body;
    const userId = req.user.userId;

    const existing = db.prepare(`
      SELECT c.id FROM conversations c
      JOIN conversation_participants cp1 ON c.id = cp1.conversationId
      JOIN conversation_participants cp2 ON c.id = cp2.conversationId
      WHERE cp1.userId = ? AND cp2.userId = ?
    `).get(userId, otherUserId);

    if (existing) {
      const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(existing.id);
      conversation.participants = db.prepare(`
        SELECT u.id, u.username, u.fullName, u.avatar, u.isVerified
        FROM conversation_participants cp JOIN users u ON cp.userId = u.id
        WHERE cp.conversationId = ? AND cp.userId != ?
      `).all(conversation.id, userId);
      return res.json(conversation);
    }

    const conversationId = uuidv4();
    db.prepare('INSERT INTO conversations (id) VALUES (?)').run(conversationId);
    db.prepare('INSERT INTO conversation_participants (id, conversationId, userId) VALUES (?, ?, ?)').run(uuidv4(), conversationId, userId);
    db.prepare('INSERT INTO conversation_participants (id, conversationId, userId) VALUES (?, ?, ?)').run(uuidv4(), conversationId, otherUserId);

    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
    conversation.participants = db.prepare(`
      SELECT u.id, u.username, u.fullName, u.avatar, u.isVerified
      FROM conversation_participants cp JOIN users u ON cp.userId = u.id
      WHERE cp.conversationId = ? AND cp.userId != ?
    `).all(conversationId, userId);

    res.status(201).json(conversation);
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages
router.get('/conversations/:conversationId', authMiddleware, (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;

    const participant = db.prepare('SELECT * FROM conversation_participants WHERE conversationId = ? AND userId = ?').get(conversationId, userId);
    if (!participant) return res.status(403).json({ error: 'Not authorized' });

    const messages = db.prepare(`
      SELECT m.*, u.username, u.fullName, u.avatar FROM messages m
      JOIN users u ON m.senderId = u.id WHERE m.conversationId = ? ORDER BY m.createdAt DESC LIMIT 50
    `).all(conversationId);

    db.prepare('UPDATE messages SET isRead = 1 WHERE conversationId = ? AND senderId != ? AND isRead = 0').run(conversationId, userId);
    res.json(messages.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send message
router.post('/conversations/:conversationId', authMiddleware, (req, res) => {
  try {
    const { conversationId } = req.params;
    const { text, imageUrl } = req.body;
    const userId = req.user.userId;

    if (!text && !imageUrl) return res.status(400).json({ error: 'Text or image is required' });

    const participant = db.prepare('SELECT * FROM conversation_participants WHERE conversationId = ? AND userId = ?').get(conversationId, userId);
    if (!participant) return res.status(403).json({ error: 'Not authorized' });

    const messageId = uuidv4();
    db.prepare('INSERT INTO messages (id, conversationId, senderId, text, imageUrl) VALUES (?, ?, ?, ?, ?)')
      .run(messageId, conversationId, userId, text || null, imageUrl || null);
    db.prepare('UPDATE conversations SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(conversationId);

    const message = db.prepare(`
      SELECT m.*, u.username, u.fullName, u.avatar FROM messages m
      JOIN users u ON m.senderId = u.id WHERE m.id = ?
    `).get(messageId);

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
