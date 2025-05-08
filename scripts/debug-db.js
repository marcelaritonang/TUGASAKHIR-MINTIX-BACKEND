// backend/scripts/debug-db.js
// Run with: node backend/scripts/debug-db.js

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Concert = require('../src/models/Concert');
const User = require('../src/models/User');
const Ticket = require('../src/models/Ticket');

// Connect to MongoDB
const connectDB = async () => {
    try {
        // Try both connection strings
        let connection;

        // First try localhost
        try {
            console.log('Trying localhost MongoDB connection...');
            connection = await mongoose.connect('mongodb://localhost:27017/concert_nft_tickets', {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            console.log('Connected to localhost MongoDB');
        } catch (localError) {
            console.log('Localhost connection failed, trying Docker...');

            // Then try Docker
            try {
                connection = await mongoose.connect('mongodb://concert-mongodb:27017/concert_nft_tickets', {
                    useNewUrlParser: true,
                    useUnifiedTopology: true
                });
                console.log('Connected to Docker MongoDB');
            } catch (dockerError) {
                console.error('Both connection attempts failed:');
                console.error('Local error:', localError.message);
                console.error('Docker error:', dockerError.message);
                process.exit(1);
            }
        }

        return connection;
    } catch (error) {
        console.error(`MongoDB connection error: ${error.message}`);
        process.exit(1);
    }
};

// Debug function to check database contents
const debugDatabase = async () => {
    try {
        // Connect to database
        await connectDB();

        // Check Users collection
        console.log('\n--- USERS ---');
        const users = await User.find();
        console.log(`Found ${users.length} users`);
        users.forEach((user, index) => {
            console.log(`${index + 1}. Wallet: ${user.walletAddress} | Admin: ${user.isAdmin} | Last Login: ${user.lastLogin}`);
        });

        // Check Concerts collection
        console.log('\n--- CONCERTS ---');
        const concerts = await Concert.find();
        console.log(`Found ${concerts.length} concerts`);

        // Group by status
        const pendingConcerts = concerts.filter(c => c.status === 'pending');
        const approvedConcerts = concerts.filter(c => c.status === 'approved');
        const rejectedConcerts = concerts.filter(c => c.status === 'rejected');
        const infoRequestedConcerts = concerts.filter(c => c.status === 'info_requested');

        console.log(`- Pending: ${pendingConcerts.length}`);
        console.log(`- Approved: ${approvedConcerts.length}`);
        console.log(`- Rejected: ${rejectedConcerts.length}`);
        console.log(`- Info Requested: ${infoRequestedConcerts.length}`);

        // Print pending concert details
        if (pendingConcerts.length > 0) {
            console.log('\n--- PENDING CONCERTS DETAILS ---');
            pendingConcerts.forEach((concert, index) => {
                console.log(`${index + 1}. ID: ${concert._id}`);
                console.log(`   Name: ${concert.name}`);
                console.log(`   Venue: ${concert.venue}`);
                console.log(`   Date: ${concert.date}`);
                console.log(`   Creator: ${concert.creator}`);
                console.log(`   Sections: ${concert.sections.length}`);
            });
        }

        // Check Tickets collection
        console.log('\n--- TICKETS ---');
        const tickets = await Ticket.find();
        console.log(`Found ${tickets.length} tickets`);

        // Try to find specific concert by ID
        console.log('\n--- CONCERT ID TEST ---');
        const concertId = '6815da3c6e33f2662e044a0d'; // Replace with the ID from your test
        console.log(`Searching for concert with ID: ${concertId}`);

        try {
            const specificConcert = await Concert.findById(concertId);
            if (specificConcert) {
                console.log('Concert found:');
                console.log(`- Name: ${specificConcert.name}`);
                console.log(`- Status: ${specificConcert.status}`);
            } else {
                console.log('Concert not found. This explains the 404 error in your API.');

                // Check if it's a valid ObjectId format
                if (!mongoose.Types.ObjectId.isValid(concertId)) {
                    console.log('The ID is not a valid MongoDB ObjectId format.');
                }
            }
        } catch (err) {
            console.error('Error finding concert by ID:', err.message);
        }

        // Create a test admin user if none exists
        if (!users.some(user => user.isAdmin)) {
            console.log('\n--- CREATING TEST ADMIN USER ---');
            const testAdmin = new User({
                walletAddress: '2upQ693dMu2PEdBp6JKnxRBWEimdbmbgNCvncbasP6TU',
                isAdmin: true,
                lastLogin: new Date()
            });

            await testAdmin.save();
            console.log('Created test admin user with wallet: 2upQ693dMu2PEdBp6JKnxRBWEimdbmbgNCvncbasP6TU');
        }

        // Disconnect from database
        await mongoose.disconnect();
        console.log('\nDatabase check complete. Disconnected from MongoDB.');
    } catch (err) {
        console.error('Error in database debug:', err);
    }
};

// Run debug function
debugDatabase();