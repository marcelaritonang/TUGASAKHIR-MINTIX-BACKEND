const fs = require('fs');
const path = require('path');
const { Connection, PublicKey } = require('@solana/web3.js');
const { Program, AnchorProvider, web3 } = require('@project-serum/anchor');
require('dotenv').config();

async function fetchAndSaveIdl() {
    try {
        console.log('Fetching IDL from Solana program...');

        const programId = new PublicKey(process.env.PROGRAM_ID);
        const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

        // Create dummy provider (without wallet) just for fetching IDL
        const provider = new AnchorProvider(
            connection,
            {
                publicKey: web3.Keypair.generate().publicKey,
                signTransaction: () => Promise.reject(),
                signAllTransactions: () => Promise.reject(),
            },
            { commitment: 'confirmed' }
        );

        // Fetch IDL
        const idl = await Program.fetchIdl(programId, provider);

        if (!idl) {
            throw new Error('Failed to fetch IDL');
        }

        // Ensure directory exists
        const targetDir = path.join(__dirname, '../idl');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Save IDL to file
        const idlPath = path.join(targetDir, 'concert_nft_tickets.json');
        fs.writeFileSync(idlPath, JSON.stringify(idl, null, 2));

        console.log(`IDL successfully saved to ${idlPath}`);
    } catch (error) {
        console.error('Error fetching IDL:', error);
        process.exit(1);
    }
}

fetchAndSaveIdl();