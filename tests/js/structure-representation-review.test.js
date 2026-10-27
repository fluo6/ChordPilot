const test = require('node:test');
const assert = require('node:assert/strict');
const review = require('../../scripts/testing/structure-representation-review.js');

test('pair filters preserve all evidence without converting matches into labels', () => {
  const pairs = [{i:0,j:1,baseline_same_group:true,different_accepted_roles:true},
    {i:0,j:2,baseline_same_group:false,different_accepted_roles:false}];
  const data = {pairs,unanimous:{raw:[[0,2]],centered:[[0,1]]}};
  const before = JSON.stringify(data);
  assert.deepEqual(review.filterPairs(data,'centered'),[pairs[0]]);
  assert.deepEqual(review.filterPairs(data,'raw'),[pairs[1]]);
  assert.deepEqual(review.filterPairs(data,'role-question'),[pairs[0]]);
  assert.deepEqual(review.filterPairs(data,'all'),pairs);
  assert.deepEqual(review.filterPairs({...data,unanimous:{raw:[],centered:[]}},'centered'),[]);
  assert.equal(JSON.stringify(data),before);
});

test('naming convention persists separately for each song and handles inaccessible storage', () => {
  const values = new Map();
  const storage = {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  assert.equal(review.loadNaming(storage,'one'),'roles');
  review.saveNaming(storage,'one','groups');
  review.saveNaming(storage,'two','mixed');
  assert.equal(review.loadNaming(storage,'one'),'groups');
  assert.equal(review.loadNaming(storage,'two'),'mixed');
  review.saveNaming(storage,'one','invalid');
  assert.equal(review.loadNaming(storage,'one'),'groups');
  const unavailable = {getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.equal(review.loadNaming(unavailable,'one'),'roles');
  assert.doesNotThrow(()=>review.saveNaming(unavailable,'one','groups'));
});

test('clip boundaries reject invalid intervals and preserve stored endpoints', () => {
  assert.deepEqual(review.clip({start:11.72,end:23.28}),{start:11.72,end:23.28});
  for (const row of [{start:-1,end:2},{start:2,end:1},{start:0,end:NaN}]) {
    assert.throws(()=>review.clip(row));
  }
});
