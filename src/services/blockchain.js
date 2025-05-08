//services/blockchain.js
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program, AnchorProvider, web3, BN } = require('@project-serum/anchor');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Pastikan path IDL benar (sesuaikan dengan lokasi file IDL Anda)
const idlPath = path.join(__dirname, '../../idl/concert_nft_tickets.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

class BlockchainService {
    constructor() {
        this.connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
        this.programId = new PublicKey(process.env.PROGRAM_ID);
    }

    async initializeProvider(wallet) {
        const provider = new AnchorProvider(
            this.connection,
            wallet,
            { commitment: 'confirmed' }
        );
        this.program = new Program(idl, this.programId, provider);
        return this.program;
    }

    async createConcert(wallet, name, venue, date, totalTickets) {
        try {
            const program = await this.initializeProvider(wallet);
            const concert = web3.Keypair.generate();

            // Panggil smart contract
            const tx = await program.methods
                .initializeConcert(name, venue, date, totalTickets)
                .accounts({
                    authority: wallet.publicKey,
                    concert: concert.publicKey,
                    systemProgram: web3.SystemProgram.programId,
                })
                .signers([concert])
                .rpc();

            console.log('Transaction signature:', tx);

            return {
                tx,
                concertAddress: concert.publicKey.toString(),
                concertKeypair: concert.secretKey
            };
        } catch (error) {
            console.error('Blockchain createConcert error:', error);
            throw error;
        }
    }

    async createTicket(wallet, concertPublicKey, ticketType, seatNumber = null) {
        try {
            const program = await this.initializeProvider(wallet);
            const mint = web3.Keypair.generate();
            const ticket = web3.Keypair.generate();

            // Initialize mint
            const mintIx = await program.methods
                .initializeMint()
                .accounts({
                    authority: wallet.publicKey,
                    buyer: wallet.publicKey,
                    mint: mint.publicKey,
                    tokenAccount: wallet.publicKey,
                    tokenProgram: web3.SYSVAR_RENT_PUBKEY,
                    systemProgram: web3.SystemProgram.programId,
                    rent: web3.SYSVAR_RENT_PUBKEY
                })
                .instruction();

            // Create ticket
            const tx = await program.methods
                .createTicket(ticketType, seatNumber)
                .accounts({
                    authority: wallet.publicKey,
                    buyer: wallet.publicKey,
                    concert: new PublicKey(concertPublicKey),
                    mint: mint.publicKey,
                    tokenAccount: wallet.publicKey,
                    ticket: ticket.publicKey,
                    tokenProgram: web3.SYSVAR_RENT_PUBKEY,
                    systemProgram: web3.SystemProgram.programId
                })
                .signers([mint, ticket])
                .rpc();

            console.log('Ticket created with signature:', tx);

            return {
                tx,
                ticketAddress: ticket.publicKey.toString(),
                mintAddress: mint.publicKey.toString()
            };
        } catch (error) {
            console.error('Blockchain createTicket error:', error);
            throw error;
        }
    }

    async useTicket(wallet, ticketPublicKey) {
        try {
            const program = await this.initializeProvider(wallet);

            const tx = await program.methods
                .useTicket()
                .accounts({
                    authority: wallet.publicKey,
                    ticket: new PublicKey(ticketPublicKey)
                })
                .rpc();

            console.log('Ticket used with signature:', tx);

            return {
                tx,
                success: true
            };
        } catch (error) {
            console.error('Blockchain useTicket error:', error);
            throw error;
        }
    }
}

module.exports = new BlockchainService();