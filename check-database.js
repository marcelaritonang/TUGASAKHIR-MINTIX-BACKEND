// Simpan sebagai check-database.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Definisikan skema concert
const ConcertSchema = new Schema({
    name: String,
    venue: String,
    date: Date,
    description: String,
    category: String,
    creator: String,
    status: String,
    sections: Array,
    approvalHistory: Array
});

async function checkDatabase() {
    try {
        // Koneksi ke MongoDB menggunakan hostname container
        console.log('Mencoba koneksi ke MongoDB: mongodb://concert-mongodb:27017/concert_nft_tickets');
        await mongoose.connect('mongodb://concert-mongodb:27017/concert_nft_tickets');
        console.log('Koneksi ke MongoDB berhasil!');

        // Buat model
        const Concert = mongoose.model('Concert', ConcertSchema);

        // Cek semua concert
        const allConcerts = await Concert.find();
        console.log(`Total concert dalam database: ${allConcerts.length}`);

        // Cek concert berdasarkan status
        const pendingConcerts = await Concert.find({ status: 'pending' });
        const approvedConcerts = await Concert.find({ status: 'approved' });
        const rejectedConcerts = await Concert.find({ status: 'rejected' });

        console.log(`\n===== STATUS CONCERT =====`);
        console.log(`Pending: ${pendingConcerts.length}`);
        console.log(`Approved: ${approvedConcerts.length}`);
        console.log(`Rejected: ${rejectedConcerts.length}`);

        // Tampilkan detail concert pending
        if (pendingConcerts.length > 0) {
            console.log(`\n===== PENDING CONCERTS =====`);

            pendingConcerts.forEach((concert, index) => {
                console.log(`\n${index + 1}. ID: ${concert._id}`);
                console.log(`   Nama: ${concert.name}`);
                console.log(`   Venue: ${concert.venue}`);
                console.log(`   Creator: ${concert.creator}`);
                console.log(`   Status: ${concert.status}`);
            });
        }

        await mongoose.connection.close();
        console.log('\nKoneksi MongoDB ditutup');
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkDatabase();