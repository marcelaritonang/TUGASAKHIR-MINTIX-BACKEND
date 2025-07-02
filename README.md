# Sistem Backend NFT Tiket Konser Musik Berbasis Solana Blockchain

Backend aplikasi untuk minting dan manajemen NFT tiket konser musik menggunakan Smart Contract pada blockchain Solana.

## 📑 Deskripsi

Aplikasi ini adalah bagian dari proyek tugas akhir dengan judul **"MINTING NFT PADA SOLANA BLOCKCHAIN UNTUK TIKET KONSER MUSIK MENGGUNAKAN SMART CONTRACT BERBASIS WEB3.0"**. Backend ini menyediakan API yang menghubungkan aplikasi web dengan program smart contract pada blockchain Solana untuk memfasilitasi pembuatan, validasi, dan manajemen NFT yang berfungsi sebagai tiket konser yang aman dan tidak dapat dipalsukan.

## 🛠️ Teknologi Yang Digunakan

- **Node.js** - Runtime environment
- **Express.js** - Framework web untuk API
- **MongoDB** - Database untuk penyimpanan metadata
- **Solana Web3.js** - Library untuk interaksi dengan blockchain Solana
- **@solana/spl-token** - Library untuk operasi token Solana
- **Docker** - Containerization
- **JSON Web Token (JWT)** - Autentikasi dan otorisasi
- **Anchor** - Framework untuk pengembangan program Solana

## ✨ Fitur Utama

- **Manajemen Konser**: Membuat, mengubah, dan menghapus data konser
- **Minting NFT Tiket**: Membuat NFT yang berisi metadata tiket konser
- **Verifikasi Tiket**: Memvalidasi keaslian tiket dengan blockchain
- **Manajemen Pengguna**: Registrasi, login, dan manajemen profil
- **Integrasi Wallet**: Koneksi dengan wallet Solana
- **Antarmuka Admin**: Endpoint untuk manajemen konser oleh admin

## 🚀 Cara Menjalankan Aplikasi

### Prasyarat

- Node.js v16+ 
- Docker dan Docker Compose
- Solana CLI (opsional, untuk development)
- Phantom Wallet atau wallet Solana lainnya

### Langkah-langkah Instalasi (Pengembangan Lokal)

1. **Clone repository**

```bash
git clone https://github.com/username/concert-nft-tickets-backend.git
cd concert-nft-tickets-backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Setup file .env**

```bash
cp .env.example .env
# Edit file .env sesuai kebutuhan
```

4. **Jalankan dengan Docker Compose**

```bash
docker-compose up -d
```

5. **Atau jalankan tanpa Docker**

```bash
# Pastikan MongoDB berjalan
npm start
```

Server akan berjalan pada port yang ditentukan di file .env (default: 5000)

## 🔌 Struktur Proyek

```
├── src/
│   ├── config/         # Konfigurasi aplikasi
│   ├── controllers/    # Controller untuk endpoint API
│   ├── middleware/     # Middleware Express 
│   ├── models/         # Model data MongoDB
│   ├── routes/         # Definisi rute API
│   ├── utils/          # Fungsi utilitas
│   └── index.js        # Entry point aplikasi
├── scripts/            # Script utilitas
├── public/             # File publik dan uploads
├── idl/                # Interface Definition Language untuk Anchor
├── Dockerfile          # Konfigurasi Docker
├── docker-compose.yml  # Konfigurasi Docker Compose
└── package.json        # Dependensi dan scripts
```

## 🔗 API Endpoints

### Autentikasi

- `POST /api/auth/register` - Registrasi pengguna baru
- `POST /api/auth/login` - Login pengguna
- `GET /api/auth/me` - Mendapatkan info pengguna yang login

### Konser

- `GET /api/concerts` - Mendapatkan daftar konser
- `GET /api/concerts/:id` - Mendapatkan detail konser
- `POST /api/concerts` - Membuat konser baru (admin)
- `PUT /api/concerts/:id` - Mengupdate konser (admin)
- `DELETE /api/concerts/:id` - Menghapus konser (admin)

### Tiket

- `POST /api/tickets/mint` - Mint NFT tiket baru
- `GET /api/tickets` - Mendapatkan daftar tiket pengguna
- `GET /api/tickets/:id` - Mendapatkan detail tiket
- `POST /api/tickets/verify` - Verifikasi tiket

## 🔐 Integrasi Blockchain Solana

Backend ini terintegrasi dengan Solana blockchain melalui:

1. **Program Smart Contract** - Untuk minting dan verifikasi NFT
2. **Metadata Standard** - Menggunakan Metaplex Metadata Standard
3. **NFT Storage** - Metadata tiket disimpan dengan IPFS melalui NFT.Storage
4. **Transaction Handling** - Memproses transaksi blockchain dengan retry dan monitoring

## 🧪 Testing

```bash
# Menjalankan unit tests
npm test

# Menjalankan tests untuk integrasi blockchain
npm run test:blockchain
```

## 🚢 Deployment

Untuk deployment produksi, disarankan menggunakan VPS dengan Docker Compose. Lihat [DEPLOYMENT.md](DEPLOYMENT.md) untuk panduan lengkap deployment.

## 📝 Pengembangan

### Menambahkan Endpoint Baru

1. Buat controller baru di `src/controllers/`
2. Tambahkan route di `src/routes/`
3. Register route di `src/index.js`

### Modifikasi Model Data

1. Update schema di `src/models/`
2. Jalankan migrasi jika diperlukan

### Interaksi Dengan Smart Contract

Untuk berinteraksi dengan smart contract pada Solana:

1. Gunakan utilitas di `src/utils/blockchain.js`
2. Ikuti panduan di [BLOCKCHAIN_INTEGRATION.md](BLOCKCHAIN_INTEGRATION.md)

## 🤝 Kontribusi

Kontribusi sangat dihargai. Silakan buat pull request atau laporkan issue.

## 📄 Lisensi

[MIT](LICENSE)

## 👥 Kontak

- Pengembang: [Nama Anda]
- Email: [Email Anda]

---

**Catatan**: Proyek ini merupakan bagian dari tugas akhir. Penggunaan aplikasi ini untuk tujuan komersial memerlukan izin tertulis.
