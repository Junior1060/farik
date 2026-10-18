const { assertProductionEnv, jwtSecretProblem } = require('../../src/config/env');

const STRONG = 'k'.repeat(48);

describe('assertProductionEnv', () => {
  it('does nothing outside production, even with an unusable secret', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'development', JWT_SECRET: 'secret' })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: 'test' })).not.toThrow();
  });

  it.each([
    ['missing', undefined, /not set/],
    ['the .env.example placeholder', 'REPLACE_ME_GENERATE_YOUR_OWN_SECRET', /placeholder/],
    ['the README example', 'super-secret-key-change-in-production', /placeholder/],
    ['the deployment-guide example', 'generate-a-long-random-string-here', /placeholder/],
    ['shorter than 32 characters', 'only-twenty-four-chars!!', /at least 32/],
  ])('refuses to boot in production when JWT_SECRET is %s', (_label, secret, expected) => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', JWT_SECRET: secret, FRONTEND_URL: 'https://app.farik.test' }))
      .toThrow(expected);
  });

  it('refuses to boot in production without FRONTEND_URL', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', JWT_SECRET: STRONG })).toThrow(/FRONTEND_URL/);
  });

  it('reports every problem at once so one restart fixes them all', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', JWT_SECRET: 'secret' }))
      .toThrow(/placeholder.*FRONTEND_URL/s);
  });

  it('boots with a strong secret and a frontend origin', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', JWT_SECRET: STRONG, FRONTEND_URL: 'https://app.farik.test' })).not.toThrow();
  });
});

describe('jwtSecretProblem', () => {
  it('returns null for an acceptable secret', () => {
    expect(jwtSecretProblem(STRONG)).toBeNull();
  });
});
