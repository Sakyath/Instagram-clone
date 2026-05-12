const express = require('express');
const { db } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, username, email, fullName, avatar, bio, isVerified, 
             followersCount, followingCount, postsCount, createdAt 
      FROM users WHERE id = ?
    `).get(req.user.userId);

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by username
router.get('/:username', (req, res) => {
  try {
    const { username } = req.params;
    const user = db.prepare(`
      SELECT id, username, email, fullName, avatar, bio, isVerified, 
             followersCount, followingCount, postsCount, createdAt 
      FROM users WHERE username = ?
    `).get(username);

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search users
router.get('/', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter required' });

    const users = db.prepare(`
      SELECT id, username, fullName, avatar, isVerified 
      FROM users WHERE username LIKE ? OR fullName LIKE ? LIMIT 20
    `).all(`%${q}%`, `%${q}%`);

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Follow/unfollow user
router.post('/:userId/follow', authMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.userId;

    if (userId === followerId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const existing = db.prepare('SELECT * FROM follows WHERE followerId = ? AND followingId = ?').get(followerId, userId);
    
    if (existing) {
      db.prepare('DELETE FROM follows WHERE followerId = ? AND followingId = ?').run(followerId, userId);
      db.prepare('UPDATE users SET followingCount = followingCount - 1 WHERE id = ?').run(followerId);
      db.prepare('UPDATE users SET followersCount = followersCount - 1 WHERE id = ?').run(userId);
      res.json({ following: false });
    } else {
      const { v4: uuidv4 } = require('uuid');
      db.prepare('INSERT INTO follows (id, followerId, followingId) VALUES (?, ?, ?)').run(uuidv4(), followerId, userId);
      db.prepare('UPDATE users SET followingCount = followingCount + 1 WHERE id = ?').run(followerId);
      db.prepare('UPDATE users SET followersCount = followersCount + 1 WHERE id = ?').run(userId);
      res.json({ following: true });
    }
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
