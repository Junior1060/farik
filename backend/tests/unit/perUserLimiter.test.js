const express = require('express');
const request = require('supertest');
const { perUserCostLimiter } = require('../../src/middleware/rateLimiter');

// The signed-in user is chosen per request by header so one app (one limiter store)
// can be exercised as several accounts.
function buildApp() {
  const app = express();
  app.use((req, res, next) => {
    if (req.headers['x-user']) req.user = { id: req.headers['x-user'] };
    next();
  });
  app.post('/t', perUserCostLimiter, (req, res) => res.json({ ok: true }));
  return app;
}

describe('rateLimiter.perUserCostLimiter', () => {
  it('caps one account at 40 per window without throttling a different account on the same IP', async () => {
    const app = buildApp();
    let status;
    for (let i = 0; i < 40; i += 1) {
      ({ status } = await request(app).post('/t').set('x-user', 'tenant-a'));
      expect(status).toBe(200);
    }
    const blocked = await request(app).post('/t').set('x-user', 'tenant-a');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too often/i);

    const other = await request(app).post('/t').set('x-user', 'tenant-b');
    expect(other.status).toBe(200);
  }, 20000);
});
