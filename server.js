import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

// S3 Configuration
const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true, // Needed for MinIO
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const BUCKET_NAME = process.env.S3_BUCKET || 'videos';

// Ensure Bucket Exists
async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`Bucket '${BUCKET_NAME}' exists.`);
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log(`Bucket '${BUCKET_NAME}' not found. Creating...`);
      try {
        await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
        console.log(`Bucket '${BUCKET_NAME}' created.`);
      } catch (err) {
        console.error('Failed to create bucket:', err);
      }
    } else {
      console.error('Error checking bucket:', error);
    }
  }
}
ensureBucket();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", process.env.S3_ENDPOINT || "http://localhost:9000", "https://localhost:9000"],
      mediaSrc: ["'self'", process.env.S3_ENDPOINT || "http://localhost:9000", "https://localhost:9000"],
      imgSrc: ["'self'", "data:", "blob:", process.env.S3_ENDPOINT || "http://localhost:9000", "https://localhost:9000"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts if needed for simple frontend
    },
  },
}));
app.use(cors({
  origin: process.env.PUBLIC_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(express.static('public'));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Auth Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.cookies['hw_token'];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!session) {
      res.clearCookie('hw_token');
      return res.status(401).json({ error: 'Session invalid' });
    }

    req.user = session.user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Validation Schemas
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const videoSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  filename: z.string(),
  mimetype: z.string(),
  size: z.number()
});

const commentSchema = z.object({
  text: z.string().min(1)
});

// --- Routes ---

// Health Check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Auth
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, displayName } = signupSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: displayName || email.split('@')[0]
      }
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.errors?.[0]?.message || e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = uuidv4();
    await prisma.session.create({
      data: {
        token,
        userId: user.id
      }
    });

    res.cookie('hw_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({ ok: true, user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/logout', authMiddleware, async (req, res) => {
  const token = req.cookies['hw_token'];
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  res.clearCookie('hw_token');
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  const token = req.cookies['hw_token'];
  if (!token) return res.json({ user: null });

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true }
  });

  if (!session) {
    res.clearCookie('hw_token');
    return res.json({ user: null });
  }

  res.json({ user: { id: session.user.id, email: session.user.email, displayName: session.user.displayName } });
});

// Videos
app.get('/api/videos', async (req, res) => {
  try {
    // Get user's networks if authenticated
    let userNetworkIds = [];
    const token = req.cookies['hw_token'];

    if (token) {
      const session = await prisma.session.findUnique({
        where: { token },
        include: {
          user: {
            include: {
              memberships: {
                where: { status: 'active' },
                select: { networkId: true }
              }
            }
          }
        }
      });

      if (session) {
        userNetworkIds = session.user.memberships.map(m => m.networkId);
      }
    }

    // Fetch all videos with uploader info
    const allVideos = await prisma.video.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: {
          select: {
            displayName: true,
            memberships: {
              where: { status: 'active' },
              select: { networkId: true }
            }
          }
        }
      }
    });

    // Smart sorting: Network videos first, then others
    const sortedVideos = allVideos.sort((a, b) => {
      const aInNetwork = a.uploader.memberships.some(m => userNetworkIds.includes(m.networkId));
      const bInNetwork = b.uploader.memberships.some(m => userNetworkIds.includes(m.networkId));

      if (aInNetwork && !bInNetwork) return -1;
      if (!aInNetwork && bInNetwork) return 1;

      // Both in network or both not: sort by date
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Map to match frontend expectations
    const mapped = sortedVideos.map(v => ({
      ...v,
      uploaderName: v.uploader.displayName,
      fromNetwork: v.uploader.memberships.some(m => userNetworkIds.includes(m.networkId))
    }));

    res.json(mapped);
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ error: 'Error loading feed' });
  }
});

app.get('/api/videos/:id', async (req, res) => {
  const video = await prisma.video.findUnique({
    where: { id: req.params.id },
    include: { uploader: { select: { displayName: true } } }
  });
  if (!video) return res.status(404).json({ error: 'Video not found' });

  res.json({ ...video, uploaderName: video.uploader.displayName });
});

// Upload Flow
app.post('/api/upload-url', authMiddleware, async (req, res) => {
  try {
    const { filename, mimetype } = req.body;
    if (!filename || !mimetype) return res.status(400).json({ error: 'Missing file info' });

    const key = `${uuidv4()}-${filename}`;
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: mimetype,
    });

    let url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    // Hack for local MinIO: force HTTP if endpoint is HTTP
    if (process.env.S3_ENDPOINT && process.env.S3_ENDPOINT.startsWith('http://')) {
      url = url.replace('https://', 'http://');
    }

    res.json({ url, key });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

app.post('/api/videos', authMiddleware, async (req, res) => {
  try {
    const data = videoSchema.parse(req.body);

    const video = await prisma.video.create({
      data: {
        ...data,
        uploaderId: req.user.id
      }
    });

    res.json({ ok: true, video });
  } catch (e) {
    res.status(400).json({ error: e.errors?.[0]?.message || e.message });
  }
});

// Stream
app.get('/api/videos/:id/stream', async (req, res) => {
  try {
    const video = await prisma.video.findUnique({ where: { id: req.params.id } });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: video.filename
    });

    let url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    console.log('Original Stream URL:', url);

    // Force HTTP for local MinIO
    if (url.includes('localhost:9000')) {
      url = url.replace('https://', 'http://');
    }

    console.log('Final Stream URL:', url);

    // Increment views (fire and forget)
    prisma.video.update({
      where: { id: video.id },
      data: { views: { increment: 1 } }
    }).catch(console.error);

    // Redirect to the S3 URL
    res.redirect(url);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Stream error' });
  }
});

// Comments
app.get('/api/videos/:id/comments', async (req, res) => {
  const comments = await prisma.comment.findMany({
    where: { videoId: req.params.id },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { displayName: true } } }
  });

  const mapped = comments.map(c => ({
    ...c,
    userName: c.user.displayName
  }));

  res.json(mapped);
});

app.post('/api/videos/:id/comments', authMiddleware, async (req, res) => {
  try {
    const { text } = commentSchema.parse(req.body);

    const comment = await prisma.comment.create({
      data: {
        text,
        videoId: req.params.id,
        userId: req.user.id
      },
      include: { user: { select: { displayName: true } } }
    });

    res.json({
      ok: true,
      comment: { ...comment, userName: comment.user.displayName }
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ===== NETWORKS FEATURE =====
import { setupNetworkRoutes } from './server_networks.js';
setupNetworkRoutes(app, prisma, authMiddleware);

// Export for Vercel
export default app;

// Start server only if run directly (not imported)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
