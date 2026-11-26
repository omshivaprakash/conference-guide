const byId = id => document.getElementById(id);
// Same layout as FilmFest and LitFest Guide: chips pick a stream (like a festival there); "All" opens the home page.
const streamTabs = { discover: 'Discover', list: 'Conferences', map: 'Map' };
const allTabs = { list: 'Conferences', map: 'Map' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let streamId = '';
let view = 'home';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, className, action) {
  const node = element('button', text, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
function source(url, label) {
  const link = element('a', label, 'source');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}
function options(select, values, defaultLabel) {
  const previous = select.value;
  select.replaceChildren(new Option(defaultLabel, ''), ...values.map(([value, label]) => new Option(label, value)));
  if (values.some(([value]) => value === previous)) select.value = previous;
}
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const number = value => value.toLocaleString('en-IN');
const initials = name => {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map(part => part[0]).join('') : words[0].slice(0, 3)).toUpperCase();
};
// "August to October" covers August, September and October; "March to April (Europe), November (…)" covers each named month and range.
function monthsOf(text) {
  const found = [];
  for (const part of text.split(/,/)) {
    const named = MONTHS.map((name, index) => [index, part.indexOf(name)]).filter(([, at]) => at >= 0).sort((a, b) => a[1] - b[1]).map(([index]) => index);
    if (named.length === 2 && / to /.test(part)) for (let i = named[0]; ; i = (i + 1) % 12) { found.push(i); if (i === named[1]) break; }
    else found.push(...named);
  }
  return [...new Set(found)];
}
const tally = (records, keysOf) => {
  const counts = new Map();
  for (const record of records) for (const key of keysOf(record)) counts.set(key, (counts.get(key) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

async function start() {
  const search = byId('search');
  const where = byId('where');
  const month = byId('month');
  const detail = byId('detail');
  const content = byId('detail-content');
  const results = byId('results');
  const response = await fetch('catalog.json');
  if (!response.ok) throw new Error('Catalogue unavailable');
  const { streams, places, conferences } = await response.json();
  const streamMap = new Map(streams.map(stream => [stream.id, stream]));
  for (const record of conferences) {
    record.months = monthsOf(record.month);
    // Rotating conferences sit at their country's centre on the map, or off the map when they move between countries.
    const point = record.city ? places[record.city] : POS[record.country];
    if (point) [record.lon, record.lat] = point;
  }
  const place = record => record.city ? `${record.city}, ${record.country}` : record.country ? `${record.country}, city changes` : 'Host country changes';
  const streamNames = record => record.streams.map(id => streamMap.get(id).name);
  const inStream = () => conferences.filter(record => !streamId || record.streams.includes(streamId));
  const previous = byId('previous');
  const next = byId('next');
  let items = [];
  let page = 0;
  let pageCount = 1;

  const chips = ['', ...streamMap.keys()].map(id => button(id ? streamMap.get(id).name : 'All', 'fchip', () => go(id, id ? 'discover' : 'home')));
  byId('festival-strip').append(...chips);

  // Detail sheet
  function open(title, category) {
    const heading = element('h2', title);
    heading.id = 'detail-title';
    content.replaceChildren(element('p', category, 'tag'), heading);
    if (!detail.open) detail.showModal();
    detail.scrollTop = 0;
  }
  function list(heading, values) {
    if (!values.length) return;
    const ul = element('ul');
    for (const value of values) {
      const li = element('li');
      li.append(value);
      ul.append(li);
    }
    content.append(element('h3', heading), ul);
  }
  function showConference(record) {
    open(record.name, streamNames(record).join(' · '));
    content.append(element('p', [place(record), `usually ${record.month}`, record.every, record.since && `since ${record.since}`].filter(Boolean).join(' · '), 'meta'));
    if (record.org) content.append(element('p', `Organised by ${record.org}`, 'meta'));
    content.append(element('p', record.desc));
    list('Links', [
      record.url ? source(record.url, 'Official website') : source(`https://duckduckgo.com/?q=${encodeURIComponent(record.name)}`, 'Search the web for its official site'),
      /^Q\d+$/.test(record.wikidata || '') && source(`https://www.wikidata.org/wiki/${record.wikidata}`, 'Wikidata')
    ].filter(Boolean));
    content.append(element('p', 'Dates and venues move. Check the official site before you plan travel or submit a paper.', 'meta'));
    const others = conferences.filter(other => other !== record && other.streams[0] === record.streams[0] && other.months.some(m => record.months.includes(m)));
    list('Same stream, same time of year', others.slice(0, 6).map(other => button(`${other.short} · ${other.city || other.country || 'rotates'}`, 'credit-link', () => showConference(other))));
  }
  function showAbout() {
    open('About Conference Guide', 'About');
    const G = 'https://github.com/omshivaprakash/conference-guide';
    const about = element('div', '', 'about');
    const section = (heading, ...parts) => {
      const p = element('p');
      for (const part of parts) p.append(Array.isArray(part) ? source(...part) : part);
      about.append(...(heading ? [element('h3', heading)] : []), p);
    };
    section('', `An independent, non-commercial guide to recurring conferences in India and around the world: ${number(conferences.length)} conferences across ${streams.length} streams, from technology and medicine to climate, design and the humanities. It is not affiliated with, endorsed by or sponsored by any conference.`);
    section('', 'It is the companion to ', ['https://omshivaprakash.github.io/litfest-speaker-guide/', 'LitFest Guide'], ' and ', ['https://omshivaprakash.github.io/filmfest-guide/', 'FilmFest Guide'], ', and is built the same way.');
    section('Where the information comes from', 'Each conference is hand-listed from its official site and organiser. The month shown is the usual one; dates, venues and host cities change from year to year, so the official site is always the final word.');
    section('Open data', 'The list is open data under ', ['https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0'], '. See ', [`${G}/blob/main/LICENSE-DATA.md`, 'the data licence'], ' and ', [`${G}/blob/main/CITATION.cff`, 'how to cite'], '. The code is MIT.');
    section('Your privacy', 'No account, no tracking, no analytics and no cookies. Pages, data and fonts are served from this site. Conference sites open only when you tap them.');
    section('Use it as an app', 'Add it to your home screen from your browser’s menu, and it opens offline once you have visited.');
    section('Corrections and additions', 'Missing a conference, or spotted a wrong month? ', [`${G}/issues/new`, 'Open an issue on GitHub'], ' and say what and where.');
    content.append(about);
  }
  byId('open-about').addEventListener('click', showAbout);
  byId('open-explore').addEventListener('click', () => go(streamId, 'map'));
  for (const link of document.querySelectorAll('[data-go]')) link.addEventListener('click', () => go('', link.dataset.go));
  byId('open-search').addEventListener('click', () => {
    go(streamId, 'list');
    search.focus();
  });

  // Cards
  function result(record) {
    return () => {
      const card = button('', 'result', () => showConference(record));
      const copy = element('span', '', 'result-copy');
      copy.append(element('span', [streamNames(record)[0], record.month].join(' · '), 'tag'), element('span', record.name, 'card-title'), element('span', [place(record), record.org].filter(Boolean).join(' · '), 'card-copy'));
      const icon = element('span', initials(record.short), 'thumbnail');
      icon.setAttribute('aria-hidden', 'true');
      card.append(icon, copy);
      return card;
    };
  }
  function kpis(target, values) {
    target.replaceChildren(...values.map(([value, caption]) => {
      const tile = element('div', '', 'kpi');
      tile.append(element('b', typeof value === 'number' ? number(value) : value), element('span', caption));
      return tile;
    }));
  }
  const panel = (heading, ...children) => {
    const box = element('div', '', 'panel');
    box.append(element('h5', heading), ...children);
    return box;
  };
  function barList(rows) {
    const peak = Math.max(1, ...rows.map(([, count]) => count));
    return rows.map(([name, count, action]) => {
      const row = button('', 'vb', action);
      const fill = element('i');
      fill.style.width = `${Math.max(1, (count / peak) * 100)}%`;
      row.append(element('span', name), fill, element('em', number(count)));
      row.title = `${name}: ${number(count)}`;
      return row;
    });
  }
  // Conferences per month, as clickable bars that open the list for that month.
  function monthBars(records) {
    const counts = MONTHS.map((_, index) => records.filter(record => record.months.includes(index)).length);
    const peak = Math.max(1, ...counts);
    const now = new Date().getMonth();
    const bars = element('div', '', 'bars months');
    counts.forEach((count, index) => {
      const bar = button('', index === now ? 'now' : '', () => listWith(streamId, month, MONTHS[index]));
      bar.title = `${MONTHS[index]}: ${count} conferences`;
      const fill = element('i');
      fill.style.height = `${Math.round((count / peak) * 100)}%`;
      bar.append(fill, element('small', MONTHS[index].slice(0, 3)));
      bars.append(bar);
    });
    return bars;
  }
  function listWith(id, control, value) {
    go(id, 'list');
    control.value = value;
    renderList();
  }
  const whereOf = record => (record.region === 'India' ? 'India' : 'Outside India');

  // Home
  function renderHome() {
    const india = conferences.filter(record => record.region === 'India');
    const countries = new Set(conferences.map(record => record.country).filter(Boolean));
    kpis(byId('home-kpis'), [
      [conferences.length, 'conferences listed'],
      [india.length, 'held in India'],
      [conferences.length - india.length, 'elsewhere or rotating worldwide'],
      [countries.size, 'host countries'],
      [streams.length, 'streams'],
      [conferences.filter(record => record.months.includes(new Date().getMonth())).length, `usually in ${MONTHS[new Date().getMonth()]}`]
    ]);
    byId('festival-cards').replaceChildren(...streams.map(stream => {
      const records = conferences.filter(record => record.streams.includes(stream.id));
      const card = button('', 'fcard', () => go(stream.id, 'discover'));
      const copy = element('span');
      const inIndia = records.filter(record => record.region === 'India').length;
      copy.append(element('h3', stream.name), element('span', records.slice(0, 3).map(record => record.short).join(', '), 'd'), element('span', `${inIndia} in India · ${records.length - inIndia} worldwide`, 'r'));
      card.append(element('span', stream.icon, 'thumbnail'), copy, element('span', String(records.length), 'badge'));
      return card;
    }));
    byId('home-map').replaceChildren(worldMap(points(conferences)));
    const stats = [panel('Conferences by usual month', monthBars(conferences), element('p', 'Tap a month to see what is on.', 'meta'))];
    const thisMonth = new Date().getMonth();
    const soon = [0, 1, 2].flatMap(step => conferences.filter(record => record.months[0] === (thisMonth + step) % 12));
    stats.push(panel(`Coming up · ${MONTHS[thisMonth]} to ${MONTHS[(thisMonth + 2) % 12]}`, ...soon.slice(0, 8).map(record => {
      const row = element('p', '', 'meta');
      row.append(button(record.name, 'credit-link', () => showConference(record)), ` · ${record.city || record.country || 'rotates'} · ${record.month}`);
      return row;
    })));
    stats.push(panel('India by stream', ...barList(tally(india, record => record.streams).map(([id, count]) => [streamMap.get(id).name, count, () => listWith(id, where, 'India')]))));
    stats.push(panel('Top host countries', ...barList(tally(conferences, record => (record.country ? [record.country] : [])).slice(0, 8).map(([name, count]) => [name, count, () => listWith('', search, name)]))));
    byId('home-stats').replaceChildren(...stats);
  }

  // Discover: one stream
  function renderDiscover(stream) {
    const records = inStream();
    const india = records.filter(record => record.region === 'India');
    byId('d-kicker').textContent = `${stream.icon} Stream`;
    byId('d-title').textContent = stream.name;
    byId('d-sub').textContent = `${records.length} recurring conferences, ${india.length} of them in India. Tap one for its usual month, organiser and official site.`;
    kpis(byId('d-kpis'), [
      [records.length, 'conferences'],
      [india.length, 'in India'],
      [new Set(records.map(record => record.country).filter(Boolean)).size, 'host countries'],
      [records.filter(record => !record.city).length, 'move between cities']
    ]);
    byId('d-bars').replaceChildren(monthBars(records));
    const shelf = byId('d-shelf');
    shelf.replaceChildren(...[...india, ...records.filter(record => record.region !== 'India')].map(record => result(record)()));
  }

  // Map
  function svgNode(tag, attrs) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }
  function worldMap(dots) {
    const [W, H, x0, x1, y0, y1] = [720, 330, -180, 180, -56, 80];
    const px = lon => ((lon - x0) / (x1 - x0)) * W;
    const py = lat => ((y1 - lat) / (y1 - y0)) * H;
    const svg = svgNode('svg', { class: 'map', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'World map of conferences' });
    for (let lon = -150; lon <= 180; lon += 30) svg.append(svgNode('path', { class: 'grat', d: `M${px(lon)} 0V${H}` }));
    for (let lat = -30; lat <= 60; lat += 30) svg.append(svgNode('path', { class: 'grat', d: `M0 ${py(lat)}H${W}` }));
    for (const outline of Object.values(LAND)) svg.append(svgNode('polygon', { class: 'land', points: outline.map(([lon, lat]) => `${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(' ') }));
    const peak = Math.max(1, ...dots.map(dot => dot.count));
    for (const point of [...dots].sort((a, b) => b.count - a.count)) {
      const dot = svgNode('circle', { cx: px(point.lon).toFixed(1), cy: py(point.lat).toFixed(1), r: (3 + Math.sqrt(point.count / peak) * 12).toFixed(1), tabindex: 0, class: point.className || '' });
      const title = svgNode('title', {});
      title.textContent = point.title;
      dot.append(title);
      dot.addEventListener('click', point.action);
      dot.addEventListener('keydown', event => { if (event.key === 'Enter') point.action(); });
      svg.append(dot);
    }
    return svg;
  }
  // One dot per place; a hollow dot is a country whose conferences move between its cities.
  function points(records) {
    const groups = new Map();
    for (const record of records.filter(record => record.lon !== undefined)) {
      const key = record.city || `${record.country} (city changes)`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    return [...groups].map(([key, group]) => ({
      lon: group[0].lon, lat: group[0].lat, count: group.length, className: group[0].city ? '' : 'wip',
      title: `${key}: ${group.map(record => record.short).join(', ')}`,
      action: () => (group.length === 1 ? showConference(group[0]) : showPlace(key, group))
    }));
  }
  function showPlace(key, group) {
    open(key, `${group.length} conferences`);
    list('Conferences', group.map(record => {
      const row = element('span');
      row.append(button(record.name, 'credit-link', () => showConference(record)), ` · ${record.month}`);
      return row;
    }));
  }
  function renderExplore() {
    const records = inStream();
    const roaming = records.filter(record => record.lon === undefined);
    byId('ex-note').textContent = `${records.length} conferences. Filled dots are fixed cities; hollow dots are countries whose conferences move between cities. ${roaming.length} move between countries and are listed on the right.`;
    byId('ex-map').replaceChildren(worldMap(points(records)));
    byId('ex-bars').replaceChildren(
      element('h5', 'By region'), ...barList(tally(records, record => [record.region]).map(([name, count]) => [name, count, () => listWith(streamId, where, name)])),
      element('h5', 'Move between countries'), ...roaming.map(record => button(`${record.short} · ${record.month}`, 'vb roam', () => showConference(record)))
    );
  }

  // Conferences list
  const regions = [...new Set(conferences.map(record => record.region))].filter(region => region !== 'India').sort();
  options(where, [['India', 'India'], ['Outside India', 'Outside India'], ...regions.map(region => [region, `· ${region}`])], 'Anywhere');
  options(month, MONTHS.map(name => [name, name]), 'Any month');
  function renderList() {
    const query = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    const match = values => query.every(term => normalize(values.flat().filter(Boolean).join(' ')).includes(term));
    const monthIndex = MONTHS.indexOf(month.value);
    items = inStream()
      .filter(record => !where.value || whereOf(record) === where.value || record.region === where.value)
      .filter(record => monthIndex < 0 || record.months.includes(monthIndex))
      .filter(record => match([record.name, record.short, record.city, record.country, record.region, record.org, record.month, record.desc, streamNames(record)]))
      .sort((a, b) => (a.months[0] ?? 12) - (b.months[0] ?? 12) || a.name.localeCompare(b.name))
      .map(result);
    page = 0;
    paginate();
  }
  function paginate() {
    const style = getComputedStyle(results);
    const columns = Number(style.getPropertyValue('--columns'));
    const row = parseFloat(style.gridAutoRows);
    const gap = parseFloat(style.rowGap);
    const rows = Math.max(1, Math.floor((results.clientHeight + gap) / (row + gap)));
    const size = columns * rows;
    pageCount = Math.max(1, Math.ceil(items.length / size));
    page = Math.min(page, pageCount - 1);
    const first = page * size;
    const visible = items.slice(first, first + size);
    results.replaceChildren(...(visible.length ? visible.map(makeCard => makeCard()) : [element('p', 'No matches. Try a different search or filter.', 'empty')]));
    byId('count').textContent = items.length ? `${number(first + 1)}–${number(first + visible.length)} of ${number(items.length)}, by usual month` : '0 results';
    byId('page-status').textContent = `Page ${page + 1} of ${pageCount}`;
    previous.setAttribute('aria-disabled', String(page === 0));
    next.setAttribute('aria-disabled', String(page + 1 === pageCount));
  }

  // Routing: ?s=<stream> picks the stream, #<tab> picks the view.
  function go(id, nextView, resetFilters = true) {
    if (resetFilters) for (const input of [search, where, month]) input.value = '';
    streamId = id;
    view = nextView;
    const url = new URL(location.href);
    if (id) url.searchParams.set('s', id);
    else url.searchParams.delete('s');
    url.hash = nextView === 'home' || (id && nextView === 'discover') ? '' : nextView;
    if (url.href !== location.href) history.pushState(null, '', url);
    render();
  }
  function readLocation() {
    const id = new URLSearchParams(location.search).get('s');
    streamId = streamMap.has(id) ? id : '';
    const tab = location.hash.slice(1);
    const tabs = streamId ? streamTabs : allTabs;
    view = Object.hasOwn(tabs, tab) ? tab : streamId ? 'discover' : 'home';
  }
  function render() {
    const selected = streamMap.get(streamId);
    chips.forEach((chip, index) => chip.setAttribute('aria-pressed', String((streams[index - 1]?.id || '') === streamId)));
    const tabs = selected ? streamTabs : view === 'home' ? {} : allTabs;
    byId('tabs').replaceChildren(...Object.entries(tabs).map(([key, text]) => {
      const link = element('a', text);
      link.href = key === 'discover' ? `?s=${streamId}` : `${selected ? `?s=${streamId}` : '?'}#${key}`;
      if (key === view) link.setAttribute('aria-current', 'page');
      link.addEventListener('click', event => {
        event.preventDefault();
        go(streamId, key);
      });
      return link;
    }));
    document.body.dataset.view = view;
    byId('home').hidden = view !== 'home';
    byId('discover').hidden = view !== 'discover';
    byId('archive').hidden = view !== 'list';
    byId('pager').hidden = view !== 'list';
    byId('explore').hidden = view !== 'map';
    if (view === 'home') renderHome();
    else if (view === 'discover') renderDiscover(selected);
    else if (view === 'map') renderExplore();
    else renderList();
    document.title = selected ? `${selected.name} · Conference Guide` : 'Conference Guide';
  }

  for (const input of [search, where, month]) input.addEventListener('input', renderList);
  byId('reset').addEventListener('click', () => {
    for (const input of [search, where, month]) input.value = '';
    renderList();
  });
  for (const [control, step] of [[previous, -1], [next, 1]]) {
    control.addEventListener('click', () => {
      if (control.getAttribute('aria-disabled') === 'true') return;
      page += step;
      paginate();
    });
  }
  let size = '';
  new ResizeObserver(() => {
    const nextSize = `${results.clientWidth}x${results.clientHeight}`;
    if (nextSize === size || byId('archive').hidden) return;
    size = nextSize;
    paginate();
  }).observe(results);
  window.addEventListener('popstate', () => {
    readLocation();
    render();
  });
  readLocation();
  render();
}
if (typeof document !== 'undefined') start().catch(error => {
  console.error(error);
  document.querySelector('.app').append(element('p', 'The catalogue could not load. Refresh to try again.', 'empty'));
});
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
if (typeof module !== 'undefined') module.exports = { monthsOf };
