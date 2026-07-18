const mockTx = { workflowEvent: { create: jest.fn() }, maintenanceWorkflow: { updateMany: jest.fn() } };
const mockPrisma = {
  workflowEvent: { create: jest.fn(), findMany: jest.fn() },
  maintenanceWorkflow: { updateMany: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
};
jest.mock('../../src/lib/prisma', () => mockPrisma);

const {
  transition, InvalidTransitionError, ConcurrentModificationError, getWorkflowHistory, maintenancePersist,
} = require('../../src/services/workflowEngine');

const TRANSITIONS = {
  A: ['B'],
  B: ['C', 'A'],
  C: [],
};

afterEach(() => jest.clearAllMocks());

describe('workflowEngine.transition', () => {
  it('allows a valid transition, persists it inside a transaction, and records a WorkflowEvent', async () => {
    const persist = jest.fn().mockResolvedValue({ id: 'wf-1', state: 'B' });

    const result = await transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
      fromState: 'A', toState: 'B', transitions: TRANSITIONS,
      actorType: 'AI', reason: 'triaged', persist,
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('A', 'B', mockTx);
    expect(result.state).toBe('B');
    expect(mockTx.workflowEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
        fromState: 'A', toState: 'B', actorType: 'AI', reason: 'triaged',
      }),
    });
  });

  it('reuses a caller-supplied tx instead of opening a new transaction', async () => {
    const callerTx = { workflowEvent: { create: jest.fn() } };
    const persist = jest.fn().mockResolvedValue({ id: 'wf-1', state: 'B' });

    await transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
      fromState: 'A', toState: 'B', transitions: TRANSITIONS,
      actorType: 'AI', persist, tx: callerTx,
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith('A', 'B', callerTx);
    expect(callerTx.workflowEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid transition and never persists, opens a transaction, or logs it', async () => {
    const persist = jest.fn();

    await expect(transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
      fromState: 'A', toState: 'C', transitions: TRANSITIONS,
      actorType: 'AI', persist,
    })).rejects.toBeInstanceOf(InvalidTransitionError);

    expect(persist).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.workflowEvent.create).not.toHaveBeenCalled();
  });

  it('allows any toState as the initial transition when fromState is null', async () => {
    const persist = jest.fn().mockResolvedValue({ id: 'wf-2', state: 'A' });

    await transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-2',
      fromState: null, toState: 'A', transitions: TRANSITIONS,
      actorType: 'SYSTEM', persist,
    });

    expect(persist).toHaveBeenCalledWith(null, 'A', mockTx);
  });

  it('rejects a transition out of a terminal state with no allowed transitions', async () => {
    const persist = jest.fn();

    await expect(transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
      fromState: 'C', toState: 'A', transitions: TRANSITIONS,
      actorType: 'AI', persist,
    })).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('propagates a ConcurrentModificationError from persist without writing a WorkflowEvent for it', async () => {
    const persist = jest.fn().mockRejectedValue(new ConcurrentModificationError('MaintenanceWorkflow', 'wf-1', 'A', 'B'));

    await expect(transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
      fromState: 'A', toState: 'B', transitions: TRANSITIONS,
      actorType: 'AI', persist,
    })).rejects.toBeInstanceOf(ConcurrentModificationError);

    expect(mockTx.workflowEvent.create).not.toHaveBeenCalled();
  });
});

describe('maintenancePersist', () => {
  it('updates only the row matching id + fromState and returns the result on success', async () => {
    mockTx.maintenanceWorkflow.updateMany.mockResolvedValue({ count: 1 });
    const persist = maintenancePersist('wf-1');

    await persist('A', 'B', mockTx);

    expect(mockTx.maintenanceWorkflow.updateMany).toHaveBeenCalledWith({
      where: { id: 'wf-1', state: 'A' },
      data: { state: 'B' },
    });
  });

  it('throws ConcurrentModificationError when no row matched (state already changed)', async () => {
    mockTx.maintenanceWorkflow.updateMany.mockResolvedValue({ count: 0 });
    const persist = maintenancePersist('wf-1');

    await expect(persist('A', 'B', mockTx)).rejects.toBeInstanceOf(ConcurrentModificationError);
  });

  it('omits the state guard for the initial transition (fromState null), since state=NULL never matches in SQL', async () => {
    mockTx.maintenanceWorkflow.updateMany.mockResolvedValue({ count: 1 });
    const persist = maintenancePersist('wf-2');

    await persist(null, 'INTAKE_RECEIVED', mockTx);

    expect(mockTx.maintenanceWorkflow.updateMany).toHaveBeenCalledWith({
      where: { id: 'wf-2' }, // no `state` filter
      data: { state: 'INTAKE_RECEIVED' },
    });
  });

  it('falls back to the top-level prisma client when no tx is given', async () => {
    mockPrisma.maintenanceWorkflow.updateMany.mockResolvedValue({ count: 1 });
    const persist = maintenancePersist('wf-1');

    await persist('A', 'B');

    expect(mockPrisma.maintenanceWorkflow.updateMany).toHaveBeenCalledWith({
      where: { id: 'wf-1', state: 'A' },
      data: { state: 'B' },
    });
  });
});

describe('getWorkflowHistory', () => {
  it('queries WorkflowEvent scoped by workflowType + workflowId, ordered chronologically', async () => {
    mockPrisma.workflowEvent.findMany.mockResolvedValue([{ id: 'evt-1' }]);
    const history = await getWorkflowHistory('MAINTENANCE', 'wf-1');
    expect(mockPrisma.workflowEvent.findMany).toHaveBeenCalledWith({
      where: { workflowType: 'MAINTENANCE', workflowId: 'wf-1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(history).toEqual([{ id: 'evt-1' }]);
  });
});
