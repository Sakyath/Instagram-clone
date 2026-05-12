const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/db');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get feed posts
router.get('/feed', optionalAuthMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    let posts;
    if (userId) {
      posts = db.prepare(`
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
    } else {
      posts = db.prepare(`
        SELECT p.*, 
               u.username, u.fullName, u.avatar, u.isVerified,
               0 as isLiked, 0 as isSaved
        FROM posts p
        JOIN users u ON p.userId = u.id
        ORDER BY p.createdAt DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);
    }

    for (const post of posts) {
      post.images = db.prepare('SELECT * FROM post_images WHERE postId = ? ORDER BY orderIndex').all(post.id);
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
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get explore posts
router.get('/explore', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 24;
    const posts = db.prepare(`
      SELECT p.id, p.likesCount, p.commentsCount, pi.imageUrl
      FROM posts p
      JOIN post_images pi ON p.id = pi.postId
      WHERE pi.orderIndex = 0
      ORDER BY p.likesCount DESC, p.createdAt DESC
      LIMIT ?
    `).all(limit);
    res.json(posts);
  } catch (error) {
    console.error('Get explore error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create post
router.post('/', authMiddleware, upload.array('images', 10), (req, res) => {
  try {
    const { caption, location } = req.body;
    const userId = req.user.userId;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    const postId = uuidv4();
    db.prepare(`INSERT INTO posts (id, userId, caption, location) VALUES (?, ?, ?, ?)`)
      .run(postId, userId, caption || '', location || null);

    const insertImage = db.prepare('INSERT INTO post_images (id, postId, imageUrl, orderIndex) VALUES (?, ?, ?, ?)');
    files.forEach((file, index) => {
      insertImage.run(uuidv4(), postId, `/uploads/${file.filename}`, index);
    });

    db.prepare('UPDATE users SET postsCount = postsCount + 1 WHERE id = ?').run(userId);

    const post = db.prepare(`
      SELECT p.*, u.username, u.fullName, u.avatar, u.isVerified
      FROM posts p JOIN users u ON p.userId = u.id WHERE p.id = ?
    `).get(postId);

    post.images = db.prepare('SELECT * FROM post_images WHERE postId = ? ORDER BY orderIndex').all(postId);
    post.user = { id: post.userId, username: post.username, fullName: post.fullName, avatar: post.avatar, isVerified: post.isVerified === 1 };
    post.isLiked = false;
    post.isSaved = false;

    res.status(201).json(post);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Like/unlike post
router.post('/:postId/like', authMiddleware, (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    const existing = db.prepare('SELECT * FROM likes WHERE postId = ? AND userId = ?').get(postId, userId);

    if (existing) {
      db.prepare('DELETE FROM likes WHERE postId = ? AND userId = ?').run(postId, userId);
      db.prepare('UPDATE posts SET likesCount = likesCount - 1 WHERE id = ?').run(postId);
      res.json({ liked: false });
    } else {
      db.prepare('INSERT INTO likes (id, postId, userId) VALUES (?, ?, ?)').run(uuidv4(), postId, userId);
      db.prepare('UPDATE posts SET likesCount = likesCount + 1 WHERE id = ?').run(postId);
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save/unsave post
router.post('/:postId/save', authMiddleware, (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    const existing = db.prepare('SELECT * FROM saved_posts WHERE postId = ? AND userId = ?').get(postId, userId);

    if (existing) {
      db.prepare('DELETE FROM saved_posts WHERE postId = ? AND userId = ?').run(postId, userId);
      res.json({ saved: false });
    } else {
      db.prepare('INSERT INTO saved_posts (id, postId, userId) VALUES (?, ?, ?)').run(uuidv4(), postId, userId);
      res.json({ saved: true });
    }
  } catch (error) {
    console.error('Save post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get comments
router.get('/:postId/comments', (req, res) => {
  try {
    const { postId } = req.params;
    const comments = db.prepare(`
      SELECT c.*, u.username, u.fullName, u.avatar
      FROM comments c JOIN users u ON c.userId = u.id
      WHERE c.postId = ? ORDER BY c.createdAt DESC LIMIT 20
    `).all(postId);
    res.json(comments);
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add comment
router.post('/:postId/comments', authMiddleware, (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId = req.user.userId;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const commentId = uuidv4();
    db.prepare('INSERT INTO comments (id, postId, userId, text) VALUES (?, ?, ?, ?)')
      .run(commentId, postId, userId, text.trim());
    db.prepare('UPDATE posts SET commentsCount = commentsCount + 1 WHERE id = ?').run(postId);

    const comment = db.prepare(`
      SELECT c.*, u.username, u.fullName, u.avatar
      FROM comments c JOIN users u ON c.userId = u.id WHERE c.id = ?
    `).get(commentId);

    res.status(201).json(comment);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's posts
router.get('/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const posts = db.prepare(`
      SELECT p.*, pi.imageUrl as firstImage
      FROM posts p LEFT JOIN post_images pi ON p.id = pi.postId AND pi.orderIndex = 0
      WHERE p.userId = ? ORDER BY p.createdAt DESC LIMIT 12
    `).all(userId);
    res.json(posts);
  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
