"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../database/db"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Get current user
router.get('/me', auth_1.authMiddleware, (req, res) => {
    try {
        const user = db_1.default.prepare(`
      SELECT id, username, email, fullName, avatar, bio, isVerified, 
             followersCount, followingCount, postsCount, createdAt 
      FROM users WHERE id = ?
    `).get(req.user.userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(user);
    }
    catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get user by username
router.get('/:username', (req, res) => {
    try {
        const { username } = req.params;
        const user = db_1.default.prepare(`
      SELECT id, username, email, fullName, avatar, bio, isVerified, 
             followersCount, followingCount, postsCount, createdAt 
      FROM users WHERE username = ?
    `).get(username);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(user);
    }
    catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Update user profile
router.put('/me', auth_1.authMiddleware, (req, res) => {
    try {
        const { fullName, bio, avatar } = req.body;
        const userId = req.user.userId;
        db_1.default.prepare(`
      UPDATE users 
      SET fullName = COALESCE(?, fullName),
          bio = COALESCE(?, bio),
          avatar = COALESCE(?, avatar),
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(fullName, bio, avatar, userId);
        const updatedUser = db_1.default.prepare(`
      SELECT id, username, email, fullName, avatar, bio, isVerified, 
             followersCount, followingCount, postsCount, createdAt 
      FROM users WHERE id = ?
    `).get(userId);
        res.json(updatedUser);
    }
    catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Search users
router.get('/', (req, res) => {
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string') {
            res.status(400).json({ error: 'Query parameter required' });
            return;
        }
        const users = db_1.default.prepare(`
      SELECT id, username, fullName, avatar, isVerified 
      FROM users 
      WHERE username LIKE ? OR fullName LIKE ?
      LIMIT 20
    `).all(`%${q}%`, `%${q}%`);
        res.json(users);
    }
    catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Follow user
router.post('/:userId/follow', auth_1.authMiddleware, (req, res) => {
    try {
        const { userId } = req.params;
        const followerId = req.user.userId;
        if (userId === followerId) {
            res.status(400).json({ error: 'Cannot follow yourself' });
            return;
        }
        // Check if already following
        const existing = db_1.default.prepare('SELECT * FROM follows WHERE followerId = ? AND followingId = ?').get(followerId, userId);
        if (existing) {
            // Unfollow
            db_1.default.prepare('DELETE FROM follows WHERE followerId = ? AND followingId = ?').run(followerId, userId);
            // Update counts
            db_1.default.prepare('UPDATE users SET followingCount = followingCount - 1 WHERE id = ?').run(followerId);
            db_1.default.prepare('UPDATE users SET followersCount = followersCount - 1 WHERE id = ?').run(userId);
            res.json({ following: false });
        }
        else {
            // Follow
            const { v4: uuidv4 } = require('uuid');
            db_1.default.prepare('INSERT INTO follows (id, followerId, followingId) VALUES (?, ?, ?)').run(uuidv4(), followerId, userId);
            // Update counts
            db_1.default.prepare('UPDATE users SET followingCount = followingCount + 1 WHERE id = ?').run(followerId);
            db_1.default.prepare('UPDATE users SET followersCount = followersCount + 1 WHERE id = ?').run(userId);
            res.json({ following: true });
        }
    }
    catch (error) {
        console.error('Follow error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get followers
router.get('/:userId/followers', (req, res) => {
    try {
        const { userId } = req.params;
        const followers = db_1.default.prepare(`
      SELECT u.id, u.username, u.fullName, u.avatar, u.isVerified
      FROM follows f
      JOIN users u ON f.followerId = u.id
      WHERE f.followingId = ?
    `).all(userId);
        res.json(followers);
    }
    catch (error) {
        console.error('Get followers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get following
router.get('/:userId/following', (req, res) => {
    try {
        const { userId } = req.params;
        const following = db_1.default.prepare(`
      SELECT u.id, u.username, u.fullName, u.avatar, u.isVerified
      FROM follows f
      JOIN users u ON f.followingId = u.id
      WHERE f.followerId = ?
    `).all(userId);
        res.json(following);
    }
    catch (error) {
        console.error('Get following error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Check if following
router.get('/:userId/is-following', auth_1.authMiddleware, (req, res) => {
    try {
        const { userId } = req.params;
        const followerId = req.user.userId;
        const existing = db_1.default.prepare('SELECT * FROM follows WHERE followerId = ? AND followingId = ?').get(followerId, userId);
        res.json({ following: !!existing });
    }
    catch (error) {
        console.error('Check follow error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
