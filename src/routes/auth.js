//routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// @route   GET /api/auth/nonce
// @desc    Get nonce for signing
// @access  Public
router.get('/nonce', authController.getNonce);

// @route   POST /api/auth/login
// @desc    Login with wallet
// @access  Public
router.post('/login', authController.login);

// @route   GET /api/auth/admin-check
// @desc    Check if user is admin
// @access  Private
router.get('/admin-check', auth, authController.checkAdmin);

// @route   POST /api/auth/login-test
// @desc    Test login route (only for testing)
// @access  Public
router.post('/login-test', authController.loginTest);

// Simple test route - for debugging
router.get('/test', (req, res) => {
    res.json({ msg: 'Auth route works!' });
});

// @route   GET /api/auth/admin-check
// @desc    Check if user is admin
// @access  Private
router.get('/admin-check', auth, async (req, res) => {
    try {
        // Pastikan user sudah login
        if (!req.user) {
            return res.status(401).json({ msg: 'No token, authorization denied' });
        }

        // Cari user berdasarkan wallet address
        const user = await User.findOne({ walletAddress: req.user.walletAddress });

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Return admin status
        res.json({ isAdmin: user.isAdmin });
    } catch (err) {
        console.error('Admin check error:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;