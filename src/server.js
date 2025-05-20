// src/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

// Init app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json({ extended: false }));
app.use(cors());

// Session middleware
app.use(session({
    secret: process.env.JWT_SECRET || 'your_jwt_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Static folder
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Define routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/concerts', require('./routes/concerts'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/blockchain', require('./routes/blockchain')); // Tambahkan route blockchain

// Basic route for testing
app.get('/', (req, res) => {
    res.json({ msg: 'Welcome to Concert NFT Tickets API' });
});

// MongoDB connection
const connectDB = require('./config/db');
connectDB();

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});