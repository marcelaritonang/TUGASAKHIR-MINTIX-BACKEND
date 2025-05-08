// Simpan sebagai scripts/check-concert.js
const mongoose = require('mongoose');
const Concert = require('../src/models/Concert');
require('dotenv').config();

// Koneksi ke MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/concert_nft_tickets');
        console.log('Terhubung ke MongoDB');
        return true;
    } catch (err) {
        console.error('Error koneksi MongoDB:', err.message);
        return false;
    }
};

// Function untuk memeriksa concert
const checkConcert = async (concertId) => {
    try {
        // ID yang ingin diperiksa
        const id = concertId || '6815da3c6e33f2662e044a0d'; // Ganti dengan ID yang Anda gunakan

        // Koneksi ke database
        const connected = await connectDB();
        if (!connected) {
            console.error('Gagal terhubung ke database');
            return;
        }

        // Cek validitas ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.log('Format ID tidak valid');
            await mongoose.disconnect();
            return;
        }

        // Cari concert
        const concert = await Concert.findById(id);

        if (concert) {
            console.log('Concert ditemukan:');
            console.log(`- ID: ${concert._id}`);
            console.log(`- Nama: ${concert.name}`);
            console.log(`- Venue: ${concert.venue}`);
            console.log(`- Status: ${concert.status}`);
            console.log(`- Creator: ${concert.creator}`);
        } else {
            console.log('Concert tidak ditemukan dengan ID:', id);

            // Cek apakah ada concert lain
            const allConcerts = await Concert.find();
            console.log(`Total concert di database: ${allConcerts.length}`);

            if (allConcerts.length > 0) {
                console.log('Contoh ID yang ada:');
                allConcerts.slice(0, 3).forEach(c => {
                    console.log(`- ${c._id} (${c.name})`);
                });
            }
        }

        await mongoose.disconnect();
        console.log('Pemeriksaan selesai');
    } catch (err) {
        console.error('Error:', err);
    }
};

// Jalankan function
const args = process.argv.slice(2);
checkConcert(args[0]);