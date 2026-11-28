"""Build the public piano song editions from approved symbolic local charts only.

No recordings, captured sample files, private song directory or model weights are copied.
"""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
# A staged release uses its own frozen public score books, so the build also
# works in a normal fresh clone instead of depending on this machine's folders.
IN=HERE/'staff' if (HERE/'staff'/'data.json').is_file() else ROOT/'canon-staff-poc'
LEVELS=('easy','normal','hard','extreme')

def make(book,slug,title):
    master=book['charts']['extreme']['notes']; grades={};Q=48000
    for level in LEVELS:
        c=book['charts'][level]; unit=Q*c['bpm']/60
        def event(n):
            return dict(tick=round(n['time']*unit),duration=max(1,round(n['duration']*unit)),midi=n['midi'],velocity=round(n['velocity']*127))
        tracks=[dict(name='Playable',notes=[event(n) for n in c['notes']]),
                dict(name='Complementary accompaniment',notes=[event(master[i]) for i in c['backingNoteIds']])]
        end=max(round(c['duration']*unit),*(n['tick']+n['duration'] for t in tracks for n in t['notes']))
        grades[level]=dict(ppq=Q,tempoBpm=c['bpm'],endTick=end,tracks=tracks,practiceTracks=[0],hand='both',handLabel='雙手',sourceStartSec=0,
                           title=title,grade=level,songId=slug,sourceLabel=c['sourceLabel'],description=c['description'],
                           symbolicBacking=True,keyFifths=c['keyFifths'],duration=c['duration'])
        if slug=='furElise':
            grades[level]['keyBindings']=c.get('keyboard',book['keyboard'])
            grades[level]['meter']=[c['beatsPerBar'],c['beatType']]
    return grades

def build():
    sources=[('canonMutopia','data.json'),('canonFull','recording.json'),('furElise','elise.json')]
    titles={'canonMutopia':'Canon in D · Mutopia D 調總譜','canonFull':'Canon in D (Short ver)','furElise':'Für Elise · A 小調全譜'}
    books={k:json.loads((IN/n).read_bytes()) for k,n in sources}
    packs={k:make(d,k,titles[k]) for k,d in books.items()}
    for k,p in packs.items():
        for g,s in p.items():
            rows=[{(n['tick'],n['midi']) for n in t['notes']} for t in s['tracks']]
            assert not rows[0]&rows[1]
            assert rows[0]|rows[1]=={(n['tick'],n['midi']) for n in p['extreme']['tracks'][0]['notes']}
    payload=json.dumps(packs,ensure_ascii=False,separators=(',',':'))
    (HERE/'canon-packs.js').write_text('/* Symbolic layered editions; provenance: CANON-LAYERS-NOTICE.md */\nwindow.NocturneSongPacks='+payload+';\nwindow.NocturneFullScore=window.NocturneSongPacks.canonFull.easy;\n',encoding='utf-8',newline='\n')
    (HERE/'canon-layer-sources.json').write_text(json.dumps({k:{'sha256':hashlib.sha256((IN/n).read_bytes()).hexdigest(),'grades':{g:{'keys':len(packs[k][g]['tracks'][0]['notes']),'backing':len(packs[k][g]['tracks'][1]['notes']),'duration':packs[k][g]['duration']} for g in LEVELS}} for k,n in sources},indent=2),encoding='utf-8',newline='\n')
    return packs
if __name__=='__main__':
    for k,p in build().items():print(k,{g:(len(v['tracks'][0]['notes']),len(v['tracks'][1]['notes']),v['duration']) for g,v in p.items()})
