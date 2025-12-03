// Networks Feature - API Routes
// This file contains all Networks-related endpoints
// Import this into server.js

import { z } from 'zod';

// Validation Schemas
const networkSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    themes: z.array(z.string()).min(1).max(10),
    logoUrl: z.string().url().optional()
});

const invitationSchema = z.object({
    userId: z.string().uuid(),
    message: z.string().max(500).optional()
});

const applicationSchema = z.object({
    message: z.string().max(500).optional()
});

const profileSchema = z.object({
    phone: z.string().optional(),
    contactEmail: z.string().email().optional(),
    bio: z.string().max(1000).optional(),
    socialLinks: z.object({
        twitter: z.string().optional(),
        linkedin: z.string().optional(),
        instagram: z.string().optional(),
        website: z.string().url().optional()
    }).optional(),
    isPublicProfile: z.boolean().optional()
});

export function setupNetworkRoutes(app, prisma, authMiddleware) {

    // ===== NETWORKS CRUD =====

    // Create Network
    app.post('/api/networks', authMiddleware, async (req, res) => {
        try {
            const data = networkSchema.parse(req.body);

            const network = await prisma.network.create({
                data: {
                    ...data,
                    ownerId: req.user.id
                }
            });

            // Automatically create membership for owner
            await prisma.networkMembership.create({
                data: {
                    networkId: network.id,
                    userId: req.user.id,
                    role: 'owner',
                    status: 'active'
                }
            });

            res.json({ ok: true, network });
        } catch (e) {
            res.status(400).json({ error: e.errors?.[0]?.message || e.message });
        }
    });

    // List all Networks
    app.get('/api/networks', async (req, res) => {
        const networks = await prisma.network.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                owner: { select: { displayName: true } },
                _count: { select: { memberships: true } }
            }
        });

        res.json(networks);
    });

    // Get Network Details
    app.get('/api/networks/:id', async (req, res) => {
        const network = await prisma.network.findUnique({
            where: { id: req.params.id },
            include: {
                owner: { select: { id: true, displayName: true } },
                memberships: {
                    where: { status: 'active' },
                    include: {
                        user: { select: { id: true, displayName: true } }
                    }
                }
            }
        });

        if (!network) return res.status(404).json({ error: 'Network not found' });
        res.json(network);
    });

    // Update Network (owner only)
    app.patch('/api/networks/:id', authMiddleware, async (req, res) => {
        try {
            const network = await prisma.network.findUnique({ where: { id: req.params.id } });
            if (!network) return res.status(404).json({ error: 'Network not found' });
            if (network.ownerId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

            const data = networkSchema.partial().parse(req.body);
            const updated = await prisma.network.update({
                where: { id: req.params.id },
                data
            });

            res.json({ ok: true, network: updated });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    // Delete Network (owner only)
    app.delete('/api/networks/:id', authMiddleware, async (req, res) => {
        const network = await prisma.network.findUnique({ where: { id: req.params.id } });
        if (!network) return res.status(404).json({ error: 'Network not found' });
        if (network.ownerId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

        await prisma.network.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    });

    // ===== INVITATIONS =====

    // Send Invitation
    app.post('/api/networks/:id/invite', authMiddleware, async (req, res) => {
        try {
            const network = await prisma.network.findUnique({ where: { id: req.params.id } });
            if (!network) return res.status(404).json({ error: 'Network not found' });
            if (network.ownerId !== req.user.id) return res.status(403).json({ error: 'Only owner can invite' });

            const { userId, message } = invitationSchema.parse(req.body);

            // Check if already member
            const existing = await prisma.networkMembership.findUnique({
                where: { networkId_userId: { networkId: req.params.id, userId } }
            });
            if (existing) return res.status(400).json({ error: 'User already member' });

            const invitation = await prisma.networkInvitation.create({
                data: {
                    networkId: req.params.id,
                    invitedUserId: userId,
                    inviterId: req.user.id,
                    message
                }
            });

            res.json({ ok: true, invitation });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    // Accept/Reject Invitation
    app.patch('/api/invitations/:id', authMiddleware, async (req, res) => {
        const { action } = req.body; // "accept" or "reject"
        if (!['accept', 'reject'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }

        const invitation = await prisma.networkInvitation.findUnique({
            where: { id: req.params.id }
        });

        if (!invitation) return res.status(404).json({ error: 'Invitation not found' });
        if (invitation.invitedUserId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

        if (action === 'accept') {
            await prisma.networkMembership.create({
                data: {
                    networkId: invitation.networkId,
                    userId: req.user.id,
                    role: 'member',
                    status: 'active'
                }
            });

            await prisma.networkInvitation.update({
                where: { id: req.params.id },
                data: { status: 'accepted' }
            });
        } else {
            await prisma.networkInvitation.update({
                where: { id: req.params.id },
                data: { status: 'rejected' }
            });
        }

        res.json({ ok: true });
    });

    // ===== APPLICATIONS =====

    // Apply to Network
    app.post('/api/networks/:id/apply', authMiddleware, async (req, res) => {
        try {
            const { message } = applicationSchema.parse(req.body);

            // Check if already member
            const existing = await prisma.networkMembership.findUnique({
                where: { networkId_userId: { networkId: req.params.id, userId: req.user.id } }
            });
            if (existing) return res.status(400).json({ error: 'Already member' });

            const application = await prisma.networkApplication.create({
                data: {
                    networkId: req.params.id,
                    applicantId: req.user.id,
                    message
                }
            });

            res.json({ ok: true, application });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    // List Applications (owner only)
    app.get('/api/networks/:id/applications', authMiddleware, async (req, res) => {
        const network = await prisma.network.findUnique({ where: { id: req.params.id } });
        if (!network) return res.status(404).json({ error: 'Network not found' });
        if (network.ownerId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

        const applications = await prisma.networkApplication.findMany({
            where: { networkId: req.params.id, status: 'pending' },
            include: {
                applicant: { select: { id: true, displayName: true, bio: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(applications);
    });

    // Approve/Reject Application
    app.patch('/api/networks/:networkId/applications/:appId', authMiddleware, async (req, res) => {
        const { action } = req.body; // "approve" or "reject"
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }

        const network = await prisma.network.findUnique({ where: { id: req.params.networkId } });
        if (!network) return res.status(404).json({ error: 'Network not found' });
        if (network.ownerId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

        const application = await prisma.networkApplication.findUnique({
            where: { id: req.params.appId }
        });
        if (!application) return res.status(404).json({ error: 'Application not found' });

        if (action === 'approve') {
            await prisma.networkMembership.create({
                data: {
                    networkId: req.params.networkId,
                    userId: application.applicantId,
                    role: 'member',
                    status: 'active'
                }
            });

            await prisma.networkApplication.update({
                where: { id: req.params.appId },
                data: { status: 'approved' }
            });
        } else {
            await prisma.networkApplication.update({
                where: { id: req.params.appId },
                data: { status: 'rejected' }
            });
        }

        res.json({ ok: true });
    });

    // ===== MEMBERSHIPS =====

    // Remove Member (owner only)
    app.delete('/api/networks/:id/members/:userId', authMiddleware, async (req, res) => {
        const network = await prisma.network.findUnique({ where: { id: req.params.id } });
        if (!network) return res.status(404).json({ error: 'Network not found' });
        if (network.ownerId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
        if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself' });

        await prisma.networkMembership.delete({
            where: { networkId_userId: { networkId: req.params.id, userId: req.params.userId } }
        });

        res.json({ ok: true });
    });

    // ===== USER PROFILE =====

    // Update Profile
    app.patch('/api/users/profile', authMiddleware, async (req, res) => {
        try {
            const data = profileSchema.parse(req.body);

            const user = await prisma.user.update({
                where: { id: req.user.id },
                data
            });

            res.json({ ok: true, user });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    // View Profile
    app.get('/api/users/:id/profile', async (req, res) => {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                displayName: true,
                bio: true,
                phone: true,
                contactEmail: true,
                socialLinks: true,
                isPublicProfile: true,
                createdAt: true
            }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Hide contact info if profile is not public
        if (!user.isPublicProfile) {
            delete user.phone;
            delete user.contactEmail;
        }

        res.json(user);
    });

    // ===== RECOMMENDATIONS =====

    // Get Creator Suggestions (simple algorithm)
    app.get('/api/networks/:id/suggestions', authMiddleware, async (req, res) => {
        const network = await prisma.network.findUnique({
            where: { id: req.params.id },
            include: { memberships: { select: { userId: true } } }
        });

        if (!network) return res.status(404).json({ error: 'Network not found' });
        if (network.ownerId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

        // Get current member IDs
        const memberIds = network.memberships.map(m => m.userId);

        // Find creators with videos matching network themes
        const suggestions = await prisma.user.findMany({
            where: {
                id: { notIn: memberIds },
                videos: { some: {} } // Has at least one video
            },
            select: {
                id: true,
                displayName: true,
                bio: true,
                _count: { select: { videos: true } }
            },
            take: 10
        });

        res.json(suggestions);
    });
}
