// backend/src/middleware/adminAuth.js
const User = require('../models/User');

module.exports = async function (req, res, next) {
    try {
        // Pastikan req.user ada (dari middleware auth sebelumnya)
        if (!req.user || !req.user.walletAddress) {
            console.log("No user data in request");
            return res.status(401).json({ msg: 'Authorization denied' });
        }

        console.log("Checking admin status for:", req.user.walletAddress);

        // Skip database check jika isAdmin sudah ada di token
        if (req.user.isAdmin) {
            console.log("User is admin according to token");
            return next();
        }

        const user = await User.findOne({ walletAddress: req.user.walletAddress });

        if (!user) {
            console.log("User not found in database");
            return res.status(404).json({ msg: 'User not found' });
        }

        // Periksa apakah user adalah admin
        if (!user.isAdmin) {
            console.log("User is not admin");
            return res.status(403).json({ msg: 'Access denied. Admin privileges required' });
        }

        console.log("Admin verified:", user.walletAddress);
        next();
    } catch (err) {
        console.error("Admin authorization error:", err);
        res.status(500).send('Server error');
    }
};