"""Openly licensed photos for the people and editions in data/editions.json.

    python3 tools/extractors/photos/extract.py            # what the weekly workflow runs
    python3 tools/extractors/photos/extract.py selftest   # offline check of the licence and credit rules

For every person or edition with a `wiki` (an English Wikipedia title), it takes that article's lead
image, keeps it only if Wikimedia Commons lists a free licence (CC0, CC BY, CC BY-SA or public domain),
saves a small copy in images/ and writes the credit, licence and Commons page to data/photos.json.
The site serves the copies itself, so no page load reaches Wikimedia. A lookup that fails keeps the
photo we already have. Network hosts are blocked in the Claude sandbox, so this runs in GitHub Actions.
"""
import html, importlib.util, json, os, re, sys, urllib.parse

spec = importlib.util.spec_from_file_location('refresh', os.path.join(os.path.dirname(__file__), '..', 'refresh', 'extract.py'))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

EDITIONS, PHOTOS, FOLDER = 'data/editions.json', 'data/photos.json', 'images'
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
    files = query(COMMONS, titles='File:' + page['pageimage'], prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=480)
    info = ((files or {}).get('pages') or [{}])[0].get('imageinfo')
    record = credit(info[0]) if info else None
    if not record:
        return False
    status, _, body = refresh.get(record.pop('thumb'))
    if status != 200 or not body:
        return None
    path = f"{FOLDER}/{slug(key)}{os.path.splitext(urllib.parse.urlsplit(info[0]['thumburl']).path)[1].lower() or '.jpg'}"
    open(path, 'wb').write(body)
    return {'src': path, **record}


def main():
    data = json.load(open(EDITIONS, encoding='utf-8'))
    old = json.load(open(PHOTOS, encoding='utf-8')) if os.path.exists(PHOTOS) else {}
    out = {'about': 'Photos from Wikimedia Commons under free licences, made by tools/extractors/photos. Each keeps its own licence and credit.', 'people': {}, 'editions': {}}
    targets = [('people', name, person['wiki']) for name, person in data['people'].items() if person.get('wiki')]
    targets += [('editions', f"{e['conference']}-{e['year']}", e['wiki']) for e in data['editions'] if e.get('wiki')]
    os.makedirs(FOLDER, exist_ok=True)
    for group, key, title in targets:
        found = photo(title, key)
        if found:
            out[group][key] = found
        elif found is None and key in old.get(group, {}):  # lookup failed: keep what we had
            out[group][key] = old[group][key]
    open(PHOTOS, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(f"{len(out['people'])} portraits and {len(out['editions'])} edition photos from {len(targets)} lookups")


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
    print('selftest passed')


if __name__ == '__main__':
    selftest() if sys.argv[1:] == ['selftest'] else main()
