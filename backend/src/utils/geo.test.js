const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { distanceMetres, checkGeofence } = require('./geo');

describe('geo', () => {
  it('computes short distance', () => {
    // ~111m per 0.001 deg latitude near equator approximation is rough; Kampala-ish
    const d = distanceMetres(0.3476, 32.5825, 0.3486, 32.5825);
    assert.ok(d > 90 && d < 130, `distance ${d}`);
  });

  it('rejects outside geofence', () => {
    const r = checkGeofence(0.35, 32.58, 0.3476, 32.5825, 50);
    assert.equal(r.ok, false);
  });

  it('allows when site has no GPS', () => {
    const r = checkGeofence(0.35, 32.58, null, null, 150);
    assert.equal(r.ok, true);
    assert.ok(r.warning);
  });

  it('rejects missing user GPS', () => {
    const r = checkGeofence(null, null, 0.3476, 32.5825, 150);
    assert.equal(r.ok, false);
  });
});
