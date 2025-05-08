// Perbarui file config/db.js dengan kode berikut
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        // Gunakan localhost untuk pengembangan lokal
        // Ini adalah alamat yang benar untuk koneksi antar container dalam Docker
        const mongoURI = 'mongodb://concert-mongodb:27017/concert_nft_tickets';

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