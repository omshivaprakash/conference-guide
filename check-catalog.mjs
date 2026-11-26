import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { streams, places, conferences } = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url)));
const { monthsOf } = createRequire(import.meta.url)('./app.js');
const MONTH = /January|February|March|April|May|June|July|August|September|October|November|December/;
const REGIONS = new Set(['India', 'Asia', 'Europe', 'North America', 'Latin America', 'Africa', 'Middle East', 'Oceania', 'Worldwide']);
const streamIds = new Set(streams.map(stream => stream.id));
assert.equal(streamIds.size, streams.length, 'stream ids must be unique');
assert.equal(new Set(conferences.map(record => record.id)).size, conferences.length, 'conference ids must be unique');
for (const record of conferences) {
  const at = `conference ${record.id}`;
  assert.ok(/^[a-z0-9-]+$/.test(record.id) && record.name && record.short && record.desc && record.every, at);
  assert.ok(record.streams.length && record.streams.every(id => streamIds.has(id)), `${at}: unknown stream`);
  assert.ok(REGIONS.has(record.region), `${at}: unknown region ${record.region}`);
  assert.equal(record.region === 'India', record.country === 'India', `${at}: India region and country must agree`);
  assert.ok(!record.city || places[record.city], `${at}: add ${record.city} to places`);
  assert.ok(record.city ? record.country : true, `${at}: a city needs a country`);
  assert.ok(MONTH.test(record.month) && monthsOf(record.month).length, `${at}: month must name a month`);
  if (record.since) assert.ok(record.since > 1800 && record.since <= new Date().getFullYear(), `${at}: since`);
  if (record.url) assert.equal(new URL(record.url).protocol, 'https:', `${at}: url must be https`);
}
for (const [city, [lon, lat]] of Object.entries(places)) assert.ok(Math.abs(lat) <= 90 && Math.abs(lon) <= 180, `${city} coordinates`);
for (const stream of streams) assert.ok(conferences.some(record => record.streams.includes(stream.id)), `stream ${stream.id} is empty`);
// monthsOf: ranges, wrap-around and lists
assert.deepEqual(monthsOf('August to October'), [7, 8, 9]);
assert.deepEqual(monthsOf('November to January'), [10, 11, 0]);
assert.deepEqual(monthsOf('March to April (Europe), November (North America)'), [2, 3, 10]);
assert.deepEqual(monthsOf('May'), [4]);
console.log(`Validated ${conferences.length} conferences (${conferences.filter(record => record.region === 'India').length} in India) across ${streams.length} streams.`);
