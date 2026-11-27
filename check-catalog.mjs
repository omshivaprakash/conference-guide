import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { streams, places, conferences } = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url)));
const { monthsOf, cadenceOf } = createRequire(import.meta.url)('./app.js');
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
  if (record.wikidata) assert.ok(/^Q[0-9]+$/.test(record.wikidata), `${at}: wikidata must be a Q id`);
  if (record.url) assert.equal(new URL(record.url).protocol, 'https:', `${at}: url must be https`);
  assert.ok(cadenceOf(record.every), `${at}: add a rule to cadenceOf for "${record.every}"`);
}
// Editions: every fact needs a source, and every person named should be in the people list.
const { editions, people } = JSON.parse(readFileSync(new URL('./data/editions.json', import.meta.url)));
const ids = new Set(conferences.map(record => record.id));
const https = url => new URL(url).protocol === 'https:';
assert.equal(new Set(editions.map(event => `${event.conference}-${event.year}`)).size, editions.length, 'one edition per conference and year');
for (const event of editions) {
  const at = `edition ${event.conference} ${event.year}`;
  assert.ok(ids.has(event.conference), `${at}: unknown conference`);
  assert.ok(Number.isInteger(event.year) && event.year > 1800 && event.year <= new Date().getFullYear() + 1, `${at}: year`);
  assert.ok(event.dates && event.sources.length && event.sources.every(https), `${at}: dates and https sources`);
  assert.ok(Array.isArray(event.sessions) && Array.isArray(event.awards), `${at}: sessions and awards must be lists`);
  for (const item of event.sessions) assert.ok(item.type && item.title && (!item.source || https(item.source)), `${at}: session ${item.title}`);
  for (const item of event.awards) assert.ok(item.award && item.to.length && (!item.source || https(item.source)), `${at}: award ${item.award}`);
  for (const name of event.sessions.flatMap(item => item.people || [])) assert.ok(people[name], `${at}: add ${name} to people`);
}
for (const [name, person] of Object.entries(people)) assert.ok(!person.wiki || !/\s|^https?:/.test(person.wiki), `${name}: wiki is an English Wikipedia title with underscores`);
for (const [city, [lon, lat]] of Object.entries(places)) assert.ok(Math.abs(lat) <= 90 && Math.abs(lon) <= 180, `${city} coordinates`);
for (const stream of streams) assert.ok(conferences.some(record => record.streams.includes(stream.id)), `stream ${stream.id} is empty`);
// monthsOf: ranges, wrap-around and lists
assert.deepEqual(monthsOf('August to October'), [7, 8, 9]);
assert.deepEqual(monthsOf('November to January'), [10, 11, 0]);
assert.deepEqual(monthsOf('March to April (Europe), November (North America)'), [2, 3, 10]);
assert.deepEqual(monthsOf('May'), [4]);
assert.equal(cadenceOf('Annual, host city changes'), 'Annual');
assert.equal(cadenceOf('Every two years, odd years'), 'Every two years');
assert.equal(cadenceOf('Every year or two (annual since 2024)'), 'Annual');
assert.equal(cadenceOf('Every two to three years (2024, then 2027)'), 'Irregular');
assert.equal(cadenceOf('Annual until 2023, on hold since'), 'On hold');
assert.equal(cadenceOf('Every four years'), 'Every four years');
console.log(`Validated ${conferences.length} conferences (${conferences.filter(record => record.region === 'India').length} in India) across ${streams.length} streams, and ${editions.length} editions naming ${Object.keys(people).length} people.`);
