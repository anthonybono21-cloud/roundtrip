"""Give every camera in cameras.json a `tags` array.

Three kinds of tag go on each camera, and search treats them all the same:

  place    city, region, country, continent and the aliases people actually
           type - NYC, PH, UK, Mecca, Rockies.
  scene    what you are looking at: beach, skyline, volcano, waterhole, zoo.
  quality  how it feels or behaves: busy, quiet, night lights, sunset-facing,
           always-on, has-sound.

Place, scene and the mechanical qualities are derived from fields the camera
already carries, so they stay correct when the list changes. The rest is the
EXTRAS table below: the things no field knows - that the Long Beach penguin
cam is penguins, that Abbey Road is the Beatles, that Valle Nevado is skiing.

Re-runnable: it rewrites `tags` from scratch every time, so editing a table
here and running `python3 tag.py` is the way to change tags.
"""
import json, pathlib, unicodedata

D = pathlib.Path(__file__).parent

# ── country knowledge: continent, codes, and what people type instead ───────
COUNTRY = {
  'Philippines':    ['ph','phl','asia','southeast asia'],
  'Italy':          ['it','ita','europe','mediterranean'],
  'South Korea':    ['kr','kor','korea','asia','east asia'],
  'United States':  ['us','usa','america','united states of america','north america'],
  'Honduras':       ['hn','central america','north america','latin america','caribbean'],
  'Kenya':          ['ke','africa','east africa'],
  'South Africa':   ['za','africa','southern africa'],
  'Panama':         ['pa','central america','north america','latin america'],
  'Canada':         ['ca','can','north america'],
  'Mexico':         ['mx','mex','north america','latin america'],
  'Chile':          ['cl','south america','latin america'],
  'Curacao':        ['cw','curacao','caribbean','north america','abc islands'],
  'Sint Maarten':   ['sx','st maarten','saint martin','caribbean','north america'],
  'Argentina':      ['ar','arg','south america','latin america'],
  'Greenland':      ['gl','arctic','north america','nordic'],
  'Brazil':         ['br','bra','south america','latin america'],
  'Iceland':        ['is','isl','europe','nordic','arctic'],
  'Portugal':       ['pt','por','europe'],
  'Ireland':        ['ie','irl','europe'],
  'United Kingdom': ['uk','gb','britain','great britain','england','europe'],
  'Netherlands':    ['nl','nld','holland','europe'],
  'Germany':        ['de','deu','europe'],
  'Norway':         ['no','nor','europe','nordic','scandinavia','arctic'],
  'Switzerland':    ['ch','che','europe','alps'],
  'Vatican City':   ['va','vatican','holy see','europe','rome','italy'],
  'Austria':        ['at','aut','europe','alps'],
  'Finland':        ['fi','fin','europe','nordic','scandinavia','arctic'],
  'Namibia':        ['na','nam','africa','southern africa'],
  'Botswana':       ['bw','africa','southern africa'],
  'Israel':         ['il','isr','middle east','asia'],
  'Saudi Arabia':   ['sa','sau','middle east','asia','arabia'],
  'Oman':           ['om','omn','middle east','asia','arabia'],
  'Kyrgyzstan':     ['kg','central asia','asia'],
  'Kazakhstan':     ['kz','kaz','central asia','asia'],
  'Nepal':          ['np','npl','asia','south asia','himalaya'],
  'Thailand':       ['th','tha','asia','southeast asia'],
  'Indonesia':      ['id','idn','asia','southeast asia'],
  'Japan':          ['jp','jpn','asia','east asia'],
  'Australia':      ['au','aus','oceania','australasia'],
  'New Zealand':    ['nz','nzl','oceania','australasia','aotearoa'],
}

# A place name in `location` that people also type another way.
PLACE_ALIAS = {
  'new york city': ['nyc','new york','ny','manhattan'],
  'new york': ['nyc','ny'],
  'san francisco': ['sf','bay area'],
  'los angeles': ['la','socal'],
  'district of columbia': ['dc','washington dc','washington d.c.'],
  'washington': ['washington dc','dc'],
  'hawaii': ['hi','hawaiian islands','pacific'],
  'rio de janeiro': ['rio'],
  'cologne': ['koln','kolln'],
  'makkah': ['mecca'],
  'makkah province': ['mecca'],
  'jerusalem': ['holy land'],
  'cebu': ['visayas'],
  'south tyrol': ['alto adige','dolomites','alps'],
  'tuscany': ['toscana'],
  'veneto': ['venezia'],
  'sardinia': ['sardegna'],
  'sicily': ['sicilia'],
  'british columbia': ['bc'],
  'california': ['ca','socal','west coast'],
  'alberta': ['rockies','rocky mountains'],
  'lapland': ['arctic'],
  'valais': ['alps','wallis'],
  'bernese oberland': ['alps','berner oberland'],
  'salzburg': ['alps'],
  'more og romsdal': ['fjords'],
  'koh samui': ['samui'],
  'bali': ['indonesia'],
  'oahu': ['hawaii'],
  'tokyo': ['kanto'],
  'seoul': ['hangang'],
}

# ── scene knowledge: the `category` field, widened into searchable scenes ───
CATEGORY = {
  'beach':       ['beach','coast','sea','ocean','sand','shore'],
  'coast':       ['coast','sea','ocean','shore','cliffs'],
  'harbor':      ['harbor','harbour','port','boats','waterfront','water'],
  'port':        ['port','harbor','harbour','ships','boats','waterfront'],
  'canal':       ['canal','water','boats','waterfront'],
  'river':       ['river','water','waterfront'],
  'waterfall':   ['waterfall','water','falls'],
  'fjord':       ['fjord','mountain','water','cliffs'],
  'glacier':     ['glacier','ice','cold','mountain'],
  'mountain':    ['mountain','mountains','peaks','alpine','highlands'],
  'volcano':     ['volcano','mountain','crater','geology'],
  'desert':      ['desert','dunes','arid'],
  'city':        ['city','urban','streets','buildings'],
  'skyline':     ['skyline','city','urban','buildings','downtown'],
  'square':      ['square','plaza','city','urban','people'],
  'street':      ['street','city','urban','people'],
  'crossing':    ['crossing','street','city','urban','people'],
  'promenade':   ['promenade','waterfront','city','people'],
  'market':      ['market','city','people','food','shopping'],
  'landmark':    ['landmark','monument','icon','sightseeing'],
  'sacred':      ['sacred','religion','pilgrimage','holy','worship'],
  'stage':       ['stage','live music','music','bar','venue'],
  'airport':     ['airport','planes','aviation','plane spotting','runway'],
  'railway':     ['railway','trains','rail','trainspotting','railfan'],
  'locks':       ['locks','lock','ships','freighters','canal','water','shipping'],
  'zoo':         ['zoo','wildlife','animals'],
  'aquarium':    ['aquarium','underwater','fish','indoor','ocean'],
  'kelp forest': ['kelp forest','underwater','aquarium','ocean','fish','indoor'],
  'reef':        ['reef','underwater','coral','ocean','fish','tropical'],
  'manatees':    ['manatees','underwater','wildlife','animals','river'],
  'bears':       ['bears','wildlife','animals','forest'],
  'wolves':      ['wolves','wildlife','animals','forest'],
  'feeder':      ['feeder','birds','wildlife','animals'],
  'nest':        ['nest','birds','wildlife','animals'],
  'waterhole':   ['waterhole','safari','wildlife','animals','africa','savanna'],
  'aurora':      ['aurora','northern lights','night sky','stars','dark sky'],
}

# Scenes that are busy with people, and scenes that are still.
BUSY  = {'square','street','crossing','market','city','airport','stage','promenade','landmark'}
QUIET = {'mountain','glacier','fjord','desert','aurora','nest','feeder','reef',
         'kelp forest','waterhole','volcano','coast'}
# Scenes where a city lights up after dark.
LIT   = {'skyline','city','square','crossing','street','promenade','harbor',
         'locks','canal','railway'}
# Scenes where the compass heading says nothing about the sun.
INDOOR = {'aquarium','kelp forest','reef','manatees','stage'}

# ── the part no field knows ────────────────────────────────────────────────
EXTRAS = {
 'Junedive Front Beach, Moalboal': ['diving','snorkelling','tropical','island','reef','turquoise'],
 'Maribago Port, Mactan': ['ferry','island','tropical','fishing boats'],
 'Mayon Volcano': ['eruption','perfect cone','lava','bicol'],
 'Agdao Public Market': ['street food','crowd','stalls','mindanao'],
 'Bankerohan street food': ['street food','stalls','crowd','mindanao'],
 'Rialto Bridge, Venice': ['bridge','canal','gondolas','historic','tourists','venezia'],
 'Grand Canal, Venice': ['gondolas','vaporetto','historic','palazzi','venezia'],
 "St Mark's Basin, Venice": ['lagoon','san marco','historic','gondolas','venezia'],
 'Piazza del Campo, Siena': ['medieval','historic','palio','tuscany'],
 'Piazza del Comune, Assisi': ['medieval','historic','umbria','pilgrimage'],
 'Manarola, Cinque Terre': ['village','colourful houses','cliffs','riviera','hiking'],
 'Maria Pia Beach, Sardinia': ['island','mediterranean','pine'],
 'Sottomarina beach, Chioggia': ['adriatic','umbrellas','lido'],
 'Mount Etna': ['eruption','lava','ash','snow','sicilia'],
 'Dolomites panorama': ['alps','peaks','snow','hiking','ski','south tyrol'],
 'Florence': ['duomo','renaissance','historic','firenze','arno','rooftops'],
 'Seoul Station Plaza': ['station','commuters','trains','busy'],
 'Han River at Banpo Bridge': ['bridge','hangang','fountain','night lights'],
 'Han River skyline, Yeouido': ['hangang','63 building','night lights','downtown'],
 'Dongdaemun Design Plaza': ['architecture','zaha hadid','night lights','ddp'],
 'Gwangan Bridge and Gwangalli Beach': ['bridge','night lights','diamond bridge','seaside'],
 'Haeundae Beach': ['seaside','high rises','crowd','resort'],
 'Gangmun Beach, Gangneung': ['sunrise','east sea','surf','seaside'],
 'Kelp Forest Cam': ['kelp','sardines','calm','monterey','sea otters'],
 'Open Sea Cam': ['tuna','sharks','sardines','open ocean','blue','monterey'],
 'Jelly Cam': ['jellyfish','jellies','calm','hypnotic','monterey'],
 'Tropical Reef Camera': ['coral','tropical fish','colourful','long beach'],
 'Shark Lagoon': ['sharks','rays','long beach'],
 'Blue Cavern': ['fish','catalina','blue','long beach'],
 'Homosassa Springs Underwater Manatees': ['sea cows','springs','clear water','florida springs'],
 'Utopia Village Underwater Coral': ['coral','caribbean','tropical','diving','bay islands'],
 'USC Wrigley Catalina Marine Reserve': ['kelp','catalina','garibaldi','diving'],
 'Penguins, Underwater View': ['penguins','birds','cute','swimming','long beach'],
 'Underwater Salmon Cam': ['salmon','fish','run','alaska','brooks river'],
 'Silver Springs Underwater Manatee Camera': ['sea cows','springs','clear water','florida springs'],
 'Brooks Falls Brown Bears': ['brown bears','grizzly','salmon','falls','katmai','fat bear week'],
 'Anan Wildlife Observatory, Lower Falls': ['black bears','brown bears','salmon','falls','tongass'],
 'African Watering Hole at Mpala': ['elephants','safari','savanna','laikipia','giraffe'],
 'Tembe Elephant Park Waterhole': ['elephants','safari','tuskers','big five'],
 'Tau Waterhole': ['safari','big five','madikwe','lions','elephants'],
 'Nkorho Bush Lodge': ['safari','big five','sabi sand','leopard','lions','bush'],
 'Panama Fruit Feeder at Canopy Lodge': ['birds','tanagers','rainforest','tropical','birding'],
 'Panama Hummingbird Feeder at Canopy Tower': ['hummingbirds','birds','rainforest','tropical','birding'],
 'Burrowing Owls at the Former Umatilla Chemical Depot': ['owls','burrowing owls','birds','sagebrush','birding'],
 'International Wolf Center, North Camera': ['wolves','pack','forest','snow','boundary waters'],
 'Plains Bison Watering Hole': ['bison','buffalo','prairie','grassland','badlands'],
 'Texas Backyard Wildlife': ['birds','deer','backyard','feeder','birding','hill country'],
 'Banzai Pipeline, North Shore Oahu': ['surf','surfing','waves','barrels','tropical','north shore'],
 'Ala Moana and Magic Island, Honolulu': ['tropical','lagoon','palms','diamond head','surf'],
 'Waikiki Beach from the Marriott': ['surf','tropical','palms','diamond head','resort','crowd'],
 'Halemaumau Crater, Kilauea': ['lava','eruption','crater','caldera','glow','geology'],
 'Lake Hood seaplane base': ['seaplanes','float planes','bush planes','lake','aviation'],
 'Mendenhall Glacier, Juneau': ['ice','glacier','blue ice','alaska','wilderness'],
 'Vancouver Harbour and Canada Place': ['seaplanes','cruise ships','downtown','mountains','night lights'],
 'Golden Gate Bridge across the bay': ['bridge','fog','bay','icon','san francisco bay'],
 'LAX south runways': ['planes','plane spotting','jets','takeoff','landing','busy'],
 'Spray Valley and Mount Rundle, Banff': ['rockies','lake','snow','wilderness','canmore','peaks'],
 'Popocatepetl': ['eruption','ash','snow','crater','popo','geology'],
 'Duluth Ship Canal and Aerial Lift Bridge': ['lift bridge','ore boats','ships','lake superior','great lakes'],
 'Mackinac Bridge from Mackinaw City': ['bridge','straits','great lakes','lake michigan','mighty mac','michigan'],
 'Hollywood Beach Broadwalk': ['boardwalk','palms','crowd','atlantic','south florida'],
 'Horseshoe Falls, Niagara': ['falls','mist','rainbow','icon','tourists','great lakes'],
 'The National Mall from the Washington Monument': ['monument','capitol','lincoln memorial','skyline','nations capital'],
 'Lower Manhattan skyline and One World Trade Center': ['nyc','new york','manhattan','downtown','hudson','freedom tower','night lights'],
 'Statue of Liberty': ['nyc','new york','lady liberty','statue','icon','harbor'],
 'Times Square North, Manhattan': ['nyc','new york','neon','billboards','crowd','night lights','busy'],
 'Santiago and the Cordillera': ['andes','snow peaks','downtown','smog','cordillera'],
 'Valle Nevado in the Andes': ['ski','skiing','snow','andes','resort','piste'],
 'Handelskade waterfront, Willemstad': ['colourful houses','caribbean','waterfront','pontoon bridge','dutch'],
 'Maho Beach landings, Sint Maarten': ['plane spotting','low flying','jets','caribbean','beach','sxm','famous'],
 'Necochea Beach': ['atlantic','sand','resort','seaside'],
 'Avenida 9 de Julio': ['obelisco','traffic','avenue','night lights','crowd'],
 'Ilulissat Icefjord': ['icebergs','arctic','ice','unesco','disko bay','silence'],
 'Copacabana Beach from Posto 6': ['rio','sugarloaf','surf','crowd','tropical','famous'],
 'Reykjavik and Mount Esja': ['harbour','northern lights','nordic','rooftops','esja'],
 'Northern lights over the Golden Circle': ['aurora borealis','night','stars','dark sky','thingvellir'],
 'Madeira runway approach': ['plane spotting','cliffs','island','atlantic','funchal','tricky approach'],
 'Dublin Port mouth': ['ferries','ships','irish sea','poolbeg'],
 'Poolbeg Lighthouse and the mouth of the Liffey': ['lighthouse','liffey','irish sea','great south wall'],
 "Arthur's Seat and Salisbury Crags": ['hill','crags','old town','historic','scotland','edinburgh castle'],
 'Abbey Road crossing': ['beatles','zebra crossing','famous','music history','london'],
 'The Thames and the City from Bankside': ['thames','st pauls','shard','bridges','night lights','london'],
 'Mierlo-Hout level crossing': ['trains','level crossing','trainspotting','dutch rail'],
 'Cologne Cathedral': ['cathedral','dom','gothic','church','historic','rhine'],
 'Geirangerfjord from Hotel Union': ['fjord','cruise ships','waterfalls','unesco','norway','seven sisters'],
 "Grimentz in the Val d'Anniviers": ['alps','village','ski','snow','chalets','valais'],
 'Eiger, Monch and Jungfrau over Lake Thun': ['alps','eiger','jungfrau','snow peaks','lake','famous'],
 "St Peter's Square": ['vatican','basilica','pope','church','colonnade','pilgrimage','crowd'],
 "St Peter's dome across Rome": ['vatican','basilica','dome','rooftops','historic','roma'],
 'Zell am See and the Zeller See': ['lake','alps','village','ski','snow','austria'],
 'Namib Desert waterhole': ['dunes','oryx','desert','namib','solitude','stars'],
 'Okaukuejo waterhole, Etosha': ['elephants','rhino','safari','etosha','floodlit','big five'],
 "Sea Point and Lion's Head": ['promenade','atlantic','lions head','cape town','mountain'],
 'Table Mountain from Bloubergstrand': ['table mountain','icon','beach','kitesurfing','cape town'],
 'Tromso harbour and the Arctic sound': ['arctic','northern lights','snow','fjord','boats','polar night'],
 'Aurora over Kilpisjarvi': ['aurora borealis','night','stars','snow','arctic','dark sky','lapland'],
 'Senyati waterhole': ['elephants','safari','chobe','bush','tuskers'],
 'The Kotel, close view': ['western wall','wailing wall','prayer','judaism','jerusalem','old city','historic'],
 'Western Wall plaza, Jerusalem': ['western wall','wailing wall','prayer','judaism','jerusalem','old city','crowd'],
 'ol Donyo waterhole': ['elephants','safari','chyulu hills','kilimanjaro','bush'],
 'The Kaaba, Masjid al-Haram': ['kaaba','mecca','grand mosque','islam','hajj','umrah','pilgrimage','crowd','tawaf'],
 'Yiti cliffs near Muscat': ['cliffs','arabian sea','desert','solitude'],
 'Ala-Too Square, Bishkek': ['plaza','soviet architecture','central asia'],
 'Zailiysky Alatau above Almaty': ['tien shan','snow peaks','mountains','central asia'],
 'Kathmandu river bend': ['himalaya','bagmati','south asia','rooftops'],
 'Crystal Bay Beach, Koh Samui': ['tropical','island','turquoise','palms','gulf of thailand'],
 'Bangkok skyline': ['night lights','high rises','krungthep','downtown','busy'],
 'Semeru': ['eruption','ash','java','mahameru','geology'],
 'Bukit Jimbaran panorama, Bali': ['tropical','cliffs','bali','indian ocean','resort'],
 'Mount Fuji from Lake Kawaguchi': ['fuji','fujisan','lake','snow','icon','japan'],
 'Shibuya Scramble Crossing': ['scramble','crowd','neon','night lights','tokyo','famous','busy'],
 'Tokyo Tower from Shiodome': ['tokyo tower','night lights','high rises','downtown','icon'],
 'Odaiba and the Rainbow Bridge, Tokyo': ['rainbow bridge','bay','night lights','skyline'],
 'Haneda plane spotting, Tokyo': ['plane spotting','jets','runway','bay','busy'],
 'Werribee lion plains': ['lions','safari','open range zoo','animals','melbourne'],
 'Melbourne skyline from Southbank': ['yarra','night lights','downtown','high rises'],
 'Sydney Harbour, the Bridge and the Opera House': ['opera house','harbour bridge','icon','ferries','famous'],
 'Brisbane skyline from Bowen Hills': ['brisbane river','night lights','downtown','high rises'],
 'Auckland skyline and Waitemata Harbour': ['sky tower','harbour','yachts','downtown','night lights'],
 'Lyall Bay, Wellington': ['surf','wind','cook strait','seaside','planes'],
 "Hog's Breath Saloon stage": ['live band','bar','key west','music','duval street','nightlife','honky tonk'],
 'Soo Locks': ['freighters','lakers','great lakes','locks','ships','ship horns','michigan','upper peninsula','sault ste marie','soo'],
 'Deshler Diamond': ['trains','railfan','trainspotting','diamond','csx','level crossing','freight','ohio'],
 'Welland Canal at Port Colborne': ['freighters','canal','lift bridge','seaway','ships','ship spotting','niagara','ontario','great lakes'],
 'Kiel-Holtenau Lock': ['kiel canal','nord-ostsee-kanal','schleuse','locks','ships','ship spotting','baltic','holtenau'],
}


def norm(s):
    """Lowercase, strip accents, squeeze spaces - the form tags are stored in."""
    s = unicodedata.normalize('NFKD', str(s))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return ' '.join(s.lower().replace('&', ' and ').split()).strip(" .,'\"")


def tags_for(cam):
    out = []
    def add(*vals):
        for v in vals:
            v = norm(v)
            if v and v not in out:
                out.append(v)

    # place, outward from the camera
    for part in str(cam.get('location', '')).split(','):
        p = norm(part)
        # "seen from Brooklyn" is a note about the vantage, not a place name
        p = p.replace('seen from ', '')
        if p and len(p) > 1:
            add(p)
            add(*PLACE_ALIAS.get(p, []))
    country = cam.get('country', '')
    add(country)
    add(*COUNTRY.get(country, []))
    add(*PLACE_ALIAS.get(norm(country), []))

    # scene
    cat = cam.get('category', '')
    add(cat)
    add(*CATEGORY.get(cat, []))

    # the things only a person knows about the place
    add(*EXTRAS.get(cam['name'], []))

    # qualities read off the record itself
    if cat in BUSY:  add('busy')
    if cat in QUIET: add('quiet')
    if cat in LIT:   add('night lights')
    h = (cam.get('pose') or {}).get('heading')
    if h is not None and cat not in INDOOR:
        h %= 360
        if 225 <= h <= 315: add('sunset-facing', 'sunset')
        if 45 <= h <= 135:  add('sunrise-facing', 'sunrise')
    if cam.get('live_window'):
        add('part-time')
    elif cam.get('always_on'):
        add('always-on')
    # `unknown` audio means nobody has listened yet, so it is not a promise of
    # sound; `music` is a radio bed the app mutes on purpose.
    if cam.get('audio') in ('ambience', 'live-music'):
        add('has-sound')
    elif cam.get('audio') == 'music':
        add('music bed')
    return out


def main():
    p = D / 'cameras.json'
    data = json.loads(p.read_text(encoding='utf-8'))
    missing = [c['name'] for c in data['cameras'] if c['name'] not in EXTRAS]
    for cam in data['cameras']:
        cam['tags'] = tags_for(cam)
    data['tag_notes'] = [
        'Every camera carries a `tags` array: place (city, region, country, continent, '
        'aliases people type), scene (beach, skyline, waterhole, zoo), and qualities '
        '(busy, quiet, night lights, sunset-facing, always-on, has-sound).',
        'Generated by tag.py, which rewrites the array from the camera\'s own fields '
        'plus a hand-written table of what no field knows. Edit tag.py, not this file.',
        'has-sound marks cameras confirmed to carry real ambience or live music. '
        'audio: "unknown" means nobody has listened yet, so it gets no tag.',
    ]
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    n = len(data['cameras'])
    total = sum(len(c['tags']) for c in data['cameras'])
    print(f'tagged {n} cameras, {total} tags, {total/n:.1f} each')
    if missing:
        print(f'no hand-written extras for {len(missing)}:', *missing, sep='\n  ')


if __name__ == '__main__':
    main()
