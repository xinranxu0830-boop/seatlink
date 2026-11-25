import test from 'node:test';
import assert from 'node:assert/strict';
import { at } from '../src/engine.js';
import { runWorkload } from '../experiments/reservation-replay.mjs';
import { buildAdditionalRequests, runIncrementalReplay } from '../experiments/incremental-replay.mjs';

const date='2026-10-29';
const t=hour=>at(date,hour*3600);
const booking=(id,seatId,start,end,release=end)=>({id,seatId,readerId:`reader-${id}`,submit:t(8),start:t(start),end:t(end),release:t(release)});
const request={id:1,readerId:'additional',submit:t(13),start:t(14),end:t(17),release:t(17),added:true};

test('incremental allocation preserves existing seat bookings and cannot consume them',()=>{
  const data={date,seats:['A'],backgroundReservations:[booking(1,'A',14,17)]};
  const before=structuredClone(data);
  const result=runWorkload(data,{id:'added-1',addedCount:1,requests:[request]});
  assert.deepEqual(data,before);
  for(const group of result.groups){assert.equal(group.served,0);assert.equal(group.addedSeconds,0);assert.equal(group.occupiedSeconds,10800);}
});

test('early release stays hidden until its event and can then enable renewal',()=>{
  const data={date,seats:['A','B'],backgroundReservations:[booking(1,'A',15,22.5),booking(2,'B',8,17,15)]};
  const result=runWorkload(data,{id:'added-1',addedCount:1,requests:[request]});
  assert.deepEqual(result.groups.map(group=>group.addedSeconds),[3600,3600,10800,10800]);
  assert.deepEqual(result.groups.map(group=>group.complete),[0,0,1,1]);
  for(const group of result.example.groups){
    assert.equal(group.decisions[0].slots.length,1);
    for(const decision of group.decisions.filter(d=>d.action==='renewal'))assert.ok(decision.time>=t(15));
  }
});

test('additional demand is deterministic, nested across levels and asks for full target durations',()=>{
  const data={requests:[booking(1,'A',14,17,15),booking(2,'B',10,13,12)]};
  const small=buildAdditionalRequests(data,80), large=buildAdditionalRequests(data,200);
  assert.deepEqual(small,large.slice(0,80));
  assert.deepEqual(large,buildAdditionalRequests(data,200));
  assert.equal(new Set(large.map(r=>r.readerId)).size,200);
  assert.ok(large.every(r=>r.release===r.end && !('seatId' in r)));
});

test('incremental summary separates fixed capacity from newly allocated minutes',()=>{
  const data={date,seats:['A','B'],requests:[booking(1,'A',14,17)],endedAfterBooked:0};
  const result=runIncrementalReplay(data,[1,2]);
  assert.equal(result.backgroundCount,1);
  assert.equal(result.historical.occupiedSeconds,10800);
  for(const workload of result.workloads)for(const group of workload.groups){
    assert.equal(group.occupiedSeconds,result.historical.occupiedSeconds+group.addedSeconds);
    assert.deepEqual(group.bins,group.addedBins.map((seconds,i)=>seconds+result.historical.bins[i]));
    assert.ok(group.utilization<=1);
  }
});
