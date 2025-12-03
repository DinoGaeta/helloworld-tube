# Hello World! Tube

Piattaforma video minimalista "Tube-style" con **Networks** - un sistema unico di reti collaborative tra creator.

## Stack
- Node.js, Express, Postgres, Prisma, S3 (MinIO), Docker

## Requisiti
- Docker & Docker Compose
- Node.js 18+ (per sviluppo locale senza Docker)

## 🌟 Feature Unica: Networks

A differenza di YouTube, Hello World! Tube permette ai creator di formare **Networks** (Reti) - gruppi curati di canali che collaborano insieme, simili alle reti televisive professionali.

**Caratteristiche:**
- **Caporete**: Creator principale che gestisce la rete
- **Membri**: Altri creator invitati o approvati
- **Tematiche**: Ogni rete ha uno o più tag (Tech, Gaming, Educazione, ecc.)
- **Candidature**: Sezione "Lavora con noi" per applicare
- **Inviti**: Il caporete può invitare creator direttamente
- **Algoritmo**: Suggerimenti automatici di creator compatibili
- **Profili**: Contatti professionali (email, telefono, social)

**Tipologie di Rete:**
- **Settoriale**: Creator dello stesso ambito (es. "Tech Reviewers Italia")
- **Eclettica**: Rete curata con canali di qualità su temi diversi

---

## Setup Veloce (Docker)

1. **Configura Env**:
   ```bash
   cp .env.example .env
   ```

2. **Avvia Stack**:
   ```bash
   docker-compose up -d
   ```

3. **Inizializza DB**:
   ```bash
   npx prisma migrate dev --name init
   ```

4. **Apri**: http://localhost:3000

## Sviluppo Locale (Senza Docker App)

1. Avvia servizi:
   ```bash
   docker-compose up -d postgres minio createbuckets
   ```
2. Installa dipendenze:
   ```bash
   npm install
   ```
3. Genera Prisma client:
   ```bash
   npx prisma generate
   ```
4. Migra DB:
   ```bash
   npx prisma migrate dev --name init
   ```
5. Avvia server:
   ```bash
   npm start
   ```

## Architettura
- **Backend**: Express.js
- **DB**: PostgreSQL (Prisma ORM)
- **Storage**: S3 API (MinIO dev, S3/R2 prod)
- **Auth**: DB sessions, HTTPOnly cookies
- **Upload**: Presigned URLs (direct to S3)
- **Stream**: Presigned GET redirect

## Sicurezza
- Helmet & Rate Limiting
- Input validation (Zod)
- CORS restricted
- No secrets in code

## Deploy
Vedi [DEPLOY.md](DEPLOY.md) per istruzioni Vercel + Supabase.

## Roadmap
- [x] Core platform (auth, upload, streaming)
- [/] Networks feature
- [ ] Recommendation algorithm refinement
- [ ] Analytics dashboard
- [ ] Mobile app

- Implementare HLS/ABR per streaming e thumbnail generator.
- Aggiungere verify email/reset password, moderazione e metriche.

## Prompt per Antigravity (eseguire nel progetto)
```
Sei l’agente Antigravity. Progetto: C:\Users\corra\Desktop\helloworld_tube
Leggi: package.json, server.js, prisma/schema.prisma, public/index.html, public/app.js, public/style.css, README.md.
Obiettivo: rifinire e completare la piattaforma Hello World! Tube per deploy.

Da fare (se non già fatto):
- Verifica .env con variabili: PORT, SESSION_SECRET, DATABASE_URL, PUBLIC_URL, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET.
- Esegui `npm install`, `npx prisma migrate dev --name init` (o deploy).
- Assicurati che l’upload usi presigned URL S3 (PUT) e che /api/videos/:id/stream rediriga a GET presignata.
- Controlla sicurezza: helmet, express-rate-limit, CORS ristretto, validation zod, cookie HTTPOnly.
- Testa signup/login/logout, upload, listing, stream, commenti.
- Docker: build app; usa docker-compose con Postgres + MinIO; aggiorna README se servono note.
Output: sistema funzionante su http://localhost:3000 con auth, upload su S3/MinIO, streaming, commenti.
```
