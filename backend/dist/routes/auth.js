"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const db_1 = __importDefault(require("../database/db"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, fullName } = req.body;
        // Validation
        if (!username || !email || !password) {
            res.status(400).json({ error: 'Username, email, and password are required' });
            return;
        }
        if (password.length < 6) {
            res.status(400).json({ error: 'Password must be at least 6 characters' });
            return;
        }
        // Check if user exists
        const existingUser = db_1.default.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existingUser) {
            res.status(409).json({ error: 'Username or email already exists' });
            return;
        }
        // Hash password
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        // Create user
        const userId = (0, uuid_1.v4)();
        const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
        db_1.default.prepare(`
      INSERT INTO users (id, username, email, password, fullName, avatar)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, username, email, hashedPassword, fullName || null, avatar);
        // Generate token
        const token = (0, auth_1.generateToken)(userId, username);
        // Return user data (without password)
        const newUser = db_1.default.prepare('SELECT id, username, email, fullName, avatar, bio, isVerified, followersCount, followingCount, postsCount, createdAt FROM users WHERE id = ?').get(userId);
        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: newUser
        });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }
        // Find user
        const user = db_1.default.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        // Check password
        const isValidPassword = await bcryptjs_1.default.compare(password, user.password);
        if (!isValidPassword) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        // Generate token
        const token = (0, auth_1.generateToken)(user.id, user.username);
        // Return user data (without password)
        const { password: _, ...userWithoutPassword } = user;
        res.json({
            message: 'Login successful',
            token,
            user: userWithoutPassword
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
