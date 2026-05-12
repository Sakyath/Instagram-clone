"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const db_1 = __importDefault(require("../database/db"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Get conversations
router.get('/conversations', auth_1.authMiddleware, (req, res) => {
    try {
        const userId = req.user.userId;
        const conversations = db_1.default.prepare(`
      SELECT c.*,
             (SELECT COUNT(*) FROM messages m 
              WHERE m.conversationId = c.id AND m.senderId != ? AND m.isRead = 0) as unreadCount
      FROM conversations c
      JOIN conversation_participants cp ON c.id = cp.conversationId
      WHERE cp.userId = ?
      ORDER BY c.updatedAt DESC
    `).all(userId, userId);
        // Get participants and last message for each conversation
        for (const conv of conversations) {
            conv.participants = db_1.default.prepare(`
        SELECT u.id, u.username, u.fullName, u.avatar, u.isVerified
        FROM conversation_participants cp
        JOIN users u ON cp.userId = u.id
        WHERE cp.conversationId = ? AND cp.userId != ?
      `).all(conv.id, userId);
            conv.lastMessage = db_1.default.prepare(`
        SELECT m.*, u.username, u.fullName, u.avatar
        FROM messages m
        JOIN users u ON m.senderId = u.id
        WHERE m.conversationId = ?
        ORDER BY m.createdAt DESC
        LIMIT 1
      `).get(conv.id);
        }
        res.json(conversations);
    }
    catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get or create conversation with user
router.post('/conversations', auth_1.authMiddleware, (req, res) => {
    try {
        const { userId: otherUserId } = req.body;
        const userId = req.user.userId;
        if (!otherUserId) {
            res.status(400).json({ error: 'User ID is required' });
            return;
        }
        // Check if conversation already exists
        const existingConv = db_1.default.prepare(`
      SELECT c.id
      FROM conversations c
      JOIN conversation_participants cp1 ON c.id = cp1.conversationId
      JOIN conversation_participants cp2 ON c.id = cp2.conversationId
      WHERE cp1.userId = ? AND cp2.userId = ?
    `).get(userId, otherUserId);
        if (existingConv) {
            const conversation = db_1.default.prepare('SELECT * FROM conversations WHERE id = ?').get(existingConv.id);
            conversation.participants = db_1.default.prepare(`
        SELECT u.id, u.username, u.fullName, u.avatar, u.isVerified
        FROM conversation_participants cp
        JOIN users u ON cp.userId = u.id
        WHERE cp.conversationId = ? AND cp.userId != ?
      `).all(conversation.id, userId);
            res.json(conversation);
            return;
        }
        // Create new conversation
        const conversationId = (0, uuid_1.v4)();
        db_1.default.prepare('INSERT INTO conversations (id) VALUES (?)').run(conversationId);
        // Add participants
        db_1.default.prepare('INSERT INTO conversation_participants (id, conversationId, userId) VALUES (?, ?, ?)')
            .run((0, uuid_1.v4)(), conversationId, userId);
        db_1.default.prepare('INSERT INTO conversation_participants (id, conversationId, userId) VALUES (?, ?, ?)')
            .run((0, uuid_1.v4)(), conversationId, otherUserId);
        const conversation = db_1.default.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
        conversation.participants = db_1.default.prepare(`
      SELECT u.id, u.username, u.fullName, u.avatar, u.isVerified
      FROM conversation_participants cp
      JOIN users u ON cp.userId = u.id
      WHERE cp.conversationId = ? AND cp.userId != ?
    `).all(conversationId, userId);
        res.status(201).json(conversation);
    }
    catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get messages in conversation
router.get('/conversations/:conversationId', auth_1.authMiddleware, (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.userId;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        // Check if user is participant
        const participant = db_1.default.prepare(`
      SELECT * FROM conversation_participants WHERE conversationId = ? AND userId = ?
    `).get(conversationId, userId);
        if (!participant) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }
        const messages = db_1.default.prepare(`
      SELECT m.*, u.username, u.fullName, u.avatar
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.conversationId = ?
      ORDER BY m.createdAt DESC
      LIMIT ? OFFSET ?
    `).all(conversationId, limit, offset);
        // Mark messages as read
        db_1.default.prepare(`
      UPDATE messages SET isRead = 1 
      WHERE conversationId = ? AND senderId != ? AND isRead = 0
    `).run(conversationId, userId);
        res.json(messages.reverse());
    }
    catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Send message
router.post('/conversations/:conversationId', auth_1.authMiddleware, (req, res) => {
    try {
        const { conversationId } = req.params;
        const { text, imageUrl } = req.body;
        const userId = req.user.userId;
        if (!text && !imageUrl) {
            res.status(400).json({ error: 'Text or image is required' });
            return;
        }
        // Check if user is participant
        const participant = db_1.default.prepare(`
      SELECT * FROM conversation_participants WHERE conversationId = ? AND userId = ?
    `).get(conversationId, userId);
        if (!participant) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }
        const messageId = (0, uuid_1.v4)();
        db_1.default.prepare(`
      INSERT INTO messages (id, conversationId, senderId, text, imageUrl)
      VALUES (?, ?, ?, ?, ?)
    `).run(messageId, conversationId, userId, text || null, imageUrl || null);
        // Update conversation timestamp
        db_1.default.prepare('UPDATE conversations SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(conversationId);
        const message = db_1.default.prepare(`
      SELECT m.*, u.username, u.fullName, u.avatar
      FROM messages m
      JOIN users u ON m.senderId = u.id
      WHERE m.id = ?
    `).get(messageId);
        res.status(201).json(message);
    }
    catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete message
router.delete('/:messageId', auth_1.authMiddleware, (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.userId;
        const message = db_1.default.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        if (!message) {
            res.status(404).json({ error: 'Message not found' });
            return;
        }
        if (message.senderId !== userId) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }
        db_1.default.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
        res.json({ message: 'Message deleted successfully' });
    }
    catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get unread message count
router.get('/unread/count', auth_1.authMiddleware, (req, res) => {
    try {
        const userId = req.user.userId;
        const count = db_1.default.prepare(`
      SELECT COUNT(*) as count
      FROM messages m
      JOIN conversation_participants cp ON m.conversationId = cp.conversationId
      WHERE cp.userId = ? AND m.senderId != ? AND m.isRead = 0
    `).get(userId, userId);
        res.json(count);
    }
    catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
