const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const renderer=process.env.COMPACT_ICON_SOURCE||path.resolve(__dirname,'../../src/renderer');
const read=name=>fs.readFileSync(path.join(renderer,name),'utf8');
function environment(){
  const node=()=>{const n={children:[],attrs:{},dataset:{},className:'',setAttribute(key,value){this.attrs[key]=value;},
    prepend(child){this.children.unshift(child);},
    querySelector(selector){return this.children.find(child=>selector==='.prototype-icon'?child.attrs.class==='prototype-icon':child.track)||null;}};
    n.classList={add(){n.track=true;}};return n;};
  const context=vm.createContext({document:{createElementNS:node,createElement:node}});
  vm.runInContext(read('prototype-workspace.js').split('(function initializePrototypeWorkspace(){')[0],context);
  return {context,node};
}
test('shared icons cover the reference navigation, actions and five instrument lanes',()=>{
  const {context}=environment();
  for(const name of ['home','analysis','chart','study','log','help','song','folder','wave','save','settings','mic','drum','bass','info']){
    const svg=context.prototypeIcon(name);assert.ok(svg.innerHTML,`${name} has geometry`);
    assert.equal(svg.attrs.viewBox,'0 0 24 24');assert.equal(svg.attrs['aria-hidden'],'true');assert.equal(svg.attrs.focusable,'false');
  }
  assert.match(vm.runInContext('prototypeIconArtwork.study',context),/M9 3h6/,'Lab uses the flask');
  assert.notEqual(vm.runInContext('prototypeIconArtwork.chart',context),vm.runInContext('prototypeIconArtwork.song',context));
});
test('bass is a headstock with four inline tuning pegs',()=>{
  const {context}=environment(),markup=context.prototypeIcon('bass').innerHTML;
  assert.equal((markup.match(/<rect\b/g)||[]).length,4);
  assert.match(markup,/M10 22v-7/,'short neck joins the headstock');
});
test('track decoration reuses SVG helper, preserves controls, and does not duplicate icons',()=>{
  const {context,node}=environment();
  for(const [name,expected] of [['Full Mix','analysis'],['vocals','mic'],['drums','drum'],['bass','bass'],['other','song'],['unknown','song']]){
    const label=node(),controls=node();label.children.push(controls);
    const lane={dataset:{trackName:name},querySelector:()=>label};
    context.decoratePrototypeTrack(lane);context.decoratePrototypeTrack(lane);
    assert.equal(label.children.length,2);assert.equal(label.children[0].dataset.icon,expected);assert.equal(label.children[1],controls);
  }
});
test('real waveform initialization decorates each lane and icon CSS excludes piano keys',()=>{
  assert.match(read('arrangement-waveforms.js'),/decoratePrototypeTrack\(lane\)/);
  assert.match(read('prototype-workspace.css'),/\.waveform-lane \.prototype-track-icon/);
  assert.match(read('prototype-workspace.css'),/button:not\(\.piano-key\)/);
});
