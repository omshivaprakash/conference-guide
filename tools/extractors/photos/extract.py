"""Openly licensed photos for the people and editions in data/editions.json, and a logo for every conference.

    python3 tools/extractors/photos/extract.py            # what the weekly workflow runs
    python3 tools/extractors/photos/extract.py selftest   # offline check of the licence and credit rules

For every person or edition with a `wiki` (an English Wikipedia title), it takes that article's lead
image, keeps it only if Wikimedia Commons lists a free licence (CC0, CC BY, CC BY-SA or public domain),
saves a small copy in images/ and writes the credit, licence and Commons page to data/photos.json.
The site serves the copies itself, so no page load reaches Wikimedia. A lookup that fails keeps the
photo we already have.

Logos: a conference's Wikidata logo (P154) on Commons when it has one, otherwise the icon its official
site declares (apple-touch-icon or icon). Site icons belong to their owners and are kept only to
identify the conference, credited to the site. A logo we already have is not fetched again.
Network hosts are blocked in the Claude sandbox, so this runs in GitHub Actions.
"""
import html, importlib.util, json, os, re, sys, time, urllib.parse

spec = importlib.util.spec_from_file_location('refresh', os.path.join(os.path.dirname(__file__), '..', 'refresh', 'extract.py'))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

EDITIONS, PHOTOS, FOLDER, CATALOG = 'data/editions.json', 'data/photos.json', 'images', 'catalog.json'
IMAGE = {b'\x89PNG': '.png', b'\xff\xd8\xff': '.jpg', b'GIF8': '.gif', b'RIFF': '.webp', b'\x00\x00\x01\x00': '.ico'}
WIKI, COMMONS = 'https://en.wikipedia.org/w/api.php?', 'https://commons.wikimedia.org/w/api.php?'
FREE = re.compile(r'^(CC0( 1\.0)?|CC BY(-SA)?( \d\.\d)?|Public domain)$|^PD\b', re.I)


def query(base, **params):
    status, _, body = refresh.get(base + urllib.parse.urlencode({**params, 'action': 'query', 'format': 'json', 'formatversion': 2}))
    return json.loads(body).get('query', {}) if status == 200 else None


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', value or ''))).strip()


def credit(info):
    """Photo record from a Commons imageinfo entry, or None if its licence is not free."""
    meta = {key: value.get('value', '') for key, value in info.get('extmetadata', {}).items()}
    license = plain(meta.get('LicenseShortName'))
    if not FREE.match(license):
        return None
    return {'credit': plain(meta.get('Artist')) or 'Wikimedia Commons', 'license': license,
            'licenseUrl': meta.get('LicenseUrl') or None, 'source': info['descriptionurl'], 'thumb': info['thumburl']}


def photo(title, key):
    pages = query(WIKI, titles=title.replace('_', ' '), prop='pageimages|pageprops', piprop='name', redirects=1)
    if pages is None:
        return None
    page = (pages.get('pages') or [{}])[0]
    if 'disambiguation' in page.get('pageprops', {}) or not page.get('pageimage'):
        return False
    return commons(page['pageimage'], f'{FOLDER}/{slug(key)}', 480)


def commons(name, stem, width):
    """Save a free Commons file as a PNG/JPEG thumbnail at stem.<ext>; False if not free, None if the lookup failed."""
    files = query(COMMONS, titles='File:' + name, prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=width)
    info = ((files or {}).get('pages') or [{}])[0].get('imageinfo')
    record = credit(info[0]) if info else None
    if not record:
        return None if files is None else False
    status, _, body = refresh.get(record.pop('thumb'))
    if status != 200 or not body:
        return None
    path = stem + (os.path.splitext(urllib.parse.urlsplit(info[0]['thumburl']).path)[1].lower() or '.jpg')
    open(path, 'wb').write(body)
    return {'src': path, **record}


def icon_links(page, base):
    """Icon URLs a page declares, best first: apple-touch-icon, then the largest other icon."""
    found = []
    for tag in re.findall(r'<link\b[^>]*>', page, re.I):
        attrs = {k.lower(): v for k, _, v in re.findall(r'([\w-]+)\s*=\s*(["\'])(.*?)\2', tag)}
        rel, href = attrs.get('rel', '').lower().split(), attrs.get('href')
        if not href or not ({'icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'} & set(rel)):
            continue
        size = max([int(n) for n in re.findall(r'(\d+)x\d+', attrs.get('sizes', ''))] or [256 if href.endswith('.svg') else 0])
        found.append(('apple-touch-icon' in attrs.get('rel', '').lower(), size, urllib.parse.urljoin(base, html.unescape(href))))
    return [url for *_, url in sorted(found, reverse=True)]


def kind(body):
    if body.lstrip()[:5].lower() in (b'<?xml', b'<svg ') and b'<svg' in body[:2000].lower():
        return '.svg'
    return next((ext for magic, ext in IMAGE.items() if body.startswith(magic)), None)


def site_icon(record, stem):
    status, final, body = refresh.get(record['url'], tries=2)
    if status != 200:
        return None
    for url in icon_links(body.decode('utf-8', 'replace'), final)[:3]:
        status, _, image = refresh.get(url, tries=1)
        ext = kind(image) if status == 200 else None
        if ext and len(image) < 500_000:
            open(stem + ext, 'wb').write(image)
            return {'src': stem + ext, 'credit': f"{record['name']}, official website", 'license': 'Logo of its owner, shown to identify the conference', 'source': record['url']}
    return False


def logos(conferences, old):
    """One logo per conference id. Wikidata/Commons first, then the official site's icon."""
    os.makedirs(f'{FOLDER}/logos', exist_ok=True)
    qids = [r['wikidata'] for r in conferences if r.get('wikidata')]
    entities = {}
    for i in range(0, len(qids), 50):
        entities.update(refresh.entities(qids[i:i + 50]))
    out, deadline = {}, time.time() + 900  # new lookups stop after 15 minutes; the rest wait for next week
    for record in conferences:
        stem, kept = f"{FOLDER}/logos/{record['id']}", old.get(record['id'])
        if kept and os.path.exists(kept['src']):  # shortcut: never re-checks a saved logo; delete it to refetch
            out[record['id']] = kept
            continue
        if time.time() > deadline:
            continue
        files = [f for f in refresh.claims(entities.get(record.get('wikidata'), {}), 'P154') if f]
        found = commons(files[0], stem, 256) if files else False
        if not found and record.get('url'):
            found = site_icon(record, stem)
        if found:
            out[record['id']] = found
    return out


def main():
    data = json.load(open(EDITIONS, encoding='utf-8'))
    old = json.load(open(PHOTOS, encoding='utf-8')) if os.path.exists(PHOTOS) else {}
    out = {'about': 'Photos from Wikimedia Commons under free licences, and conference logos, made by tools/extractors/photos. Each keeps its own licence and credit.', 'people': {}, 'editions': {}}
    targets = [('people', name, person['wiki']) for name, person in data['people'].items() if person.get('wiki')]
    targets += [('editions', f"{e['conference']}-{e['year']}", e['wiki']) for e in data['editions'] if e.get('wiki')]
    os.makedirs(FOLDER, exist_ok=True)
    for group, key, title in targets:
        found = photo(title, key)
        if found:
            out[group][key] = found
        elif found is None and key in old.get(group, {}):  # lookup failed: keep what we had
            out[group][key] = old[group][key]
    out['logos'] = logos(json.load(open(CATALOG, encoding='utf-8'))['conferences'], old.get('logos', {}))
    open(PHOTOS, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(f"{len(out['people'])} portraits and {len(out['editions'])} edition photos from {len(targets)} lookups, and {len(out['logos'])} conference logos")


def selftest():
    info = {'descriptionurl': 'https://commons.wikimedia.org/wiki/File:X.jpg', 'thumburl': 'https://upload.wikimedia.org/x.jpg',
            'extmetadata': {'LicenseShortName': {'value': 'CC BY-SA 4.0'}, 'Artist': {'value': '<a href="/u">Jane &amp; Co</a>'},
                            'LicenseUrl': {'value': 'https://creativecommons.org/licenses/by-sa/4.0'}}}
    assert credit(info)['credit'] == 'Jane & Co' and credit(info)['license'] == 'CC BY-SA 4.0'
    for name in ['CC0', 'CC BY 2.0', 'Public domain', 'PD-USGov']:
        info['extmetadata']['LicenseShortName']['value'] = name
        assert credit(info), name
    for name in ['Fair use', 'CC BY-NC 2.0', '']:
        info['extmetadata']['LicenseShortName']['value'] = name
        assert credit(info) is None, name
    assert slug('Børge Brende') == 'b-rge-brende' and slug('msc-2025') == 'msc-2025'
    page = """<link rel="icon" href="/favicon.ico"><link rel='icon' sizes="192x192" href="/i192.png">
      <LINK REL="apple-touch-icon" HREF="touch.png"><link rel="stylesheet" href="a.css">"""
    assert icon_links(page, 'https://ex.org/a/') == ['https://ex.org/a/touch.png', 'https://ex.org/i192.png', 'https://ex.org/favicon.ico']
    assert kind(b'\x89PNG\r\n') == '.png' and kind(b'<svg xmlns="x">') == '.svg' and kind(b'<html>') is None
    print('selftest passed')


if __name__ == '__main__':
    selftest() if sys.argv[1:] == ['selftest'] else main()
