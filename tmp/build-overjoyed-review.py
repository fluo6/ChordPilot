import hashlib,json,pathlib,shutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
base=ROOT/'outputs/song-structure/overjoyed-benchmark'
out=base/'review';out.mkdir(exist_ok=True)
chart=json.loads((ROOT/'outputs/song-structure/semantic-session-update/overjoyed.chordpilot-session.json').read_text(encoding='utf-8'))['chart']
variants=[]
for code,path,title,description in [
    ('consensus',ROOT/'outputs/song-structure/songformer-experiment/overjoyed.consensus-v2.json','Multi-stage candidate · content consensus','All 11 boundaries match within 0.5 s on the provisional development reference. Content-group agreement 99.9%. Roles are withheld on 29.8% of the duration; letters identify recurring content.'),
    ('edge',base/'edge-guard.json','Partial candidate · recording-edge guard','Intro recovered automatically. Roles still wrong elsewhere. Provisional role agreement 72.4%; boundary F1 at 0.5 s 28.6%.'),
    ('baseline',base/'baseline.json','Frozen baseline · All-In-One','Original saved model output before this tuning. Provisional role agreement 67.5%; boundary F1 at 0.5 s 28.6%.'),
    ('beat',base/'beat-window.json','Rejected · shorter peak window','Recovers intro but creates 30 sections. Boundary precision worsens. Not selected for saved results.'),
    ('content',base/'content/overjoyed/selected.json','Rejected · automatic content clustering','A/B describe acoustic content clusters, not Verse/Chorus. Automatic selection merged the opening; not selected for saved results.'),
    ('reference',ROOT/'tests/fixtures/structure-references/overjoyed.development.json','Evaluation only · provisional research reference','Research-derived section map aligned to the saved musical grid. NOT an algorithm prediction or verified ground truth. Never read by inference.'),
]:
    d=json.loads(path.read_text(encoding='utf-8'));name=code+'.json';shutil.copyfile(path,out/name)
    rows=[]
    for row in d['segments']:
        label=(row.get('role') or row.get('group')) if code=='consensus' else row.get('group') if code=='content' else row.get('label') or row.get('role') or row.get('group') or 'Unknown'
        near=min(range(len(chart['bars'])),key=lambda i:abs(chart['bars'][i]['start']-row['start']))+1
        rows.append({**row,'label':label,'start_bar':near})
    variants.append({'id':code,'title':title,'description':description,'raw':name,'segments':rows,
                     'provenance':'Evaluation reference only; no inference inputs.' if code=='reference' else 'Audio-derived predictions. No reference timestamps, saved labels or manual correction entered inference.'})
songformer=ROOT/'outputs/song-structure/songformer-experiment/overjoyed.raw.json'
if songformer.exists():
    d=json.loads(songformer.read_text());shutil.copyfile(songformer,out/'songformer.json')
    rows=[{**r,'start_bar':min(range(len(chart['bars'])),key=lambda i:abs(chart['bars'][i]['start']-r['start']))+1} for r in d['segments']]
    variants.insert(1,{'id':'songformer','title':'Candidate · SongFormer native','description':'Separate pinned author model, raw output. Provisional role agreement 77.7%; some transitions and the instrumental are missed.','raw':'songformer.json','segments':rows,'provenance':'Audio only. Native labels/times; no reference or chart enters inference.'})
data={'tracks':[{'id':'overjoyed','title':'Overjoyed','artist':'Stevie Wonder','duration':chart['duration'],
                 'media':'../../model-comparison/media/overjoyed.mp3','variants':variants}]}
# The v3 upgrade is compared with preserved v2 data; bar hints are display only.
experiments=ROOT/'outputs/song-structure/songformer-experiment'
def upgraded_variant(slug,version,display_chart):
    source=experiments/(slug+'.consensus-'+version+'.json')
    d=json.loads(source.read_text(encoding='utf-8'))
    name=source.name;shutil.copyfile(source,out/name)
    coverage=sum(r['end']-r['start'] for r in d['segments'] if r['role'])/d['duration']
    rows=[{**r,'label':r['role'] or r['group'],
           'start_bar':min(range(len(display_chart['bars'])),key=lambda i:abs(display_chart['bars'][i]['start']-r['start']))+1}
          for r in d['segments']]
    return {'id':version,'title':'Upgraded · occurrence roles' if version=='v3' else 'Previous · pooled roles',
            'description':f'Names roles on {coverage:.1%} of the recording. Coverage is not accuracy. '
                          +('Strong occurrence evidence is preserved even when sections share harmony. ' if version=='v3' else '')
                          +('Overjoyed boundaries and labels are unchanged from v2; reference remains provisional.' if slug=='overjoyed' else 'No verified reference is available for this recording.'),
            'raw':name,'segments':rows,
            'provenance':'Audio-derived experiment. A/B/C groups use harmony and texture; they do not establish equal melody or functional role. No manual answers enter inference.'}
data['tracks'][0]['variants'].insert(0,upgraded_variant('overjoyed','v3',chart))
for slug,title,artist in [('i-love-you-3000','I Love You 3000','Stephanie Poetri'),
                          ('waste-of-time','Waste of Time','9m88'),
                          ('ballad','Ballad','J.Sheon'),('liangbo','曾经是情侣','梁博')]:
    if not (experiments/(slug+'.consensus-v3.json')).exists():continue
    display_chart=json.loads((ROOT/'outputs/song-structure/semantic-session-update'/(slug+'.chordpilot-session.json')).read_text(encoding='utf-8'))['chart']
    options=[upgraded_variant(slug,v,display_chart) for v in ('v3','v2') if (experiments/(slug+'.consensus-'+v+'.json')).exists()]
    source=experiments/(slug+'.raw.json');d=json.loads(source.read_text(encoding='utf-8'))
    shutil.copyfile(source,out/source.name)
    native_rows=[{**r,'start_bar':min(range(len(display_chart['bars'])),key=lambda i:abs(display_chart['bars'][i]['start']-r['start']))+1} for r in d['segments']]
    options.append({'id':'native','title':'SongFormer · native output','description':'Untouched author output; not a verified song form.',
                    'raw':source.name,'segments':native_rows,'provenance':'Audio only; author decoder and labels retained, including frame-rounded endpoint.'})
    data['tracks'].append({'id':slug,'title':title,'artist':artist,'duration':d['duration'],
                           'media':'../../model-comparison/media/'+slug+'.mp3','variants':options})
# Preserve rejected calibration hypotheses for inspection without promoting them.
ablation=ROOT/'outputs/song-structure/calibration-run-1/i-love-you-3000.phrase-merge.json'
if ablation.exists():
    track=next(t for t in data['tracks'] if t['id']=='i-love-you-3000')
    track['variants'][0]['description']+=' Calibration run 1: fragmentation remains unresolved; original session unchanged.'
    d=json.loads(ablation.read_text());shutil.copyfile(ablation,out/ablation.name)
    track['variants'].append({'id':'phrase-merge-rejected','title':'Rejected · merge same native roles',
        'description':'14 → 7 intervals, but named-role coverage drops from 56.0% to 40.7%. The same rule removes 5 of 11 expected boundaries in the provisional Overjoyed regression. Fewer sections did not establish better recognition.',
        'raw':ablation.name,'segments':[{**r,'label':r['role'] or 'Unclassified'} for r in d['segments']],
        'provenance':'Audio predictions only. Evaluation is separate. Rejected experiment; no original-session changes.'})

ablation=ROOT/'outputs/song-structure/calibration-run-2/waste-of-time.scale-12.json'
if ablation.exists():
    track=next(t for t in data['tracks'] if t['id']=='waste-of-time')
    track['variants'][0]['description']+=' Calibration run 2: later roles and grouping remain unresolved; original session unchanged.'
    d=json.loads(ablation.read_text());shutil.copyfile(ablation,out/ablation.name)
    track['variants'].append({'id':'boundary-scale-rejected','title':'Rejected globally · 12-second boundary window',
        'description':'16 → 11 sections and 13 → 8 groups; named-role coverage stays 45.8%. Applied across songs, this window loses 4 of 11 provisional Overjoyed boundaries and weakens grouping. Retained for listening, not promoted.',
        'raw':ablation.name,'segments':[{**r,'label':r['role'] or r['group']} for r in d['segments']],
        'provenance':'Same audio-derived model logits, author boundary window, unchanged content and role consensus. No fixed form or alphabet cap. No original-session changes.'})

ablation=ROOT/'outputs/song-structure/calibration-run-3/ballad.weak-self-repeat.json'
if ablation.exists():
    track=next(t for t in data['tracks'] if t['id']=='ballad')
    track['variants'][0]['description']+=' Calibration run 3: weak repeated-phrase splits diagnosed. New candidate is available; musical accuracy remains unverified and original session unchanged.'
    d=json.loads(ablation.read_text());shutil.copyfile(ablation,out/ablation.name)
    display_chart=json.loads((ROOT/'outputs/song-structure/semantic-session-update/ballad.chordpilot-session.json').read_text(encoding='utf-8'))['chart']
    track['variants'].append({'id':'weak-self-repeat','title':'Candidate · boundary-supported phrase merge',
        'description':'17 → 12 sections; 9 → 7 content groups. Five weak boundaries inside repeated Intro/Verse/Chorus phrases are merged. Named-role coverage stays 67.3%; all pointwise roles and fine evidence are preserved. Overjoyed regression metrics are unchanged. Unknown pre-chorus/instrumental spans and harmonic grouping remain unresolved. Not imported into the original session.',
        'raw':ablation.name,'segments':[{**r,'label':r['role'] or r['group'],
            'start_bar':min(range(len(display_chart['bars'])),key=lambda i:abs(display_chart['bars'][i]['start']-r['start']))+1} for r in d['segments']],
        'provenance':'Audio-derived boundary logits plus existing accepted roles and content groups. General rule tested on five caches; no song-specific branches, references, supplied boundaries or manual corrections. Unpromoted listening candidate.'})

ablation=ROOT/'outputs/song-structure/calibration-run-4/liangbo.weak-self-repeat.json'
if ablation.exists():
    track=next(t for t in data['tracks'] if t['id']=='liangbo')
    track['variants'][0]['description']+=' Calibration run 4: 151.08 seconds remain unclassified; shared harmony crosses Verse/Chorus/Instrumental. Original session unchanged.'
    d=json.loads(ablation.read_text());shutil.copyfile(ablation,out/ablation.name)
    display_chart=json.loads((ROOT/'outputs/song-structure/semantic-session-update/liangbo.chordpilot-session.json').read_text(encoding='utf-8'))['chart']
    track['variants'].append({'id':'weak-self-repeat','title':'Candidate · boundary-supported phrase merge',
        'description':'28 → 25 sections, 11 content groups. Three weak same-role repeat boundaries are merged at 2:09.79, 3:35.12 and 5:50.23. Named-role coverage remains 62.5%, not accuracy. Fourteen unclassified intervals and harmony-based grouping remain unresolved. Overjoyed regression unchanged; no original-session import.',
        'raw':ablation.name,'segments':[{**r,'label':r['role'] or r['group'],
            'start_bar':min(range(len(display_chart['bars'])),key=lambda i:abs(display_chart['bars'][i]['start']-r['start']))+1} for r in d['segments']],
        'provenance':'Frozen run-3 general rule reproduced on five audio caches. All pointwise roles and fine evidence preserved. Research timestamps are evaluation-only and never enter inference. Unpromoted listening candidate.'})

final_audit=ROOT/'outputs/song-structure/calibration-run-5/overjoyed-diagnostics.json'
if final_audit.exists():
    audit=json.loads(final_audit.read_text(encoding='utf-8'))
    track=next(t for t in data['tracks'] if t['id']=='overjoyed')
    track['variants'][0]['description']+=f" Final regression: {audit['sections']} sections and {audit['groups']} groups unchanged; {audit['unknown_seconds']:.1f} seconds remain unclassified. Five-song pass reviewed; no candidate promoted or original session overwritten."

# Evidence is a separate listening aid, never a new inferred partition.
recurrence=ROOT/'outputs/song-structure/representation-stages/recurrence'
for track in data['tracks']:
    source=recurrence/(track['id']+'.json')
    if not source.exists():continue
    report=json.loads(source.read_text(encoding='utf-8'))
    assert report['selected_partition'] is None and report['independent_accuracy'] is None
    name=track['id']+'.representation.json';shutil.copyfile(source,out/name)
    track['representation']={'raw':name,'occurrences':report['occurrences'],
        'pairs':report['pairs'],'unanimous':report['summary']['unanimous_reciprocal_pairs']}
shutil.copyfile(ROOT/'scripts/testing/structure-representation-review.js',out/'structure-representation-review.js')
template=(ROOT/'tmp/semantic-review-template.html').read_text(encoding='utf-8')
template=template.replace('<div class="scroll"><table>',
    '<details id="representation" class="panel" style="margin-top:16px"></details><div class="scroll"><table>',1)
template=template.replace('<script>','<script src="structure-representation-review.js"></script><script>',1)
template=template.replace('ChordPilot / Pretrained model experiment','ChordPilot / Overjoyed development benchmark')
template=template.replace('Song form from the audio','Song structure · algorithm comparison')
template=template.replace('Compare untouched model predictions with the previous acoustic-group baseline.','Compare algorithm candidates and the frozen baseline. No 100% result has been established.')
template=template.replace('Raw prediction','Data / provenance').replace('<label for="method">Detector</label>','<label for="method">Compare</label>')
start=template.index('<p class="sources">');stop=template.index('</p>',start)+4
template=template[:start]+'<p class="sources">Reference sources: <a href="https://tonyconniff.com/stevie-wonders-overjoyed-under-the-hood/">Tony Conniff</a> · <a href="https://www.poparad.com/pdf/overjoyed-c.pdf">Poparad lead sheet</a>. The complete recording-specific annotation is provisional and has not received an independent listening audit.</p>'+template[stop:]
template=template.replace("const names={", "const names={instrumental:'Instrumental',pre_chorus:'Pre-chorus','pre-chorus':'Pre-chorus',")
template=template.replace('<th>From</th>','<th>Content group</th><th>From</th>')
template=template.replace("[String(i+1),name(s.label),fmt(s.start)","[String(i+1),name(s.label),s.group || '—',fmt(s.start)")
template=template.replace("variant.id==='builtin'?'Acoustic group':'Predicted role'", "variant.id==='reference'?'Provisional reference role':variant.id==='content'?'Content group / candidate role':'Predicted role'")
# Naming is presentation only. Preserve all underlying boundaries and decisions.
template=template.replace('<div id="description"',
    '<div class="method"><label for="naming">Section names</label><select id="naming">'
    '<option value="roles">Named roles</option><option value="groups">A / B / C groups</option>'
    '<option value="mixed">Mixed roles and groups</option></select></div><div id="description"')
template=template.replace("let index=0,track,variant,selected=-2;", """let index=0,track,variant,selected=-2,clipEnd=null;
  let storage;try{storage=localStorage;}catch{}
  const evidence=CPRepresentationReview.mount(el('representation'),range=>{play(range.start);clipEnd=range.end;});
  const conventions=new Map();
  function displayLabel(section) {
    const mode=el('naming').value;
    if(section.native_label==='silence' && section.role===null)return 'Unclassified';
    if(mode==='mixed')return section.label;
    if(mode==='groups')return section.group || 'Unclassified';
    if(Object.prototype.hasOwnProperty.call(section,'role'))return section.role || 'Unclassified';
    return ['intro','verse','chorus','bridge','outro','inst','instrumental','solo','pre_chorus','pre-chorus'].includes(section.label) ? section.label : 'Unclassified';
  }""")
template=template.replace("variant=track.variants.find(v=>v.id===el('method').value);selected=-2;", """const source=track.variants.find(v=>v.id===el('method').value);
    variant={...source,segments:source.segments.map(s=>({...s,label:displayLabel(s)}))};selected=-2;
    for(const row of el('rows').closest('table').querySelectorAll('thead tr'))row.children[2].hidden=el('naming').value!=='mixed';""")
template=template.replace("if(j===1){const badge", "if(j===2)td.hidden=el('naming').value!=='mixed';if(j===1){const badge")
template=template.replace("audio.src=track.media;", "clipEnd=null;el('naming').value=conventions.get(track.id) || CPRepresentationReview.loadNaming(storage,track.id);audio.src=track.media;")
template=template.replace("el('method').addEventListener('change',render);", "el('naming').addEventListener('change',()=>{conventions.set(track.id,el('naming').value);CPRepresentationReview.saveNaming(storage,track.id,el('naming').value);render();});el('method').addEventListener('change',render);")
template=template.replace('function play(time){','function play(time){clipEnd=null;')
template=template.replace('if(!variant)return;', 'if(!variant)return;if(clipEnd!==null&&audio.currentTime>=clipEnd){audio.pause();audio.currentTime=clipEnd;clipEnd=null;}')
template=template.replace("el('description').textContent=variant.description;", "evidence.show(['native-recurrence','contextual-recurrence'].includes(source.id)?null:track.representation);el('description').textContent=variant.description;")
template=template.replace("el('provenance').textContent=variant.provenance;", "el('provenance').textContent=variant.provenance+' Display choice changes names only. Unknown roles remain Unclassified; group letters are not artificially capped.';el('role-heading').textContent=el('naming').value==='groups'?'Content group':'Predicted role';")
# Preserve the historical prediction manifest used by integrity checks.
retained={'tracks':[{k:v for k,v in t.items() if k!='representation'} for t in data['tracks']]}
(out/'manifest.json').write_text(json.dumps(retained,indent=2)+'\n',encoding='utf-8')
(out/'representation-manifest.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
# New experiments extend only the current presentation. Historical manifests stay frozen.
for track in data['tracks']:
    source=ROOT/'outputs/song-structure/native-recurrence-candidate'/(track['id']+'.json')
    if not source.exists():continue
    candidate=json.loads(source.read_text(encoding='utf-8'))
    assert candidate['source_hash']==json.loads((experiments/(track['id']+'.raw.json')).read_text())['source_hash']
    original=next(v for v in track['variants'] if v['id'] in ('native','songformer'))
    assert [(s['start'],s['end']) for s in candidate['segments']]==[(s['start'],s['end']) for s in original['segments']]
    name=track['id']+'.native-recurrence.json';shutil.copyfile(source,out/name)
    rows=[{**s,'start_bar':r['start_bar']} for s,r in zip(candidate['segments'],original['segments'])]
    fmt=lambda t:f'{int(t//60)}:{t%60:05.2f}'
    notes=[]
    for s in rows:
        d=s['decision']
        if 'proposed_label' in d and d['proposed_label']!=s['native_label']:
            status='applied' if d['basis']=='reciprocal_audio_consensus' else 'withheld'
            notes.append(f"{fmt(s['start'])}–{fmt(s['end'])}: audio match proposes {d['proposed_label']} ({status}).")
    track['variants'].append({'id':'native-recurrence','title':'Candidate · native sections + recurrence audit',
        'description':f"{len(rows)} native occurrences retained, including consecutive same-role sections. "
                      f"{len(candidate['summary']['changes'])} role changes passed the conservative audio rule. "
                      'Names are model hypotheses, not verified labels. Silence displays as Unclassified. '
                      +' '.join(notes),
        'raw':name,'segments':rows,
        'provenance':'Native audio-only boundaries and original role posteriors; eight ordered SSL feature views. '
                     'No references, expected sequences or song-specific rules in inference. '
                     'No content-group partition inferred. Original sessions unchanged.'})
for track in data['tracks']:
    source=ROOT/'outputs/song-structure/contextual-role-candidate'/(track['id']+'.json')
    if not source.exists():continue
    candidate=json.loads(source.read_text(encoding='utf-8'))
    native=json.loads((experiments/(track['id']+'.raw.json')).read_text())
    assert candidate['source_hash']==native['source_hash']
    assert [(s['start'],s['end']) for s in candidate['segments']]==[(s['start'],s['end']) for s in native['segments']]
    original=next(v for v in track['variants'] if v['id'] in ('native','songformer'))
    name=track['id']+'.contextual-roles.json';shutil.copyfile(source,out/name)
    rows=[{**s,'start_bar':r['start_bar']} for s,r in zip(candidate['segments'],original['segments'])]
    changes=candidate['summary']['changes']
    track['variants'].append({'id':'contextual-recurrence','title':'Candidate · context-aware roles',
        'description':f"{len(rows)} native occurrences retained. {len(changes)} uncertain role refinements from repeated audio and section context. "
                      'Consecutive choruses stay separate; silence displays as Unclassified. '
                      'Development candidate: musical accuracy has not been independently validated.',
        'raw':name,'segments':rows,
        'provenance':'Audio-derived role refinement using original model scores and ordered SSL recurrence. '
                     'No supplied sequence, title rules or reference timestamps in inference. '
                     'Full-mix similarity does not isolate lead-vocal melody. Original predictions and sessions preserved.'})
template=template.replace('audio.load();render();history',
    "audio.load();const requestedMethod=new URLSearchParams(location.search).get('method');"
    "if(track.variants.some(v=>v.id===requestedMethod))el('method').value=requestedMethod;render();history")
(out/'current-manifest.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
(out/'index.html').write_text(template.replace('__DATA__',json.dumps(data,ensure_ascii=False).replace('<','\\u003c')),encoding='utf-8')
print(json.dumps({'variants':len(variants),'output':str(out)}))
