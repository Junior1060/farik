const { z } = require('zod');
const prisma = require('../lib/prisma');
const appointmentService = require('../services/appointmentService');

const confirmSchema = z.object({
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  entryPermissionGranted: z.boolean().optional(),
});

async function assertLandlordOwnsAppointment(landlordId, appointmentId) {
  return prisma.appointment.findFirst({
    where: { id: appointmentId, maintenanceRequest: { unit: { property: { landlordId } } } },
    include: { maintenanceRequest: { include: { workflow: true } } },
  });
}

const getForRequest = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const appointments = await prisma.appointment.findMany({
      where: { maintenanceRequestId: req.params.maintenanceRequestId, maintenanceRequest: { unit: { property: { landlordId } } } },
      include: { vendor: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ appointments });
  } catch (err) {
    next(err);
  }
};

const confirm = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const data = confirmSchema.parse(req.body);
    const appointment = await assertLandlordOwnsAppointment(landlordId, req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    const updated = await appointmentService.confirmAppointment(req.params.id, {
      scheduledStart: new Date(data.scheduledStart),
      scheduledEnd: new Date(data.scheduledEnd),
      entryPermissionGranted: data.entryPermissionGranted,
    });
    res.json({ appointment: updated });
  } catch (err) {
    next(err);
  }
};

const complete = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const appointment = await assertLandlordOwnsAppointment(landlordId, req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    await appointmentService.markCompleted(appointment.maintenanceRequest.workflow.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const noShow = async (req, res, next) => {
  try {
    const landlordId = req.user.landlordProfile.id;
    const appointment = await assertLandlordOwnsAppointment(landlordId, req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    await appointmentService.markNoShow(appointment.maintenanceRequest.workflow.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { getForRequest, confirm, complete, noShow };
