const { z } = require('zod');
const prisma = require('../lib/prisma');
const agentService = require('../services/agentService');

const messageSchema = z.object({
  body: z.string().min(1),
});

const getConversations = async (req, res, next) => {
  try {
    let conversations;

    if (req.user.role === 'LANDLORD') {
      const landlordId = req.user.landlordProfile.id;
      const properties = await prisma.property.findMany({ where: { landlordId }, select: { id: true } });
      const propertyIds = properties.map((p) => p.id);

      // Get tenant IDs associated with this landlord
      const tenants = await prisma.tenantProfile.findMany({
        where: { leases: { some: { unit: { propertyId: { in: propertyIds } } } } },
        select: { id: true },
      });
      const tenantIds = tenants.map((t) => t.id);

      conversations = await prisma.conversation.findMany({
        where: { participants: { some: { tenantId: { in: tenantIds } } } },
        include: {
          participants: { include: { tenant: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      });
    } else {
      const tenantId = req.user.tenantProfile.id;
      conversations = await prisma.conversation.findMany({
        where: { participants: { some: { tenantId } } },
        include: {
          participants: { include: { tenant: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    res.json({ conversations });
  } catch (err) {
    next(err);
  }
};

const getThread = async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.conversationId },
      include: { participants: { include: { tenant: true } } },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    if (req.user.role === 'TENANT') {
      const isMember = conversation.participants.some((p) => p.tenantId === req.user.tenantProfile.id);
      if (!isMember) return res.status(403).json({ error: 'Access denied' });
    } else {
      const landlordId = req.user.landlordProfile.id;
      const properties = await prisma.property.findMany({ where: { landlordId }, select: { id: true } });
      const propertyIds = properties.map((p) => p.id);
      const participantTenantIds = conversation.participants.map((p) => p.tenantId);
      const owned = await prisma.tenantProfile.count({
        where: { id: { in: participantTenantIds }, leases: { some: { unit: { propertyId: { in: propertyIds } } } } },
      });
      if (!owned) return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.conversationId },
      include: {
        sender: {
          select: {
            id: true,
            role: true,
            landlordProfile: { select: { firstName: true, lastName: true } },
            tenantProfile: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ messages, conversation });
  } catch (err) {
    next(err);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const { body } = messageSchema.parse(req.body);
    const { conversationId } = req.params;

    // Create or use existing conversation
    let convId = conversationId;

    if (!convId || convId === 'new') {
      const { tenantId, subject } = req.body;
      if (!tenantId) return res.status(400).json({ error: 'tenantId required for new conversation' });

      const conv = await prisma.conversation.create({
        data: {
          subject: subject || null,
          participants: { create: { tenantId } },
        },
      });
      convId = conv.id;
    } else {
      const conv = await prisma.conversation.findUnique({
        where: { id: convId },
        include: { participants: true },
      });
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });

      if (req.user.role === 'TENANT') {
        const isMember = conv.participants.some((p) => p.tenantId === req.user.tenantProfile.id);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });
      } else {
        const landlordId = req.user.landlordProfile.id;
        const properties = await prisma.property.findMany({ where: { landlordId }, select: { id: true } });
        const propertyIds = properties.map((p) => p.id);
        const participantTenantIds = conv.participants.map((p) => p.tenantId);
        const owned = await prisma.tenantProfile.count({
          where: { id: { in: participantTenantIds }, leases: { some: { unit: { propertyId: { in: propertyIds } } } } },
        });
        if (!owned) return res.status(403).json({ error: 'Access denied' });
      }
    }

    const message = await prisma.message.create({
      data: { conversationId: convId, senderId: req.user.id, body },
      include: {
        sender: {
          select: {
            id: true,
            role: true,
            landlordProfile: { select: { firstName: true, lastName: true } },
            tenantProfile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    await prisma.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } });

    // Trigger AI response when tenant sends a message
    if (req.user.role === 'TENANT') {
      agentService.handleTenantMessage(message, convId).catch(console.error);
    }

    res.status(201).json({ message, conversationId: convId });
  } catch (err) {
    next(err);
  }
};

module.exports = { getConversations, getThread, sendMessage };
