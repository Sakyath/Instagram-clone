"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const db_1 = __importDefault(require("../database/db"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Ensure uploads directory exists
const UPLOAD_DIR = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(UPLOAD_DIR)) {
    fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
}
// Configure multer
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${(0, uuid_1.v4)()}${path_1.default.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
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
// Get feed posts
router.get('/feed', auth_1.optionalAuthMiddleware, (req, res) => {
    try {
        const userId = req.user?.userId;
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        let posts;
        if (userId) {
            // Get posts from followed users + own posts
            posts = db_1.default.prepare(`
        SELECT p.*, 
               u.username, u.fullName, u.avatar, u.isVerified,
               EXISTS(SELECT 1 FROM likes l WHERE l.postId = p.id AND l.userId = ?) as isLiked,
               EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.postId = p.id AND sp.userId = ?) as isSaved
        FROM posts p
        JOIN users u ON p.userId = u.id
        WHERE p.userId = ? OR p.userId IN (SELECT followingId FROM follows WHERE followerId = ?)
        ORDER BY p.createdAt DESC
        LIMIT ? OFFSET ?
      `).all(userId, userId, userId, userId, limit, offset);
        }
        else {
            // Get all posts (public)
            posts = db_1.default.prepare(`
        SELECT p.*, 
               u.username, u.fullName, u.avatar, u.isVerified,
               0 as isLiked,
               0 as isSaved
        FROM posts p
        JOIN users u ON p.userId = u.id
        ORDER BY p.createdAt DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);
        }
        // Get images for each post
        for (const post of posts) {
            post.images = db_1.default.prepare('SELECT * FROM post_images WHERE postId = ? ORDER BY orderIndex').all(post.id);
            post.user = {
                id: post.userId,
                username: post.username,
                fullName: post.fullName,
                avatar: post.avatar,
                isVerified: post.isVerified === 1
            };
            delete post.username;
            delete post.fullName;
            delete post.avatar;
            delete post.isVerified;
        }
        res.json(posts);
    }
    catch (error) {
        console.error('Get feed error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get explore posts
router.get('/explore', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 24;
        const posts = db_1.default.prepare(`
      SELECT p.id, p.likesCount, p.commentsCount, pi.imageUrl
      FROM posts p
      JOIN post_images pi ON p.id = pi.postId
      WHERE pi.orderIndex = 0
      ORDER BY p.likesCount DESC, p.createdAt DESC
      LIMIT ?
    `).all(limit);
        res.json(posts);
    }
    catch (error) {
        console.error('Get explore error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get single post
router.get('/:postId', auth_1.optionalAuthMiddleware, (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user?.userId;
        const post = db_1.default.prepare(`
      SELECT p.*, 
             u.username, u.fullName, u.avatar, u.isVerified
      FROM posts p
      JOIN users u ON p.userId = u.id
      WHERE p.id = ?
    `).get(postId);
        if (!post) {
            res.status(404).json({ error: 'Post not found' });
            return;
        }
        post.images = db_1.default.prepare('SELECT * FROM post_images WHERE postId = ? ORDER BY orderIndex').all(postId);
        post.comments = db_1.default.prepare(`
      SELECT c.*, u.username, u.fullName, u.avatar
      FROM comments c
      JOIN users u ON c.userId = u.id
      WHERE c.postId = ?
      ORDER BY c.createdAt DESC
      LIMIT 20
    `).all(postId);
        if (userId) {
            post.isLiked = !!db_1.default.prepare('SELECT 1 FROM likes WHERE postId = ? AND userId = ?').get(postId, userId);
            post.isSaved = !!db_1.default.prepare('SELECT 1 FROM saved_posts WHERE postId = ? AND userId = ?').get(postId, userId);
        }
        post.user = {
            id: post.userId,
            username: post.username,
            fullName: post.fullName,
            avatar: post.avatar,
            isVerified: post.isVerified === 1
        };
        res.json(post);
    }
    catch (error) {
        console.error('Get post error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Create post
router.post('/', auth_1.authMiddleware, upload.array('images', 10), (req, res) => {
    try {
        const { caption, location } = req.body;
        const userId = req.user.userId;
        const files = req.files;
        if (!files || files.length === 0) {
            res.status(400).json({ error: 'At least one image is required' });
            return;
        }
        const postId = (0, uuid_1.v4)();
        // Create post
        db_1.default.prepare(`
      INSERT INTO posts (id, userId, caption, location)
      VALUES (?, ?, ?, ?)
    `).run(postId, userId, caption || '', location || null);
        // Add images
        const insertImage = db_1.default.prepare('INSERT INTO post_images (id, postId, imageUrl, orderIndex) VALUES (?, ?, ?, ?)');
        files.forEach((file, index) => {
            const imageUrl = `/uploads/${file.filename}`;
            insertImage.run((0, uuid_1.v4)(), postId, imageUrl, index);
        });
        // Update user posts count
        db_1.default.prepare('UPDATE users SET postsCount = postsCount + 1 WHERE id = ?').run(userId);
        // Return created post
        const post = db_1.default.prepare(`
      SELECT p.*, 
             u.username, u.fullName, u.avatar, u.isVerified
      FROM posts p
      JOIN users u ON p.userId = u.id
      WHERE p.id = ?
    `).get(postId);
        post.images = db_1.default.prepare('SELECT * FROM post_images WHERE postId = ? ORDER BY orderIndex').all(postId);
        post.user = {
            id: post.userId,
            username: post.username,
            fullName: post.fullName,
            avatar: post.avatar,
            isVerified: post.isVerified === 1
        };
        post.isLiked = false;
        post.isSaved = false;
        res.status(201).json(post);
    }
    catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete post
router.delete('/:postId', auth_1.authMiddleware, (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.userId;
        const post = db_1.default.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
        if (!post) {
            res.status(404).json({ error: 'Post not found' });
            return;
        }
        if (post.userId !== userId) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }
        // Delete images from filesystem
        const images = db_1.default.prepare('SELECT imageUrl FROM post_images WHERE postId = ?').all(postId);
        images.forEach((img) => {
            const filePath = path_1.default.join(UPLOAD_DIR, path_1.default.basename(img.imageUrl));
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
            }
        });
        // Delete post (cascade will delete images, likes, comments, saved_posts)
        db_1.default.prepare('DELETE FROM posts WHERE id = ?').run(postId);
        // Update user posts count
        db_1.default.prepare('UPDATE users SET postsCount = postsCount - 1 WHERE id = ?').run(userId);
        res.json({ message: 'Post deleted successfully' });
    }
    catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Like/unlike post
router.post('/:postId/like', auth_1.authMiddleware, (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.userId;
        const existing = db_1.default.prepare('SELECT * FROM likes WHERE postId = ? AND userId = ?').get(postId, userId);
        if (existing) {
            // Unlike
            db_1.default.prepare('DELETE FROM likes WHERE postId = ? AND userId = ?').run(postId, userId);
            db_1.default.prepare('UPDATE posts SET likesCount = likesCount - 1 WHERE id = ?').run(postId);
            res.json({ liked: false });
        }
        else {
            // Like
            db_1.default.prepare('INSERT INTO likes (id, postId, userId) VALUES (?, ?, ?)').run((0, uuid_1.v4)(), postId, userId);
            db_1.default.prepare('UPDATE posts SET likesCount = likesCount + 1 WHERE id = ?').run(postId);
            res.json({ liked: true });
        }
    }
    catch (error) {
        console.error('Like post error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Save/unsave post
router.post('/:postId/save', auth_1.authMiddleware, (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.userId;
        const existing = db_1.default.prepare('SELECT * FROM saved_posts WHERE postId = ? AND userId = ?').get(postId, userId);
        if (existing) {
            // Unsave
            db_1.default.prepare('DELETE FROM saved_posts WHERE postId = ? AND userId = ?').run(postId, userId);
            res.json({ saved: false });
        }
        else {
            // Save
            db_1.default.prepare('INSERT INTO saved_posts (id, postId, userId) VALUES (?, ?, ?)').run((0, uuid_1.v4)(), postId, userId);
            res.json({ saved: true });
        }
    }
    catch (error) {
        console.error('Save post error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Add comment
router.post('/:postId/comments', auth_1.authMiddleware, (req, res) => {
    try {
        const { postId } = req.params;
        const { text } = req.body;
        const userId = req.user.userId;
        if (!text || !text.trim()) {
            res.status(400).json({ error: 'Comment text is required' });
            return;
        }
        const commentId = (0, uuid_1.v4)();
        db_1.default.prepare('INSERT INTO comments (id, postId, userId, text) VALUES (?, ?, ?, ?)')
            .run(commentId, postId, userId, text.trim());
        db_1.default.prepare('UPDATE posts SET commentsCount = commentsCount + 1 WHERE id = ?').run(postId);
        const comment = db_1.default.prepare(`
      SELECT c.*, u.username, u.fullName, u.avatar
      FROM comments c
      JOIN users u ON c.userId = u.id
      WHERE c.id = ?
    `).get(commentId);
        res.status(201).json(comment);
    }
    catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get comments
router.get('/:postId/comments', (req, res) => {
    try {
        const { postId } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const comments = db_1.default.prepare(`
      SELECT c.*, u.username, u.fullName, u.avatar
      FROM comments c
      JOIN users u ON c.userId = u.id
      WHERE c.postId = ?
      ORDER BY c.createdAt DESC
      LIMIT ? OFFSET ?
    `).all(postId, limit, offset);
        res.json(comments);
    }
    catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get user's posts
router.get('/user/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 12;
        const offset = parseInt(req.query.offset) || 0;
        const posts = db_1.default.prepare(`
      SELECT p.*, pi.imageUrl as firstImage
      FROM posts p
      LEFT JOIN post_images pi ON p.id = pi.postId AND pi.orderIndex = 0
      WHERE p.userId = ?
      ORDER BY p.createdAt DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);
        res.json(posts);
    }
    catch (error) {
        console.error('Get user posts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get saved posts
router.get('/saved/list', auth_1.authMiddleware, (req, res) => {
    try {
        const userId = req.user.userId;
        const limit = parseInt(req.query.limit) || 12;
        const offset = parseInt(req.query.offset) || 0;
        const posts = db_1.default.prepare(`
      SELECT p.*, pi.imageUrl as firstImage
      FROM saved_posts sp
      JOIN posts p ON sp.postId = p.id
      LEFT JOIN post_images pi ON p.id = pi.postId AND pi.orderIndex = 0
      WHERE sp.userId = ?
      ORDER BY sp.createdAt DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);
        res.json(posts);
    }
    catch (error) {
        console.error('Get saved posts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
