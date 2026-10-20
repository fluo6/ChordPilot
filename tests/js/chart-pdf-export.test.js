const test=require('node:test');
const assert=require('node:assert/strict');
const {loadScript}=require('./helpers/load-script');

function exporter(web=false,fail=false){
  const calls=[];
  const chart={title:'Score',bars:[{start:0,chord:'C'}]};
  const {exportChart}=loadScript('src/renderer/actions.js',['exportChart'],{
    state:{chart},hasChart:()=>true,syncMetaToState:()=>calls.push('sync'),
    prepareChartPrint:async()=>{calls.push('layout');if(fail)throw new Error('layout failed')},
    beginLoading:()=>()=>calls.push('finished'),setStatus(){},showErrorDialog:(_title,message)=>calls.push(message),
    window:{print:()=>calls.push('print'),chordPilot:{isWebRuntime:web,exportChart:async(value,format)=>{assert.equal(value,chart);calls.push(format);return {ok:true}}}}
  });
  return {exportChart,calls};
}
test('desktop PDF uses the prepared visible chart layout before export',async()=>{
  const env=exporter();await env.exportChart('pdf');
  assert.deepEqual(env.calls,['sync','layout','pdf','finished']);
});
test('browser PDF opens the native print flow with the same prepared layout',async()=>{
  const env=exporter(true);await env.exportChart('pdf');
  assert.deepEqual(env.calls,['sync','layout','print','finished']);
});
test('PDF layout failure is reported and clears the loading state',async()=>{
  const env=exporter(false,true);await env.exportChart('pdf');
  assert.deepEqual(env.calls,['sync','layout','layout failed','finished']);
});
