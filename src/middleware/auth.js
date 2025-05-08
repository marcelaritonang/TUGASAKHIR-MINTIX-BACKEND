// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function (req, res, next) {
    // Get token from header
    const token = req.header('x-auth-token');

    // Check if no token
    if (!token) {
        console.log("No token provided");
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Verify token
    try {
        console.log("Verifying token:", token);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
        req.user = decoded.user;
        console.log("Token verified for user:", req.user);
        next();
    } catch (err) {
        console.error("Token verification error:", err);
        res.status(401).json({ msg: 'Token is not valid' });
    }
};