import test from 'node:test';
import assert from 'node:assert/strict';
import {seats} from '../src/seats.js';
import {at,createState,advance,reserve,cancel,scan,USER,live,freeSlots} from '../src/engine.js';
import {planSeats,planReaderSeats,planRenewal,bookPlan,bookReaderShortSeat} from '../src/planner.js';
const day='2026-11-19', A=seats[0].id,B=seats[1].id,C=seats[2].id;
const t=h=>at(day,h*3600);
const req=(extra={})=>({start:'14:00',end:'17:00',...extra});
function fixture(windows,date=day){
 const s=createState(true);
 for(const seat of seats){let cursor=8*3600;let n=0;
  const add=(a,b)=>{if(b>a)s.reservations.push({id:`fixture-${seat.id}-${n++}`,userId:'other',seatId:seat.id,date,start:at(date,a),end:at(date,b),createdAt:s.now,status:'checked_in',checkedInAt:s.now});};
  for(const [a,b] of (windows[seat.id]||[])){add(cursor,a*3600);cursor=b*3600;}add(cursor,22.5*3600);
 }return s;
}
const windows=(r)=>r.segments.map(s=>[s.seatId,s.start,s.end]);
test('complete single seat takes priority and is deterministic',()=>{const s=fixture({[A]:[[14,17]],[B]:[[14,15]],[C]:[[15,17]]});const a=planSeats(s,req()),b=planSeats(s,req());assert.deepEqual(a,b);assert.equal(a.plans[0].kind,'single');assert.equal(a.plans[0].segments[0].seatId,A);assert.equal(a.plans[0].seatedSeconds,10800);});
test('stitch has no artificial five minute move deduction; both segments commit',()=>{const s=fixture({[A]:[[14,15]],[B]:[[15,17]]});const p=planSeats(s,req()).plans[0];assert.equal(p.kind,'stitched');assert.deepEqual(windows(p),[[A,t(14),t(15)],[B,t(15),t(17)]]);assert.equal(p.gapSeconds,0);const booked=bookPlan(s,p);const own=booked.reservations.filter(r=>r.userId===USER);assert.equal(own.length,2);assert.equal(own[0].planId,own[1].planId);assert.equal(s.reservations.filter(r=>r.userId===USER).length,0);});
test('five minute gap accepted exactly, counted as non-seated time, zero tolerance excludes it',()=>{const s=fixture({[A]:[[14,15]],[B]:[[15+5/60,17]]});const p=planSeats(s,req()).plans[0];assert.equal(p.reachesEnd,true);assert.equal(p.gapSeconds,300);assert.equal(p.seatedSeconds,10500);assert.equal(p.needsGapConfirmation,true);assert.equal(planSeats(s,req({maxGapMinutes:0})).plans[0].kind,'partial');assert.equal(planSeats(s,req({maxGapMinutes:0,allowPartial:false})).plans.length,0);const late=fixture({[A]:[[14,15]],[B]:[[15+301/3600,17]]});assert.equal(planSeats(late,req()).plans[0].kind,'partial');});
test('shorter first segment leaves a full hour for the second',()=>{const s=fixture({[A]:[[14,16.5]],[B]:[[15,17]]});assert.deepEqual(windows(planSeats(s,req()).plans[0]),[[A,t(14),t(16)],[B,t(16),t(17)]]);});
test('shorter than 60 minutes never becomes a bookable segment',()=>{const s=fixture({[A]:[[14,14.99]],[B]:[[15,17]]});assert.equal(planSeats(s,req()).plans.length,0);assert.equal(planSeats(fixture({[A]:[[14,15]]}),req({minSegmentMinutes:90})).plans.length,0);});
test('reader options offer a single seat of 45 to under 60 minutes only when the default search fails',()=>{
 const short=fixture({[A]:[[14,14.75]],[B]:[[14,14+44/60]],[C]:[[15,17]]});
 const result=planReaderSeats(short,req());
 assert.equal(result.plans.length,0);
 assert.equal(result.shortSeatPlans.length,1);
 assert.deepEqual(windows(result.shortSeatPlans[0]),[[A,t(14),t(14.75)]]);
 assert.equal(result.shortSeatPlans[0].switches,0);
 assert.equal(planReaderSeats(short,req({allowPartial:false})).shortSeatPlans,undefined);
 assert.equal(planReaderSeats(short,req({minSegmentMinutes:90})).shortSeatPlans,undefined);
 const longer=planReaderSeats(fixture({[A]:[[14,14.75]],[B]:[[14,15]]}),req());
 assert.equal(longer.plans[0].segments[0].seatId,B);
 assert.equal(longer.shortSeatPlans,undefined);
});
test('short confirmation rechecks fallback availability and keeps standard booking and renewal limits',()=>{
 const short=fixture({[A]:[[14,14.75]],[B]:[[14.75,17]]});
 const plan=planReaderSeats(short,req()).shortSeatPlans[0];
 assert.throws(()=>bookReaderShortSeat(fixture({[A]:[[14,14.75]],[B]:[[14,16]]}),req(),plan.id),/时段已变化/);
 const booked=bookReaderShortSeat(short,req(),plan.id);
 assert.equal(booked.minReservationMinutes,undefined);
 const own=booked.reservations.filter(r=>r.userId===USER);
 assert.equal(own.length,1);
 assert.equal(own[0].end-own[0].start,45*60);
 assert.throws(()=>reserve(booked,{seatId:B,date:day,start:t(15),end:t(15.75)}),/60/);
 assert.equal(planRenewal(booked,{reservationId:own[0].id,end:'15:30'}).plans.length,0);
 assert.equal(planRenewal(booked,{reservationId:own[0].id,end:'16:00'}).plans[0].seatedSeconds,75*60);
});
test('partial option explicitly reports missing tail and can be declined',()=>{const s=fixture({[A]:[[14,15.5]]});const p=planSeats(s,req()).plans[0];assert.equal(p.kind,'partial');assert.equal(p.unfilledSeconds,5400);assert.equal(p.needsRenewal,true);assert.equal(planSeats(s,req({allowPartial:false})).plans.length,0);});
test('no feasible seat returns a reason; invalid/past/closed ranges are rejected',()=>{assert.ok(planSeats(fixture({}),req()).reason);assert.throws(()=>planSeats(createState(),req({start:'12:00'})),/过去/);assert.throws(()=>planSeats(createState(),req({end:'23:00'})),/08:00/);assert.throws(()=>planSeats(createState(),req({maxSwitches:3})),/最多换/);assert.throws(()=>planSeats(createState(),req({minSegmentMinutes:45})),/60/);});
test('date automatically rolls over exactly at 22:30',()=>{let s=createState(true);assert.equal(planSeats(s,req()).request.date,day);s=advance(s,at(day,22.5*3600)-1);assert.equal(planSeats(s,{start:'22:29:59',end:'22:30'}).request.date,day);s=advance(s,s.now+1);assert.equal(planSeats(s,{start:'08:00',end:'10:00'}).request.date,'2026-11-20');});
test('two switches are supported, with each gap independently bounded',()=>{const s=fixture({[A]:[[14,15]],[B]:[[15+5/60,16+5/60]],[C]:[[16+10/60,18]]});const r=planSeats(s,req({end:'18:00',maxSwitches:2}));assert.equal(r.plans[0].switches,2);assert.equal(r.plans[0].gaps.length,2);assert.equal(r.plans[0].gapSeconds,600);assert.equal(r.plans[0].reachesEnd,true);assert.equal(planSeats(s,req({end:'18:00',maxSwitches:1})).plans[0].kind,'partial');});
test('tie-break prefers longer first seat and input state is not mutated',()=>{const s=fixture({[A]:[[14,15]],[B]:[[14,16]],[C]:[[15,17]]});const before=structuredClone(s);const p=planSeats(s,req()).plans[0];assert.equal(p.segments[0].seatId,B);assert.equal(p.segments[0].end,t(16));assert.deepEqual(s,before);});
test('stale conflict causes atomic rollback, including logs',()=>{const s=fixture({[A]:[[14,15]],[B]:[[15,17]]});const p=planSeats(s,req()).plans[0];const fresh={...s,reservations:[...s.reservations,{id:'new',seatId:B,date:day,start:t(15),end:t(16),status:'reserved',userId:'competitor'}]};const before=structuredClone(fresh);assert.throws(()=>bookPlan(fresh,p),/冲突/);assert.deepEqual(fresh,before);assert.equal(fresh.reservations.filter(r=>r.userId===USER).length,0);});
test('duplicate confirmation and personal overlapping bookings are rejected',()=>{let s=fixture({[A]:[[14,15]],[B]:[[15,17]],[C]:[[14,17]]});const p=planSeats(s,req()).plans[0];s=bookPlan(s,p);assert.throws(()=>bookPlan(s,p),/重叠/);assert.equal(planSeats(s,req()).plans.length,0);});
test('renewal sees newly released seats and reserves before original segment ends',()=>{let s=fixture({[A]:[[14,15]]});s=reserve(s,{seatId:A,date:day,start:t(14),end:t(15)});const id=s.reservations.at(-1).id;assert.equal(planRenewal(s,{reservationId:id,end:'17:00'}).plans.length,0);
 s={...s,reservations:s.reservations.map(r=>r.seatId===B?{...r,status:'cancelled',releasedAt:s.now}:r)};
 const p=planRenewal(s,{reservationId:id,end:'17:00'}).plans[0];assert.deepEqual(windows(p),[[B,t(15),t(17)]]);const booked=bookPlan(s,p);assert.equal(booked.reservations.filter(r=>r.userId===USER&&live(r)).length,2);
});
test('same-seat renewal needs no switch; existing plan moves count toward budget',()=>{let s=reserve(createState(true),{seatId:A,date:day,start:t(14),end:t(15)});const p=planRenewal(s,{reservationId:s.reservations.at(-1).id,end:'17:00',maxSwitches:0}).plans[0];assert.equal(p.switches,0);assert.equal(p.segments[0].seatId,A);
 const f=fixture({[A]:[[14,15]],[B]:[[15,16]],[C]:[[16,18]]});const booked=bookPlan(f,planSeats(f,req({end:'16:00'})).plans[0]);const id=booked.reservations.filter(r=>r.userId===USER)[0].id;
 assert.equal(planRenewal(booked,{reservationId:id,end:'18:00',maxSwitches:1}).plans.length,0);assert.equal(planRenewal(booked,{reservationId:id,end:'18:00',maxSwitches:2}).plans[0].totalSwitches,2);
});
test('late renewal respects the initial waiting gap and refuses cancelled anchors',()=>{let s=fixture({[A]:[[14,15]],[B]:[[15+5/60,17]]});s=reserve(s,{seatId:A,date:day,start:t(14),end:t(15)});const id=s.reservations.at(-1).id;s=scan(s,'in');s=advance(s,t(15)+120);const p=planRenewal(s,{reservationId:id,end:'17:00'}).plans[0];assert.equal(p.gapSeconds,300);s=advance(s,t(15)+301);assert.equal(planRenewal(s,{reservationId:id,end:'17:00'}).plans.length,0);
 let other=reserve(createState(true),{seatId:A,date:day,start:t(14),end:t(15)});const rid=other.reservations.at(-1).id;other=cancel(other,rid);assert.throws(()=>planRenewal(other,{reservationId:rid,end:'17:00'}),/不能/);
});
test('manual booking stays linked after multiple renewal rounds',()=>{let s=reserve(createState(true),{seatId:A,date:day,start:t(14),end:t(15)});const id=s.reservations.at(-1).id;
 s=bookPlan(s,planRenewal(s,{reservationId:id,end:'16:00',maxSwitches:0}).plans[0]);
 const p=planRenewal(s,{reservationId:id,end:'17:00',maxSwitches:0}).plans[0];assert.equal(p.segments[0].start,t(16));s=bookPlan(s,p);assert.equal(new Set(s.reservations.filter(r=>r.userId===USER).map(r=>r.planId)).size,1);
});
test('same-seat interrupted windows use gap allowance without consuming a move',()=>{const s=fixture({[A]:[[14,15],[15+5/60,17]]});const p=planSeats(s,req({maxSwitches:0})).plans[0];assert.equal(p.reachesEnd,true);assert.equal(p.switches,0);assert.equal(p.gapSeconds,300);});

// An independent exhaustive slot-grid oracle checks coverage and ranking over
// many small schedules. Production search works in exact seconds, not this grid.
test('ranked optimum agrees with exhaustive enumeration on 80 seeded schedules',()=>{
 let seed=41;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 const rank=p=>[Number(p.end===16),p.coverage,-p.switches,p.first];
 const compare=(a,b)=>{const x=rank(a),y=rank(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return y[i]-x[i];return 0;};
 for(let trial=0;trial<80;trial++){
  const open=Array.from({length:3},()=>Array.from({length:16},()=>random()>.22));
  const w={};[A,B,C].forEach((id,i)=>{w[id]=[];let j=0;while(j<16){if(!open[i][j]){j++;continue;}const a=j;while(j<16&&open[i][j])j++;w[id].push([14+a/4,14+j/4]);}});
  const gap=trial%2,limit=trial%3;let best=null;
  function visit(time,prev,coverage,switches,first){
   if(coverage){const p={end:time,coverage,switches,first};if(!best||compare(p,best)<0)best=p;}
   for(let seat=0;seat<3;seat++){const count=switches+(prev!==null&&prev!==seat?1:0);if(count>limit)continue;
    for(let start=time;start<=Math.min(16,time+(prev===null?0:gap));start++)for(let end=start+4;end<=16;end++){
     if(!open[seat].slice(start,end).every(Boolean))break;
     visit(end,seat,coverage+end-start,count,first||end-start);
    }
   }
  }
  visit(0,null,0,0,0);
  const plans=planSeats(fixture(w),req({end:'18:00',maxSwitches:limit,maxGapMinutes:gap*15,limit:1})).plans;
  if(!best){assert.equal(plans.length,0,`trial ${trial}`);continue;}
  assert.ok(plans[0],`trial ${trial}`);const p=plans[0];
  assert.deepEqual([Number(p.reachesEnd),p.seatedSeconds/900,-p.switches,p.firstSegmentSeconds/900],rank(best),`trial ${trial}: ${JSON.stringify(w)}`);
 }
});
