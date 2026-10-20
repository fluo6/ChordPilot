const test=require('node:test');
const assert=require('node:assert/strict');
const {loadScript,plain}=require('./helpers/load-script');
const api=()=>loadScript('src/renderer/detail-sections.js',['normalizeDetailSectionLayout','moveDetailSection']);
const defaults=['chord','keyboard','bass','guitar','drums','spectrum','bar','lyrics','notes'];

test('sidebar layout restores valid sections and safely appends missing ones for old sessions',()=>{
  const {normalizeDetailSectionLayout:normalize}=api();
  assert.deepEqual(plain(normalize()),{order:defaults,collapsed:[]});
  assert.deepEqual(plain(normalize({order:['bass','bass','unknown','chord'],collapsed:['spectrum','unknown','spectrum']})),{
    order:['bass','chord','keyboard','guitar','drums','spectrum','bar','lyrics','notes'],collapsed:['spectrum']
  });
  assert.deepEqual(plain(normalize({order:'bad',collapsed:{}})),{order:defaults,collapsed:[]});
});

test('drag reorder supports before and after drops without mutating saved order or collapsed state',()=>{
  const {moveDetailSection:move}=api();
  const layout={order:defaults,collapsed:['spectrum']};
  assert.deepEqual(plain(move(layout,'bass','chord',false)),{
    order:['bass','chord','keyboard','guitar','drums','spectrum','bar','lyrics','notes'],collapsed:['spectrum']
  });
  assert.deepEqual(plain(move(layout,'chord','spectrum',true)).order,['keyboard','bass','guitar','drums','spectrum','chord','bar','lyrics','notes']);
  assert.deepEqual(plain(move(layout,'bass','bass',true)),layout);
  assert.deepEqual(plain(move(layout,'unknown','chord',false)),layout);
  assert.deepEqual(layout.order,defaults);
});
