// Shared bass tunings and playable-position mapping for ChordPilot and alphaTab.
(function(root){
  const configs={
    4:{strings:['G','D','A','E'],midi:[43,38,33,28],label:'E–A–D–G'},
    5:{strings:['G','D','A','E','B'],midi:[43,38,33,28,23],label:'B–E–A–D–G'},
    6:{strings:['C','G','D','A','E','B'],midi:[48,43,38,33,28,23],label:'B–E–A–D–G–C'}
  };
  const pitchNames=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
  function normalizeStringCount(value){const count=Number(value);return configs[count]?count:4;}
  function recommendedStringCount(notes){
    const pitches=(Array.isArray(notes)?notes:[]).map(note=>note?.midi).filter(midi=>Number.isInteger(midi));
    return pitches.some(midi=>midi<28)?5:4;
  }
  function configFor(value){const count=normalizeStringCount(value),config=configs[count];return {count,strings:[...config.strings],midi:[...config.midi],label:config.label};}
  function positions(midi,value,maxFret=24){
    const config=configFor(value);if(!Number.isInteger(midi))return [];
    return config.midi.map((open,index)=>({string:index+1,fret:midi-open}))
      .filter(position=>position.fret>=0&&position.fret<=maxFret)
      .sort((a,b)=>a.fret-b.fret||a.string-b.string);
  }
  function pitchName(midi){return `${pitchNames[((midi%12)+12)%12]}${Math.floor(midi/12)-1}`;}
  function rangeLabel(value,maxFret=24){
    const config=configFor(value),low=Math.min(...config.midi),high=Math.max(...config.midi)+maxFret;
    return `${pitchName(low)}–${pitchName(high)}`;
  }
  function unavailableReason(midi,value,maxFret=24){
    const config=configFor(value),low=Math.min(...config.midi),high=Math.max(...config.midi)+maxFret;
    if(midi<low)return `${pitchName(midi)} is below the lowest open string ${pitchName(low)}.`;
    if(midi>high)return `${pitchName(midi)} is above the highest string's ${maxFret}th fret (${pitchName(high)}).`;
    return `${pitchName(midi)} has no position within the selected tuning and ${maxFret}-fret range.`;
  }
  const api={normalizeStringCount,recommendedStringCount,configFor,positions,pitchName,rangeLabel,unavailableReason};
  if(typeof module!=='undefined')module.exports=api;else root.BassTuning=api;
})(globalThis);
