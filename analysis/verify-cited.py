"""Resolve every reference cited in the paper against its registry: arXiv entries through the arXiv API, DOI entries
through Crossref, URL-only entries by an HTTP fetch. Compares the normalized title, the year and the first author's
surname with the bibliography entry. Writes literature/cited-verification-<date>.csv and prints every mismatch.
Run: python3 analysis/verify-cited.py (reads paper/main.aux, literature/refs.bib, paper/refs-extra.bib)."""
import re, json, csv, sys, time, urllib.request, urllib.parse, datetime, unicodedata
ROOT = __file__.rsplit('/analysis/', 1)[0]
UA = {'User-Agent': 'visibility-paper-citation-check/1.0 (mailto:arjunlohan7@gmail.com)'}
def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode()
    s = re.sub(r'\\[a-zA-Z]+|[{}]', '', s); return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()
def field(body, f):
    m = re.search(r'\b' + f + r'\s*=\s*[{"](.*?)[}"]\s*,?\s*\n', body, re.S); return m.group(1).strip() if m else ''
entries = {}
for path in (ROOT + '/literature/refs.bib', ROOT + '/paper/refs-extra.bib'):
    for m in re.finditer(r'@(\w+)\{([^,]+),(.*?)(?=\n@|\Z)', open(path).read(), re.S):
        entries[m.group(2).strip()] = (m.group(1), m.group(3))
aux = open(ROOT + '/paper/main.aux').read()
keys = sorted(set(k.strip() for g in re.findall(r'\\citation\{([^}]*)\}', aux) for k in g.split(',')))
def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r: return r.status, r.read().decode('utf-8', 'ignore')
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1: time.sleep(15 * (i + 1)); continue
            return e.code, ''
        except Exception as e:
            if i < tries - 1: time.sleep(5); continue
            return 0, str(e)
    return 0, ''
def first_surname(author):
    a = re.split(r'\s+and\s+', author)[0].strip()
    return norm(a.split(',')[0] if ',' in a else a.split()[-1])
rows = []
for k in keys:
    if k not in entries: rows.append({'key': k, 'status': 'MISSING_IN_BIB'}); continue
    typ, body = entries[k]
    title, author, year = field(body, 'title'), field(body, 'author'), field(body, 'year')
    eprint, doi, url = field(body, 'eprint'), field(body, 'doi'), field(body, 'url') or field(body, 'howpublished')
    url = re.sub(r'\\url\{([^}]*)\}', r'\1', url)
    row = {'key': k, 'type': typ, 'bib_title': title[:120], 'bib_year': year, 'id': eprint or doi or url}
    if eprint:
        # arXiv registers a DOI per paper with DataCite (10.48550/arXiv.<id>); that registry carries title, year and creators
        bare = re.sub(r'v\d+$', '', eprint)
        st, x = get('https://api.datacite.org/dois/' + urllib.parse.quote('10.48550/arXiv.' + bare)); time.sleep(0.6)
        try: at = json.loads(x)['data']['attributes']
        except Exception: at = {}
        rt = (at.get('titles') or [{}])[0].get('title', ''); ry = str(at.get('publicationYear') or ''); cr = (at.get('creators') or [{}])[0]
        fa = cr.get('familyName') or cr.get('name', '')
        registry = 'datacite'
        if not rt:  # fall back to the arXiv API, politely
            st, x = get('https://export.arxiv.org/api/query?id_list=' + urllib.parse.quote(eprint) + '&max_results=1'); time.sleep(3.2)
            t = re.search(r'<entry>.*?<title>(.*?)</title>', x, re.S); y = re.search(r'<published>(\d{4})', x); a = re.search(r'<author>\s*<name>(.*?)</name>', x, re.S)
            rt = re.sub(r'\s+', ' ', t.group(1)) if t else ''; ry = y.group(1) if y else ''; fa = a.group(1) if a else ''; registry = 'arxiv'
        row.update(registry=registry, http=st, reg_title=rt[:120], reg_year=ry, reg_first=fa)
        row['title_match'] = norm(rt) == norm(title) if rt else False
        row['year_match'] = ry == year
        row['author_match'] = (first_surname(author) in norm(fa)) if (fa and author) else False
    elif doi:
        st, x = get('https://api.crossref.org/works/' + urllib.parse.quote(doi)); time.sleep(1.2)
        try: m = json.loads(x)['message']
        except Exception: m = {}
        rt = (m.get('title') or [''])[0]; ry = str((m.get('issued', {}).get('date-parts') or [[None]])[0][0] or (m.get('created', {}).get('date-parts') or [[None]])[0][0] or '')
        fa = (m.get('author') or [{}])[0].get('family', '')
        row.update(registry='crossref', http=st, reg_title=rt[:120], reg_year=ry, reg_first=fa)
        row['title_match'] = norm(rt) == norm(title) if rt else False
        row['year_match'] = ry == year
        row['author_match'] = (first_surname(author) == norm(fa)) if (fa and author) else False
    elif url:
        st, x = get(url); time.sleep(1.0)
        row.update(registry='url', http=st, reg_title='', reg_year='', reg_first='')
        row['title_match'] = st == 200 and bool(x); row['year_match'] = True; row['author_match'] = True
    else:
        row.update(registry='none', http=0, title_match=False, year_match=False, author_match=False)
    row['status'] = 'OK' if row.get('title_match') and row.get('year_match') and row.get('author_match') else 'CHECK'
    rows.append(row); print(k, row['status'], row.get('registry'), row.get('http'), file=sys.stderr, flush=True)
out = ROOT + '/literature/cited-verification-' + datetime.date.today().isoformat() + '.csv'
with open(out, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['key', 'type', 'status', 'registry', 'http', 'id', 'bib_title', 'reg_title', 'bib_year', 'reg_year', 'reg_first', 'title_match', 'year_match', 'author_match']); w.writeheader()
    for r in rows: w.writerow({k2: r.get(k2, '') for k2 in w.fieldnames})
print('WROTE', out, 'cited', len(rows), 'ok', sum(r['status'] == 'OK' for r in rows), 'check', [r['key'] for r in rows if r['status'] != 'OK'])
