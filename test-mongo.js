const mongoose = require('mongoose');

async function testConnection() {
  try {
    const mongoURI = 'mongodb://concert-mongodb:27017/concert_nft_tickets';
    console.log('Mencoba koneksi ke:', mongoURI);
    
    await mongoose.connect(mongoURI);
    console.log('Koneksi MongoDB berhasil!');
    
    // Hitung dokumen (opsional)
    const collections = await mongoose.connection.db.collections();
    console.log('Collections yang tersedia:', collections.map(c => c.collectionName));
    
    mongoose.connection.close();
  } catch (err) {
    console.error('Error koneksi MongoDB:', err.message);
  }
}

testConnection();
