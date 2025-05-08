const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Definisikan skema concert secara sederhana (versi mini dari model asli)
const ConcertSchema = new Schema({
  name: String,
  venue: String,
  date: Date,
  description: String,
  creator: String,
  status: String,
  sections: Array,
  approvalHistory: Array
});

async function checkConcerts() {
  try {
    const mongoURI = 'mongodb://concert-mongodb:27017/concert_nft_tickets';
    console.log('Mencoba koneksi ke:', mongoURI);
    
    await mongoose.connect(mongoURI);
    console.log('Koneksi MongoDB berhasil!');
    
    // Buat model temporary
    const Concert = mongoose.model('Concert', ConcertSchema);
    
    // Cek semua concert
    const concerts = await Concert.find();
    console.log(`Total concert ditemukan: ${concerts.length}`);
    
    if (concerts.length > 0) {
      console.log('\nDaftar concert:');
      concerts.forEach((concert, i) => {
        console.log(`\n${i+1}. ID: ${concert._id}`);
        console.log(`   Nama: ${concert.name}`);
        console.log(`   Status: ${concert.status}`);
        console.log(`   Creator: ${concert.creator}`);
      });
    } else {
      console.log('Tidak ada concert dalam database.');
    }
    
    // Tambahkan concert pengujian jika tidak ada
    if (concerts.length === 0) {
      console.log('\nMenambahkan concert pengujian...');
      
      const testConcert = new Concert({
        name: "Konser Test 2025",
        venue: "Gelora Bung Karno",
        date: new Date("2025-08-20"),
        description: "Konser pengujian untuk debugging",
        creator: "2upQ693dMu2PEdBp6JKnxRBWEimdbmbgNCvncbasP6TU",
        status: "pending",
        sections: [
          {
            name: "VIP",
            price: 500000,
            totalSeats: 200,
            availableSeats: 200
          }
        ]
      });
      
      await testConcert.save();
      console.log(`Concert pengujian ditambahkan dengan ID: ${testConcert._id}`);
      console.log('Gunakan ID ini untuk pengujian endpoint approval');
    }
    
    mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkConcerts();
