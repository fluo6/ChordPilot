// Source-time occurrences own structure; bar labels are a compatibility projection.
const SongStructure = (() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const duration = chart => typeof chart?.duration === 'number' && Number.isFinite(chart.duration) && chart.duration >= 0 ? chart.duration : null;
  function valid(rows, end) {
    if (!Array.isArray(rows) || end === null) return false;
    if (!rows.length) return end === 0;
    const ids = new Set(); let previous = 0;
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)
        || !Number.isFinite(row.start) || !Number.isFinite(row.end) || row.start !== previous || row.end <= row.start
        || ['label','group','role'].some(key => row[key] != null && typeof row[key] !== 'string')) return false;
      ids.add(row.id); previous = row.end;
    }
    return previous === end;
  }
  function active(chart) {
    const structure = chart?.structure, end = duration(chart);
    if (structure?.version !== 1 || !structure.analysis) return null;
    const rows = structure.manual_segments ?? structure.analysis.segments;
    if (Array.isArray(rows) && !rows.length && structure.manual_segments == null && structure.analysis.status === 'unavailable') return rows;
    return valid(rows, end) ? rows : null;
  }
  function displayMode(chart) {
    if (['roles','groups','mixed'].includes(chart?.structure?.display_mode)) return chart.structure.display_mode;
    const rows=active(chart) || [];
    // Existing hand-written names remain visible until the user selects a convention.
    if (Array.isArray(chart?.structure?.manual_segments) && rows.some(row=>row.label)) return 'mixed';
    return rows.some(row=>row.role) ? 'roles' : 'groups';
  }
  function label(row, mode = 'mixed') {
    if (mode==='roles') return row?.role ? row.role.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()) : 'Unclassified';
    if (mode==='groups') return row?.group || 'Unlabelled';
    return row?.label || (row?.role ? row.role.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : '') || row?.group || 'Unlabelled';
  }
  function setDisplayMode(chart, mode) {
    if (!['roles','groups','mixed'].includes(mode) || !ensure(chart)) return false;
    chart.structure.display_mode=mode;project(chart);return true;
  }
  function at(rows, time, end) { return rows?.find(row => row.start <= time && (time < row.end || time === end && row.end === end)); }
  function project(chart, gridChanged = false) {
    const rows = active(chart); if (!rows) return chart;
    const end = duration(chart),mode=displayMode(chart);
    for (const [index, bar] of (chart.bars || []).entries()) {
      const row = at(rows, index === 0 ? 0 : Number(bar.start), end);
      bar.section = row ? label(row,mode) : 'Unlabelled';
      if (row) bar.section_id = row.id; else delete bar.section_id;
    }
    if (gridChanged) chart.structure.stale = true;
    return chart;
  }
  function ensure(chart) {
    const end = duration(chart); if (!chart || end === null) return null;
    if (chart.structure) { project(chart); return active(chart) ? chart.structure : null; }
    const rows = [];
    for (const [index, bar] of (chart.bars || []).entries()) {
      const start = index === 0 ? 0 : Number(bar.start);
      if (!Number.isFinite(start) || start < 0 || start >= end || rows.length && start <= rows.at(-1).start) continue;
      const text = typeof bar.section === 'string' ? bar.section : '';
      if (rows.length && rows.at(-1).label === text) continue;
      if (rows.length) rows.at(-1).end = start;
      rows.push({id:`legacy-${index}`,start,end,label:text,group:null,role:null,origin:'legacy'});
    }
    chart.structure = {version:1, analysis:{engine:'none',status:'not_analyzed',diagnostics:[],segments:end > 0 ? [
      {id:'s1',start:0,end,group:null,role:null}] : []},manual_segments:rows.some(row=>row.label) && valid(rows,end) ? rows : null,stale:false};
    project(chart); return chart.structure;
  }
  function segments(chart) { ensure(chart); return active(chart) || []; }
  function bindSource(chart,sourceId) {
    if(sourceId && ensure(chart) && !chart.structure.analysis.source_id)chart.structure.analysis.source_id=sourceId;
  }
  function manual(chart) {
    if (!ensure(chart)) return null;
    if (chart.structure.manual_segments == null) {
      chart.structure.manual_segments = copy(active(chart)).map(({evidence,...row})=>({...row,origin:'manual'}));
      if (!chart.structure.manual_segments.length && duration(chart)>0) chart.structure.manual_segments.push(
        {id:'manual-1',start:0,end:duration(chart),group:null,role:null,origin:'manual'});
    }
    return chart.structure.manual_segments;
  }
  function nextId(rows) { let number = 1; while(rows.some(row=>row.id===`manual-${number}`)) number++; return `manual-${number}`; }
  function split(chart, time) {
    const rows = manual(chart); if (!rows || !Number.isFinite(time)) return false;
    const index = rows.findIndex(row=>row.start < time && time < row.end); if (index < 0) return false;
    const row = rows[index], right = {...row,id:nextId(rows),start:time,origin:'manual'};
    row.end = time; row.origin = 'manual'; delete row.evidence;
    rows.splice(index+1,0,right); project(chart); return true;
  }
  function rename(chart, id, text) {
    const row = manual(chart)?.find(row=>row.id===id); if (!row) return false;
    row.label = String(text); row.origin='manual'; delete row.evidence; project(chart); return true;
  }
  function setDetails(chart,id,{label:text,role,group}) {
    const roles=['intro','verse','pre_chorus','chorus','post_chorus','bridge','interlude','solo','instrumental','breakdown','outro'];
    if(role && !roles.includes(role) || group && !/^[A-Z]{1,4}$/.test(group))return false;
    const row=manual(chart)?.find(row=>row.id===id);if(!row)return false;
    row.label=String(text || '');row.role=role || null;row.group=group || null;row.origin='manual';delete row.evidence;
    project(chart);return true;
  }
  function editBar(chart, index, text) {
    ensure(chart); const end = duration(chart), bar = chart.bars?.[index]; if (!bar || end === null) return false;
    const start = index === 0 ? 0 : Number(bar.start), stop = Math.min(end,Number(chart.bars[index+1]?.start ?? end));
    if (!Number.isFinite(start) || !Number.isFinite(stop) || start < 0 || stop <= start) return false;
    split(chart,start); split(chart,stop);
    const rows=manual(chart),first=rows?.findIndex(row=>row.start===start);
    if(!(first>=0))return false;
    const contained=rows.filter(row=>row.start>=start && row.end<=stop);
    const row={...rows[first],end:stop,label:String(text),origin:'manual'};
    if(new Set(contained.map(item=>item.group)).size>1)row.group=null;
    if(new Set(contained.map(item=>item.role)).size>1)row.role=null;
    rows.splice(first,contained.length,row);project(chart);return true;
  }
  function joinPrevious(chart,id) {
    const rows=manual(chart),index=rows?.findIndex(row=>row.id===id); if (!(index>0)) return false;
    const previous=rows[index-1],row=rows[index];previous.end=row.end;previous.origin='manual';
    if(previous.group!==row.group)previous.group=null;
    delete previous.evidence;rows.splice(index,1);project(chart);return true;
  }
  function useDetected(chart) {
    if (!ensure(chart) || !valid(chart.structure.analysis.segments,duration(chart))) return false;
    chart.structure.manual_segments=null;project(chart);return true;
  }
  function preserve(chart,previous,chordsOnly=false) {
    if (!chart) return;
    const beforeHash=previous?.structure?.analysis?.source_hash,afterHash=chart.structure?.analysis?.source_hash;
    const beforeId=previous?.structure?.analysis?.source_id,afterId=chart.structure?.analysis?.source_id;
    const identity=beforeHash && afterHash ? beforeHash===afterHash : beforeId && afterId ? beforeId===afterId : chart.source_path===previous?.source_path;
    const same = previous && identity && duration(chart) === duration(previous);
    if (same) {
      ensure(previous);
      if (previous.structure && (chordsOnly || previous.structure.version !== 1 || !active(previous))) chart.structure=copy(previous.structure);
      else {
        ensure(chart);
        const incoming=chart.structure?.analysis;
        if(chart.structure?.version===1 && previous.structure?.analysis?.status==='estimated'
          && ['unavailable','not_analyzed'].includes(incoming?.status)) {
          chart.structure.analysis={...copy(previous.structure.analysis),source_id:incoming.source_id || previous.structure.analysis.source_id,last_refresh_status:incoming.status,
            diagnostics:[...(Array.isArray(previous.structure.analysis.diagnostics)?previous.structure.analysis.diagnostics:[]),
              ...(Array.isArray(incoming.diagnostics)?incoming.diagnostics:[])]};
        }
        if (previous.structure?.manual_segments && chart.structure?.version===1)chart.structure.manual_segments=copy(previous.structure.manual_segments);
        if (chart.structure?.version===1 && ['roles','groups','mixed'].includes(previous.structure?.display_mode))
          chart.structure.display_mode=previous.structure.display_mode;
      }
    }
    const changed=same && JSON.stringify(chart.bars?.map(bar=>bar.start))!==JSON.stringify(previous.bars?.map(bar=>bar.start));
    ensure(chart);project(chart,Boolean(changed && previous.structure?.analysis?.status==='estimated'));
  }
  function navigation(chart) {
    const rows=segments(chart),bars=chart?.bars || [],mode=displayMode(chart);
    if (!rows.length) {
      const legacy=[];bars.forEach((bar,index)=>{const name=String(bar.section||'Unlabelled');const last=legacy.at(-1);
        if(last?.name===name)last.end=index+1;else legacy.push({id:`legacy-${index}`,name,index,end:index+1,start:Number(bar.start)||0});});return legacy;
    }
    return rows.map((row,ordinal)=>{
      let index=bars.findIndex(bar=>Number(bar.start)>=row.start);if(ordinal===0)index=0;
      if(index<0)index=Math.max(0,bars.length-1);
      const stop=bars.findIndex(bar=>Number(bar.start)>=row.end);
      return {id:row.id,name:label(row,mode),index,end:stop<0?bars.length:stop,start:row.start,stop:row.end,group:row.group,
        origin:row.origin || 'estimated',projected:Number(bars[index]?.start)!==row.start};
    });
  }
  return {ensure,bindSource,segments,project,editBar,preserve,split,rename,setDetails,joinPrevious,useDetected,navigation,valid,label,displayMode,setDisplayMode};
})();
if(typeof module!=='undefined')module.exports=SongStructure;
