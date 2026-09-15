const { z } = require('zod');
const prisma = require('../lib/prisma');

const propertySchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  description: z.string().optional(),
});

const unitSchema = z.object({
  name: z.string().min(1),
  bedrooms: z.number().int().min(0).default(1),
  bathrooms: z.number().min(0).default(1),
  sqft: z.number().int().optional().nullable(),
  rentAmount: z.number().positive(),
  floor: z.number().int().optional().nullable(),
});

const getAll = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const properties = await prisma.property.findMany({
      where: { landlordId },
      include: { units: { orderBy: { name: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ properties });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const data = propertySchema.parse(req.body);
    const property = await prisma.property.create({
      data: { ...data, landlordId },
      include: { units: true },
    });
    res.status(201).json({ property });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const data = propertySchema.partial().parse(req.body);
    const existing = await prisma.property.findFirst({ where: { id: req.params.id, landlordId } });
    if (!existing) return res.status(404).json({ error: 'Property not found' });
    const property = await prisma.property.update({
      where: { id: req.params.id },
      data,
      include: { units: true },
    });
    res.json({ property });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const existing = await prisma.property.findFirst({ where: { id: req.params.id, landlordId } });
    if (!existing) return res.status(404).json({ error: 'Property not found' });
    await prisma.property.delete({ where: { id: req.params.id } });
    res.json({ message: 'Property deleted' });
  } catch (err) {
    next(err);
  }
};

const createUnit = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const property = await prisma.property.findFirst({ where: { id: req.params.propertyId, landlordId } });
    if (!property) return res.status(404).json({ error: 'Property not found' });
    const data = unitSchema.parse(req.body);
    const unit = await prisma.unit.create({
      data: { ...data, propertyId: req.params.propertyId },
    });
    res.status(201).json({ unit });
  } catch (err) {
    next(err);
  }
};

const updateUnit = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const existing = await prisma.unit.findFirst({
      where: { id: req.params.unitId, property: { landlordId } },
    });
    if (!existing) return res.status(404).json({ error: 'Unit not found' });
    const data = unitSchema.partial().parse(req.body);
    const unit = await prisma.unit.update({ where: { id: req.params.unitId }, data });
    res.json({ unit });
  } catch (err) {
    next(err);
  }
};

const removeUnit = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const existing = await prisma.unit.findFirst({
      where: { id: req.params.unitId, property: { landlordId } },
    });
    if (!existing) return res.status(404).json({ error: 'Unit not found' });
    await prisma.unit.delete({ where: { id: req.params.unitId } });
    res.json({ message: 'Unit deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, create, update, remove, createUnit, updateUnit, removeUnit };
