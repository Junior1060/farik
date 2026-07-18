const express = require('express');
const request = require('supertest');
const { authLimiter } = require('../../src/middleware/rateLimiter');

function buildApp(limiter) {
  const app = express();
  app.post('/test', limiter, (req, res) => res.json({ ok: true }));
  return app;
}

describe('rateLimiter.authLimiter', () => {
  it('allows requests under the limit and rejects with 429 once exceeded', async () => {
    const app = buildApp(authLimiter);
    let lastStatus;
    for (let i = 0; i < 21; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/test');
      lastStatus = res.status;
      if (res.status === 429) break;
    }
    expect(lastStatus).toBe(429);
  }, 15000);
});
