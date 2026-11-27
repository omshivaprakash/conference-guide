"""Weekly refresh of catalog.json: check every official link and cross-check each conference against Wikidata.

    python3 tools/extractors/refresh/extract.py            # what the weekly workflow runs
    python3 tools/extractors/refresh/extract.py selftest   # offline check of the matching and merge rules

What it changes in catalog.json (only these, so hand-checked facts are never overwritten):
- adds `wikidata` (the item id) once a conference is matched: a Wikidata search by name whose
  official website (P856) is on the same host as our `url`. Name alone is never enough.
- fills `since` from Wikidata's inception (P571) where we have no year.
Everything else it finds goes to data/refresh/report.json for a person to review:
dead or moved links, and Wikidata disagreeing with our first year or official site.
Wikidata is CC0. Network hosts are blocked in the Claude sandbox, so this runs in GitHub Actions.
"""
import datetime, json, os, re, sys, time, urllib.parse, urllib.request

CATALOG, REPORT = 'catalog.json', 'data/refresh/report.json'
UA = {'User-Agent': 'conference-guide-data/1.0 (open data project; github.com/omshivaprakash/conference-guide)'}
API = 'https://www.wikidata.org/w/api.php?'


def get(url, tries=3, body=True):
    """Return (status, final_url, body); status 0 means the request failed."""
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={**UA, 'Accept': '*/*'}), timeout=30) as reply:
                return reply.status, reply.url, reply.read(2_000_000) if body else b''
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == tries - 1:
                return error.code, url, b''
        except Exception as error:  # timeouts and resets: back off and retry
            print('retry', url[:80], error, flush=True)
            if attempt == tries - 1:
                return 0, url, b''
        time.sleep(5 * (attempt + 1))


def api(**params):
    status, _, body = get(API + urllib.parse.urlencode({**params, 'format': 'json'}))
    time.sleep(0.3)
    return json.loads(body) if status == 200 else {}


def host(url):
    return (urllib.parse.urlsplit(url).hostname or '').removeprefix('www.') if url else ''


def claims(entity, prop):
    return [c['mainsnak'].get('datavalue', {}).get('value') for c in entity.get('claims', {}).get(prop, [])]


def facts(entity):
    years = [int(v['time'][1:5]) for v in claims(entity, 'P571') if v and v.get('time', '')[:1] == '+']
    return {'sites': [v for v in claims(entity, 'P856') if v], 'since': min(years) if years else None}


def entities(ids):
    return api(action='wbgetentities', ids='|'.join(ids), props='claims').get('entities', {}) if ids else {}


def match(record, search, lookup):
    """Wikidata id whose official website shares our url's host, or None."""
    want = host(record.get('url'))
    if not want:
        return None
    ids = []
    for name in dict.fromkeys([record['name'], record['short']]):
        ids += [hit['id'] for hit in search(name) if hit['id'] not in ids]
    found = lookup(ids[:10])
    return next((qid for qid in ids if any(host(site) == want for site in facts(found.get(qid, {}))['sites'])), None)


def merge(record, qid, fact, issues):
    """Apply the safe changes to one record and note the rest. Returns True if the record changed."""
    changed = record.get('wikidata') != qid
    record['wikidata'] = qid
    if fact['since'] and not record.get('since') and 1800 < fact['since'] <= datetime.date.today().year:
        record['since'], changed = fact['since'], True
    elif fact['since'] and record.get('since') and fact['since'] != record['since']:
        issues.append({'id': record['id'], 'issue': 'since differs', 'ours': record['since'], 'wikidata': fact['since']})
    if record.get('url') and fact['sites'] and host(record['url']) not in {host(s) for s in fact['sites']}:
        issues.append({'id': record['id'], 'issue': 'official site differs', 'ours': record['url'], 'wikidata': fact['sites']})
    return changed


def check_link(record, issues):
    status, final, _ = get(record['url'], tries=2, body=False)  # status only: a slow page body can stall the run
    if status == 0 or status >= 400:
        issues.append({'id': record['id'], 'issue': 'link failed', 'url': record['url'], 'status': status})
    elif host(final) != host(record['url']):
        issues.append({'id': record['id'], 'issue': 'link moved', 'url': record['url'], 'now': final})


def write_catalog(text, records):
    """Rewrite only the changed conference lines, keeping the one-record-per-line layout."""
    by_id, lines = {r['id']: r for r in records}, []
    for line in text.split('\n'):
        found = re.match(r'\{"id": "([^"]+)"', line)
        if found and found.group(1) in by_id:
            line = json.dumps(by_id[found.group(1)], ensure_ascii=False) + (',' if line.endswith(',') else '')
        lines.append(line)
    return '\n'.join(lines)


def main():
    text = open(CATALOG, encoding='utf-8').read()
    conferences = json.loads(text)['conferences']
    search = lambda name: api(action='wbsearchentities', search=name, language='en', type='item', limit=5).get('search', [])
    issues, changed, unmatched = [], [], []
    stored, known = [r['wikidata'] for r in conferences if r.get('wikidata')], {}
    for i in range(0, len(stored), 50):  # wbgetentities takes at most 50 ids
        known.update(entities(stored[i:i + 50]))
    for n, record in enumerate(conferences, 1):
        print(n, record['id'], flush=True)  # progress in the Actions log
        if record.get('url'):
            check_link(record, issues)
        qid = record.get('wikidata') or match(record, search, entities)
        if not qid:
            unmatched.append(record['id'])
            continue
        entity = known.get(qid) or entities([qid]).get(qid, {})
        if merge(record, qid, facts(entity), issues):
            changed.append(record)
    if changed:
        open(CATALOG, 'w', encoding='utf-8').write(write_catalog(text, changed))
    report = {'checked': datetime.date.today().isoformat(), 'conferences': len(conferences),
              'matched': len(conferences) - len(unmatched), 'unmatched': unmatched,
              'issues': sorted(issues, key=lambda i: (i['issue'], i['id']))}
    os.makedirs('data/refresh', exist_ok=True)
    open(REPORT, 'w', encoding='utf-8').write(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
    print(f"{len(changed)} records updated, {report['matched']} matched on Wikidata, {len(issues)} issues to review")


def selftest():
    entity = {'claims': {'P856': [{'mainsnak': {'datavalue': {'value': 'https://www.ces.tech/'}}}],
                         'P571': [{'mainsnak': {'datavalue': {'value': {'time': '+1967-00-00T00:00:00Z'}}}}]}}
    other = {'claims': {'P856': [{'mainsnak': {'datavalue': {'value': 'https://example.org'}}}]}}
    record = {'id': 'ces', 'name': 'CES', 'short': 'CES', 'url': 'https://ces.tech'}
    lookup = lambda ids: {'Q1': other, 'Q2': entity}
    assert match(record, lambda name: [{'id': 'Q1'}, {'id': 'Q2'}], lookup) == 'Q2', 'match needs the same website host'
    assert match({**record, 'url': None}, lambda name: [{'id': 'Q2'}], lookup) is None, 'no url, no match'
    issues = []
    assert merge(record, 'Q2', facts(entity), issues) and record['since'] == 1967 and not issues
    record['since'] = 1970
    assert not merge(record, 'Q2', facts(entity), issues) and record['since'] == 1970, 'never overwrite our year'
    assert issues == [{'id': 'ces', 'issue': 'since differs', 'ours': 1970, 'wikidata': 1967}]
    text = '{\n"conferences": [\n{"id": "a", "x": 1},\n{"id": "b", "x": 2}\n]\n}\n'
    assert json.loads(write_catalog(text, [{'id': 'a', 'x': 3}]))['conferences'] == [{'id': 'a', 'x': 3}, {'id': 'b', 'x': 2}]
    print('selftest passed')


if __name__ == '__main__':
    selftest() if sys.argv[1:] == ['selftest'] else main()
