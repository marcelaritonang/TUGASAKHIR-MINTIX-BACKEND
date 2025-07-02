// routes/auth.js - GANTI DENGAN VERSI YANG DIPERBAIKI
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

// @route   POST /api/auth/login-test
// @desc    Test login route (only for testing)
// @access  Public
router.post('/login-test', authController.loginTest);

// TAMBAHKAN: Route yang hilang - menyebabkan 404 error
// @route   GET /api/auth/validate
// @desc    Validate authentication token
// @access  Private
router.get('/validate', auth, async (req, res) => {
    try {
        console.log('🔍 Auth validation request from:', req.user?.walletAddress);

        // Check if user is authenticated via middleware
        if (!req.user || !req.user.walletAddress) {
            return res.status(401).json({
                success: false,
                msg: 'No valid token provided',
                isAuthenticated: false
            });
        }

        // Return successful validation
        res.json({
            success: true,
            isAuthenticated: true,
            user: {
                walletAddress: req.user.walletAddress,
                // Add other user data if needed from req.user
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Auth validation error:', error);
        res.status(500).json({
            success: false,
            msg: 'Server error during validation',
            isAuthenticated: false
        });
    }
});

// PERBAIKI: Admin check route (ada duplikasi di kode lama)
// @route   GET /api/auth/admin-check
// @desc    Check if user is admin
// @access  Private
router.get('/admin-check', auth, async (req, res) => {
    try {
        console.log('🔍 Admin check for:', req.user?.walletAddress);

        // Pastikan user sudah login
        if (!req.user) {
            return res.status(401).json({
                success: false,
                msg: 'No token, authorization denied',
                isAdmin: false
            });
        }

        // PERBAIKI: Import User model jika diperlukan
        let isAdmin = false;

        try {
            // Coba cari user di database jika ada User model
            const User = require('../models/User');
            const user = await User.findOne({ walletAddress: req.user.walletAddress });

            if (user) {
                isAdmin = user.isAdmin || false;
            }
        } catch (userError) {
            console.warn('⚠️ User model not found or error, using default admin check');

            // Fallback: Check if wallet address is in admin list
            const adminWallets = process.env.ADMIN_WALLETS?.split(',') || [];
            isAdmin = adminWallets.includes(req.user.walletAddress);
        }

        // Return admin status
        res.json({
            success: true,
            isAdmin: isAdmin,
            walletAddress: req.user.walletAddress
        });

    } catch (err) {
        console.error('❌ Admin check error:', err.message);
        res.status(500).json({
            success: false,
            msg: 'Server error',
            isAdmin: false
        });
    }
});

// TAMBAHKAN: Route untuk logout (optional tapi berguna)
// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', auth, (req, res) => {
    try {
        console.log('👋 User logout:', req.user?.walletAddress);

        // Since JWT is stateless, just return success
        // Client should remove token from localStorage
        res.json({
            success: true,
            msg: 'Logged out successfully'
        });
    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({
            success: false,
            msg: 'Server error during logout'
        });
    }
});

// Simple test route - for debugging
router.get('/test', (req, res) => {
    console.log('🧪 Auth test route called');
    res.json({
        success: true,
        msg: 'Auth route works!',
        timestamp: new Date().toISOString()
    });
});

// TAMBAHKAN: Health check route
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'auth',
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;