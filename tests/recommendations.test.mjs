import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNearby,evaluateSeatProfile,rankSeats} from '../ui/recommendations.js';
const now=Date.parse('2026-11-19T12:43:00+08:00')/1000;
const ctx={now,date:'2026-11-19',startAt:now+120,start:12.75*3600,end:15.75*3600};
const snapshot={observedAt:now-180,date:ctx.date,total:6,occupied:1,unknown:0,source:'demo'};
const make=(id,values,status='free',extra={})=>({id,status,preferred:[ctx.start,ctx.end],assessment:{values},profile:{floor:2},...extra});
test('preference changes reorder genuinely available seats',()=>{
  const seats=[make('A',{power:false,quiet:true}),make('B',{power:true,quiet:false})];
  assert.equal(rankSeats(seats,['power']).results[0].id,'B');
  assert.equal(rankSeats(seats,['quiet']).results[0].id,'A');
});
test('full duration is preferred to partial coverage even when the partial seat matches more preferences',()=>{
  const seats=[make('full',{power:false}),make('partial',{power:true},'partial')];
  assert.deepEqual(rankSeats(seats,['power']).results.map(s=>s.id),['full']);
  assert.deepEqual(rankSeats(seats,['power'],{allowPartial:true}).results.map(s=>s.id),['full','partial']);
});
test('required preferences exclude unknown and explicitly unsatisfied records',()=>{
  const seats=[make('yes',{power:true}),make('no',{power:false}),make('unknown',{power:null})];
  assert.deepEqual(rankSeats(seats,['power'],{required:true}).results.map(s=>s.id),['yes']);
  assert.equal(rankSeats([make('unknown',{power:null})],['power']).results[0].matches.length,0);
});
test('no available seat or no required match gives an empty result instead of relaxing requirements',()=>{
  assert.equal(rankSeats([make('busy',{power:true},'busy')],['power']).results.length,0);
  assert.equal(rankSeats([make('no',{power:false})],['power'],{required:true}).results.length,0);
  assert.equal(rankSeats([make('floor2',{power:true})],['power'],{floor:'3'}).results.length,0);
});
test('booking eligibility is a hard gate, not a preference score',()=>{
  const result=rankSeats([make('conflict',{power:true},'free',{eligibilityError:'时段重叠'}),make('eligible',{power:false})],['power']);
  assert.deepEqual(result.results.map(s=>s.id),['eligible']);
});
test('valid nearby occupancy can satisfy a sparse preference',()=>{
  assert.equal(inspectNearby(snapshot,ctx).known,true);
  assert.equal(evaluateSeatProfile({nearby:snapshot},ctx).values.sparse,true);
});
test('future, stale, wrong-date and incomplete occupancy are unknown, not empty',()=>{
  for(const [sample,context] of [[snapshot,{...ctx,startAt:now+7200}],[{...snapshot,observedAt:now-601},ctx],[{...snapshot,date:'2026-11-18'},ctx],[{...snapshot,unknown:1},ctx],[{...snapshot,unknown:undefined},ctx],[snapshot,{...ctx,startAt:NaN}],[{...snapshot,observedAt:now+1},ctx]]){
    assert.equal(inspectNearby(sample,context).known,false);
    assert.equal(evaluateSeatProfile({nearby:sample},context).values.sparse,null);
  }
});
test('natural light and direct sun are independent, and sun risk depends on the chosen time',()=>{
  const profile={daylight:true,sunReferenceDate:ctx.date,directSunWindows:[[14*3600,16*3600]]};
  assert.equal(evaluateSeatProfile(profile,{...ctx,start:13*3600,end:14*3600}).values.shade,true);
  const afternoon=evaluateSeatProfile(profile,{...ctx,start:14*3600,end:17*3600});
  assert.equal(afternoon.values.daylight,true);assert.equal(afternoon.values.shade,false);
  assert.equal(evaluateSeatProfile(profile,{...ctx,date:'2026-11-20'}).values.shade,null);
});
