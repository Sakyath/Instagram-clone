"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const db_1 = __importDefault(require("../database/db"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const UPLOAD_DIR = path_1.default.join(__dirname, '../../uploads');
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = `story-${(0, uuid_1.v4)()}${path_1.default.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed'));
        }
    }
});
// Get stories feed (from followed users + own)
router.get('/feed', auth_1.authMiddleware, (req, res) => {
    try {
        const userId = req.user.userId;
        const now = new Date().toISOString();
        // Get stories from followed users + own, that haven't expired
        const stories = db_1.default.prepare(`
      SELECT s.*, 
             u.username, u.fullName, u.avatar, u.isVerified,
             EXISTS(SELECT 1 FROM story_views sv WHERE sv.storyId = s.id AND sv.userId = ?) as isViewed
      FROM stories s
      JOIN users u ON s.userId = u.id
      WHERE s.expiresAt > ? AND (s.userId = ? OR s.userId IN (SELECT followingId FROM follows WHERE followerId = ?))
      ORDER BY s.createdAt DESC
    `).all(userId, now, userId, userId);
        // Group by user
        const groupedStories = {};
        stories.forEach((story) => {
            if (!groupedStories[story.userId]) {
                groupedStories[story.userId] = {
                    user: {
                        id: story.userId,
                        username: story.username,
                        fullName: story.fullName,
                        avatar: story.avatar,
                        isVerified: story.isVerified === 1
                    },
                    stories: []
                };
            }
            groupedStories[story.userId].stories.push({
                id: story.id,
                imageUrl: story.imageUrl,
                createdAt: story.createdAt,
                expiresAt: story.expiresAt,
                isViewed: story.isViewed === 1
            });
        });
        res.json(Object.values(groupedStories));
    }
    catch (error) {
        console.error('Get stories feed error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get user's stories
router.get('/user/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const now = new Date().toISOString();
        const stories = db_1.default.prepare(`
      SELECT s.*, u.username, u.fullName, u.avatar, u.isVerified
      FROM stories s
      JOIN users u ON s.userId = u.id
      WHERE s.userId = ? AND s.expiresAt > ?
      ORDER BY s.createdAt DESC
    `).all(userId, now);
        res.json(stories);
    }
    catch (error) {
        console.error('Get user stories error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Create story
router.post('/', auth_1.authMiddleware, upload.single('image'), (req, res) => {
    try {
        const userId = req.user.userId;
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: 'Image is required' });
            return;
        }
        const storyId = (0, uuid_1.v4)();
        const imageUrl = `/uploads/${file.filename}`;
        // Story expires after 24 hours
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        db_1.default.prepare(`
      INSERT INTO stories (id, userId, imageUrl, expiresAt)
      VALUES (?, ?, ?, ?)
    `).run(storyId, userId, imageUrl, expiresAt.toISOString());
        const story = db_1.default.prepare(`
      SELECT s.*, u.username, u.fullName, u.avatar, u.isVerified
      FROM stories s
      JOIN users u ON s.userId = u.id
      WHERE s.id = ?
    `).get(storyId);
        res.status(201).json(story);
    }
    catch (error) {
        console.error('Create story error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// View story
router.post('/:storyId/view', auth_1.authMiddleware, (req, res) => {
    try {
        const { storyId } = req.params;
        const userId = req.user.userId;
        // Check if already viewed
        const existing = db_1.default.prepare('SELECT * FROM story_views WHERE storyId = ? AND userId = ?').get(storyId, userId);
        if (!existing) {
            db_1.default.prepare('INSERT INTO story_views (id, storyId, userId) VALUES (?, ?, ?)').run((0, uuid_1.v4)(), storyId, userId);
        }
        res.json({ viewed: true });
    }
    catch (error) {
        console.error('View story error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get story viewers
router.get('/:storyId/viewers', auth_1.authMiddleware, (req, res) => {
    try {
        const { storyId } = req.params;
        const userId = req.user.userId;
        // Check if user owns the story
        const story = db_1.default.prepare('SELECT * FROM stories WHERE id = ?').get(storyId);
        if (!story) {
            res.status(404).json({ error: 'Story not found' });
            return;
        }
        if (story.userId !== userId) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }
        const viewers = db_1.default.prepare(`
      SELECT u.id, u.username, u.fullName, u.avatar, sv.viewedAt
      FROM story_views sv
      JOIN users u ON sv.userId = u.id
      WHERE sv.storyId = ?
      ORDER BY sv.viewedAt DESC
    `).all(storyId);
        res.json(viewers);
    }
    catch (error) {
        console.error('Get story viewers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete story
router.delete('/:storyId', auth_1.authMiddleware, (req, res) => {
    try {
        const { storyId } = req.params;
        const userId = req.user.userId;
        const story = db_1.default.prepare('SELECT * FROM stories WHERE id = ?').get(storyId);
        if (!story) {
            res.status(404).json({ error: 'Story not found' });
            return;
        }
        if (story.userId !== userId) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }
        db_1.default.prepare('DELETE FROM stories WHERE id = ?').run(storyId);
        res.json({ message: 'Story deleted successfully' });
    }
    catch (error) {
        console.error('Delete story error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
