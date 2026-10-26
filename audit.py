"""Check cameras.json for the mistakes this list actually makes.

Run it with no arguments. It reads cameras.json beside it, prints what it finds and
changes nothing. Every check here is one that has caught a real bug: a camera diving
to the wrong village, a beach cam whose longitude was a copy of its latitude, four
Florida Panhandle cams set to Eastern time, two bar rails that break the content rule.

    python3 audit.py

Needs timezonefinder for the timezone check (pip install timezonefinder). Without it
that one check is skipped and the rest still run.
"""
import collections
import json
import pathlib
import re
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

D = pathlib.Path(__file__).parent

# A venue cam is what Anthony's content rule keeps out, and the trap is substring
# matching: "barn", "Barra", "Bar Harbor", "Playa de La Barrosa", "beach club" and
# "boxing club" are all places, not bars. Match whole words, and exempt the
# compounds that name somewhere public.
VENUE = re.compile(r'\b(bar|bars|club|pub|nightclub|cabaret|honky tonk|saloon|tavern)\b')
NOT_A_VENUE = re.compile(r'beach club|yacht club|boxing club|bar harbor|golf club'
                         r'|surf club|country club|club med')


def qualifies_as_stage(cam):
    """The one exception to the no-venue rule: a stage with real live music.

    It needs both halves. The audio tag says the feed carries the band, and the sets
    say when a band is actually on, because the gaps between acts are an empty stage
    and that is the whole reason the window exists.
    """
    return (cam.get('audio') == 'live-music'
            and bool((cam.get('live_window') or {}).get('sets')))


def check_ids(cams):
    counts = collections.Counter(c['video_id'] for c in cams if c.get('video_id'))
    return ['%s appears %d times' % (v, n) for v, n in counts.items() if n > 1]


def check_poses(cams):
    out = []
    for c in cams:
        p = c.get('pose') or {}
        lat, lng = p.get('lat'), p.get('lng')
        if lat is None or lng is None:
            out.append('%s has no coordinate' % c['name'])
            continue
        if abs(lat - lng) < 1e-6:
            out.append('%s has lat equal to lng (%s), which is how a copied field looks'
                       % (c['name'], lat))
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            out.append('%s is off the globe at %s, %s' % (c['name'], lat, lng))
    return out


def check_dive_points(cams):
    """Two cameras landing on the same spot is fine inside one venue, wrong across two."""
    pts = collections.defaultdict(list)
    for c in cams:
        p = c.get('pose') or {}
        if p.get('lat') is not None:
            pts[(round(p['lat'], 4), round(p['lng'], 4))].append(c)
    out = []
    for pt, group in pts.items():
        if len(group) < 2:
            continue
        # Same venue, several cameras: expected. Different towns: a copied coordinate.
        towns = {re.split(r',', c.get('location', ''))[0].strip().lower() for c in group}
        if len(towns) > 1:
            out.append('%s is shared by cameras in different places: %s'
                       % (pt, ' | '.join(c['name'] for c in group)))
    return out


def check_timezones(cams):
    try:
        from timezonefinder import TimezoneFinder
    except ImportError:
        return ['(skipped: pip install timezonefinder to run this check)']
    tf = TimezoneFinder()
    now = datetime.now(timezone.utc)
    out = []
    for c in cams:
        p = c.get('pose') or {}
        listed = c.get('timezone')
        if p.get('lat') is None or not listed:
            continue
        real = tf.timezone_at(lat=p['lat'], lng=p['lng'])
        if not real:
            continue
        try:
            if ZoneInfo(real).utcoffset(now) != ZoneInfo(listed).utcoffset(now):
                out.append('%s is listed %s but sits in %s' % (c['name'], listed, real))
        except Exception:
            out.append('%s has an unreadable zone (%r or %r)' % (c['name'], listed, real))
    return out


def check_windows(cams):
    """A broken window either hides a camera for good or parks it on an empty room."""
    def mins(t):
        m = re.fullmatch(r'(\d{1,2}):(\d{2})', str(t or ''))
        if not m:
            return None
        h, mm = int(m.group(1)), int(m.group(2))
        return h * 60 + mm if h <= 24 and mm < 60 else None

    out = []
    for c in cams:
        w = c.get('live_window')
        if not w:
            continue
        # Both spellings are in the wild and the viewer reads either.
        frm, to = w.get('from', w.get('start')), w.get('to', w.get('end'))
        season = w.get('season')
        if frm is None and to is None and not season:
            out.append('%s has a live_window with no hours and no season' % c['name'])
        if frm is not None and mins(frm) is None:
            out.append('%s has an unreadable start time %r' % (c['name'], frm))
        if to is not None and mins(to) is None:
            out.append('%s has an unreadable end time %r' % (c['name'], to))
        if frm and to and mins(frm) is not None and mins(frm) == mins(to):
            out.append('%s opens and closes at the same minute (%s)' % (c['name'], frm))
        for s in (w.get('sets') or []):
            a, b = mins(s.get('from', s.get('start'))), mins(s.get('to', s.get('end')))
            if a is None or b is None:
                out.append('%s has an unreadable set %r' % (c['name'], s))
            elif a == b:
                out.append('%s has a zero-length set %r' % (c['name'], s))
            out += check_weekdays(c, s.get('weekdays'), 'a set of')
        out += check_weekdays(c, w.get('weekdays'), '')
        # The trap this is here for: the closed day written as prose in `days`
        # and then never put in `weekdays`, which is the only one the viewer
        # reads. That is how a shop cam ends up dealt on the day it is shut.
        days = str(w.get('days') or '').lower()
        if not w.get('weekdays') and any(d in days for d in DAYWORDS):
            out.append('%s names a day in its days note (%r) but has no weekdays list, '
                       'so the viewer will deal it every day' % (c['name'], w.get('days')))
    return out


DAYS = ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
DAYWORDS = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday',
            'saturday', 'sunday', 'weekday', 'weekend')


def check_weekdays(c, wd, where):
    """A weekdays list the viewer cannot read holds the camera back for good."""
    if wd is None:
        return []
    label = (where + ' ' if where else '') + 'weekdays'
    if not isinstance(wd, list) or not wd:
        return ['%s has an empty or malformed %s %r' % (c['name'], label, wd)]
    seen, out = set(), []
    for d in wd:
        k = str(d)[:3].lower()
        if k not in DAYS:
            out.append('%s has an unreadable day %r in %s' % (c['name'], d, label))
        elif k in seen:
            out.append('%s lists %s twice in %s' % (c['name'], k, label))
        seen.add(k)
    if len(seen) == 7 and not out:
        out.append('%s lists all seven days in %s, which is the same as leaving it out'
                   % (c['name'], label))
    return out


def check_content_rule(cams):
    out = []
    for c in cams:
        cat = (c.get('category') or '').lower()
        name = (c.get('name') or '').lower()
        hit = VENUE.search(cat) or (VENUE.search(name) and not NOT_A_VENUE.search(name))
        if hit and not qualifies_as_stage(c):
            out.append('%s [category %s, audio %s, sets %s]'
                       % (c['name'], c.get('category'), c.get('audio'),
                          bool((c.get('live_window') or {}).get('sets'))))
    return out


CHECKS = [
    ('duplicate video ids', check_ids),
    ('coordinates', check_poses),
    ('dive points shared across different places', check_dive_points),
    ('timezone against coordinate', check_timezones),
    ('live windows', check_windows),
    ('venue cams that do not meet the live-music exception', check_content_rule),
]


def main():
    cams = json.loads((D / 'cameras.json').read_text(encoding='utf-8'))['cameras']
    print('%d cameras\n' % len(cams))
    findings = 0
    for title, fn in CHECKS:
        rows = fn(cams)
        real = [r for r in rows if not r.startswith('(')]
        findings += len(real)
        print('%s: %s' % (title, 'nothing' if not rows else ''))
        for r in rows:
            print('   %s' % r)
    print('\n%d thing%s to look at.' % (findings, '' if findings == 1 else 's'))
    # The content-rule check is a prompt to read the camera, not a verdict: a beach
    # seen from a bar terrace is scenery and belongs in the list.
    return 0


if __name__ == '__main__':
    sys.exit(main())
