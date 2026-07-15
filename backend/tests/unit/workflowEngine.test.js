const mockPrisma = { workflowEvent: { create: jest.fn(), findMany: jest.fn() } };
jest.mock('../../src/lib/prisma', () => mockPrisma);

const { transition, InvalidTransitionError, getWorkflowHistory } = require('../../src/services/workflowEngine');

const TRANSITIONS = {
  A: ['B'],
  B: ['C', 'A'],
  C: [],
};

afterEach(() => jest.clearAllMocks());

describe('workflowEngine.transition', () => {
  it('allows a valid transition, persists it, and records a WorkflowEvent', async () => {
    const persist = jest.fn().mockResolvedValue({ id: 'wf-1', state: 'B' });

    const result = await transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
      fromState: 'A', toState: 'B', transitions: TRANSITIONS,
      actorType: 'AI', reason: 'triaged', persist,
    });

    expect(persist).toHaveBeenCalledWith('B');
    expect(result.state).toBe('B');
    expect(mockPrisma.workflowEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
        fromState: 'A', toState: 'B', actorType: 'AI', reason: 'triaged',
      }),
    });
  });

  it('rejects an invalid transition and never persists or logs it', async () => {
    const persist = jest.fn();

    await expect(transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
      fromState: 'A', toState: 'C', transitions: TRANSITIONS,
      actorType: 'AI', persist,
    })).rejects.toBeInstanceOf(InvalidTransitionError);

    expect(persist).not.toHaveBeenCalled();
    expect(mockPrisma.workflowEvent.create).not.toHaveBeenCalled();
  });

  it('allows any toState as the initial transition when fromState is null', async () => {
    const persist = jest.fn().mockResolvedValue({ id: 'wf-2', state: 'A' });

    await transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-2',
      fromState: null, toState: 'A', transitions: TRANSITIONS,
      actorType: 'SYSTEM', persist,
    });

    expect(persist).toHaveBeenCalledWith('A');
  });

  it('rejects a transition out of a terminal state with no allowed transitions', async () => {
    const persist = jest.fn();

    await expect(transition({
      landlordId: 'landlord-1', workflowType: 'MAINTENANCE', workflowId: 'wf-1',
      fromState: 'C', toState: 'A', transitions: TRANSITIONS,
      actorType: 'AI', persist,
    })).rejects.toBeInstanceOf(InvalidTransitionError);
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
