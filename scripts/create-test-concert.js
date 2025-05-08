// backend/scripts/create-test-concert.js
// Run with: node backend/scripts/create-test-concert.js

const mongoose = require('mongoose');
const Concert = require('../src/models/Concert');
const User = require('../src/models/User');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
    try {
        // Try localhost connection first
        // Ini adalah alamat yang benar untuk koneksi antar container dalam Docker
        const mongoURI = 'mongodb://concert-mongodb:27017/concert_nft_tickets';
        console.log(`Connecting to MongoDB at ${mongoURI}`);

        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');
        return true;
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        return false;
    }
};

// Create a test concert
const createTestConcert = async () => {
    try {
        // Connect to database
        const connected = await connectDB();
        if (!connected) {
            console.error('Failed to connect to database');
            return;
        }

        // Create admin user if it doesn't exist
        const adminWallet = '2upQ693dMu2PEdBp6JKnxRBWEimdbmbgNCvncbasP6TU';
        let adminUser = await User.findOne({ walletAddress: adminWallet });

        if (!adminUser) {
            adminUser = new User({
                walletAddress: adminWallet,
                isAdmin: true,
                lastLogin: new Date()
            });

            await adminUser.save();
            console.log('Created admin user with wallet:', adminWallet);
        }

        // Create a test concert
        const testConcert = new Concert({
            name: "Rock Festival 2025",
            venue: "Gelora Bung Karno",
            date: new Date("2025-08-20T19:00:00.000Z"),
            description: "Festival rock terbesar di Indonesia",
            category: "Rock",
            creator: adminWallet,
            sections: [
                {
                    name: "VIP",
                    price: 500000,
                    totalSeats: 200,
                    availableSeats: 200
                },
                {
                    name: "Regular",
                    price: 200000,
                    totalSeats: 800,
                    availableSeats: 800
                }
            ],
            totalTickets: 1000,
            ticketsSold: 0,
            status: 'pending' // Set status as pending
        });

        await testConcert.save();
        console.log('Created test concert with ID:', testConcert._id);
        console.log('Concert details:');
        console.log(`- Name: ${testConcert.name}`);
        console.log(`- Venue: ${testConcert.venue}`);
        console.log(`- Status: ${testConcert.status}`);

        // Disconnect from database
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    } catch (err) {
        console.error('Error creating test concert:', err);
    }
};

// Run the function
createTestConcert();