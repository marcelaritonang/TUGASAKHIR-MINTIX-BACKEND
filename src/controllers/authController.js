// file controllers/authController.js
const jwt = require('jsonwebtoken');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const User = require('../models/User');
const { TextEncoder } = require('util');
require('dotenv').config();

// Generate nonce for wallet signing
exports.getNonce = async (req, res) => {
    const nonce = Math.floor(Math.random() * 1000000).toString();
    // In a production app, store this in Redis or a session store
    req.session = req.session || {};
    req.session.nonce = nonce;
    res.json({ nonce });
};

// Login with wallet
exports.login = async (req, res) => {
    try {
        const { wallet_address, signature, message } = req.body;

        // Verify wallet signature
        const messageUint8 = new TextEncoder().encode(message);
        const signatureUint8 = bs58.decode(signature);
        const publicKeyUint8 = bs58.decode(wallet_address);

        const verified = nacl.sign.detached.verify(
            messageUint8,
            signatureUint8,
            publicKeyUint8
        );

        if (!verified) {
            return res.status(401).json({ msg: 'Invalid signature' });
        }

        // Find or create user
        let user = await User.findOne({ walletAddress: wallet_address });

        if (!user) {
            user = new User({
                walletAddress: wallet_address,
                isAdmin: false // Default non-admin
            });
            await user.save();
        }

        // Update last login
        user.lastLogin = Date.now();
        await user.save();

        // Generate JWT token
        const payload = {
            user: {
                id: user.id,
                walletAddress: user.walletAddress,
                isAdmin: user.isAdmin
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'your_jwt_secret_key',
            { expiresIn: '24h' },
            (err, token) => {
                if (err) throw err;
                res.json({ token });
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// Check admin status
exports.checkAdmin = async (req, res) => {
    try {
        const user = await User.findOne({ walletAddress: req.user.walletAddress });

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.json({ isAdmin: user.isAdmin });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// Test login route - ONLY FOR TESTING!
exports.loginTest = async (req, res) => {
    try {
        const { wallet_address } = req.body;

        if (!wallet_address) {
            return res.status(400).json({ msg: 'Wallet address required' });
        }

        console.log("Login test for wallet:", wallet_address);

        // Find or create user
        let user = await User.findOne({ walletAddress: wallet_address });

        if (!user) {
            console.log("Creating new user with wallet:", wallet_address);
            user = new User({
                walletAddress: wallet_address,
                isAdmin: true // Make admin for testing
            });
            await user.save();
        } else {
            console.log("User found:", user);
            // Ensure user is admin
            if (!user.isAdmin) {
                user.isAdmin = true;
                await user.save();
                console.log("Updated user to admin");
            }
        }

        // Generate JWT token
        const payload = {
            user: {
                id: user.id,
                walletAddress: user.walletAddress,
                isAdmin: user.isAdmin
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'your_jwt_secret_key',
            { expiresIn: '24h' },
            (err, token) => {
                if (err) {
                    console.error("JWT sign error:", err);
                    throw err;
                }
                console.log("Generated token:", token);
                res.json({ token });
            }
        );
    } catch (err) {
        console.error('Test login error:', err.message);
        res.status(500).send('Server error');
    }
};