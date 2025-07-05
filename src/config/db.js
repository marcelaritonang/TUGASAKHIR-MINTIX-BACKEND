const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        // ✅ TAMBAHAN: Railway priority di awal
        const mongoURI = process.env.DATABASE_URL ||           // 🆕 Railway
            process.env.MONGO_URI ||              // Existing
            'mongodb://concert-mongodb:27017/concert_nft_tickets' ||  // Existing Docker
            'mongodb://localhost:27017/concert_nft_tickets';          // Existing Local

        console.log(`Mencoba koneksi ke MongoDB: ${mongoURI}`);

        const conn = await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log(`MongoDB Terhubung: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`Error koneksi MongoDB: ${error.message}`);
        // Jangan hentikan proses saat development
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
        return null;
    }
};

module.exports = connectDB;