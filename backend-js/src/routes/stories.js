const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `story-${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    if (allowedTypes.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Get stories feed
router.get('/feed', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date().toISOString();

    const stories = db.prepare(`
      SELECT s.*, u.username, u.fullName, u.avatar, u.isVerified,
             EXISTS(SELECT 1 FROM story_views sv WHERE sv.storyId = s.id AND sv.userId = ?) as isViewed
      FROM stories s JOIN users u ON s.userId = u.id
      WHERE s.expiresAt > ? AND (s.userId = ? OR s.userId IN (SELECT followingId FROM follows WHERE followerId = ?))
      ORDER BY s.createdAt DESC
    `).all(userId, now, userId, userId);

    const grouped = {};
    stories.forEach((story) => {
      if (!grouped[story.userId]) {
        grouped[story.userId] = {
          user: { id: story.userId, username: story.username, fullName: story.fullName, avatar: story.avatar, isVerified: story.isVerified === 1 },
          stories: []
        };
      }
      grouped[story.userId].stories.push({
        id: story.id, imageUrl: story.imageUrl, createdAt: story.createdAt, expiresAt: story.expiresAt, isViewed: story.isViewed === 1
      });
    });

    res.json(Object.values(grouped));
  } catch (error) {
    console.error('Get stories feed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create story
router.post('/', authMiddleware, upload.single('image'), (req, res) => {
  try {
    const userId = req.user.userId;
    if (!req.file) return res.status(400).json({ error: 'Image is required' });

    const storyId = uuidv4();
    const imageUrl = `/uploads/${req.file.filename}`;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    db.prepare('INSERT INTO stories (id, userId, imageUrl, expiresAt) VALUES (?, ?, ?, ?)')
      .run(storyId, userId, imageUrl, expiresAt.toISOString());

    const story = db.prepare('SELECT s.*, u.username, u.fullName, u.avatar, u.isVerified FROM stories s JOIN users u ON s.userId = u.id WHERE s.id = ?').get(storyId);
    res.status(201).json(story);
  } catch (error) {
    console.error('Create story error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// View story
router.post('/:storyId/view', authMiddleware, (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.userId;

    const existing = db.prepare('SELECT * FROM story_views WHERE storyId = ? AND userId = ?').get(storyId, userId);
    if (!existing) {
      db.prepare('INSERT INTO story_views (id, storyId, userId) VALUES (?, ?, ?)').run(uuidv4(), storyId, userId);
    }
    res.json({ viewed: true });
  } catch (error) {
    console.error('View story error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
