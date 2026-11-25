import { at, OPEN, CLOSE } from '../src/engine.js';
import { PLANNER_DEFAULTS } from '../src/planner.js';
import { buildReplayWorkloads, runWorkload } from './reservation-replay.mjs';

export const ADDED_COUNTS = [80, 100, 150, 200];
export const REQUEST_SEED = 20261029;

export function buildAdditionalRequests(data, count, seed = REQUEST_SEED) {
  if (!Number.isInteger(count) || count < 0 || !Number.isInteger(seed)) throw new Error('新增条数和种子须为整数，条数不能为负。');
  const donors = data.requests.filter(request => request.release > request.start)
    .sort((a,b) => a.submit-b.submit || a.id-b.id);
  if (!donors.length) throw new Error('缺少可供抽样的预约时段。');
  let value = seed >>> 0;
  const random = () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 0x100000000);
  // Shuffle once so each higher level extends the same request sequence.
  for (let i=donors.length-1; i>0; i--) {
    const j=Math.floor(random()*(i+1));
    [donors[i],donors[j]]=[donors[j],donors[i]];
  }
  return Array.from({length:count}, (_,index) => {
    const donor=donors[index % donors.length];
    return {
      id:index+1,readerId:`additional-${index+1}`,added:true,
      submit:donor.submit,start:donor.start,end:donor.end,
      // New users request their full stated interval. Do not infer their
      // departure from an unrelated historical user's early release.
      release:donor.end,
    };
  });
}

export function runIncrementalReplay(data, counts = ADDED_COUNTS) {
  const {active,open,close,observed}=buildReplayWorkloads(data);
  if (!counts.length || new Set(counts).size!==counts.length || counts.some(n=>!Number.isInteger(n)||n<1)) {
    throw new Error('新增需求档位须为不重复的正整数。');
  }
  const capacitySeconds=data.seats.length*(close-open);
  const bins=[];
  const binSeconds=1800;
  for(let time=open;time<close;time+=binSeconds) {
    bins.push(active.reduce((total,r)=>total+Math.max(0,Math.min(time+binSeconds,r.release)-Math.max(time,r.start)),0));
  }
  const occupiedSeconds=bins.reduce((total,value)=>total+value,0);
  const requests=buildAdditionalRequests(data,Math.max(...counts));
  const fixed={...data,backgroundReservations:data.requests};
  return {
    schemaVersion:2,mode:'fixed-bookings',date:data.date,seatCount:data.seats.length,
    backgroundCount:data.requests.length,backgroundEffectiveCount:active.length,
    sourceSha256:data.sourceSha256,seed:REQUEST_SEED,open,close,binSeconds,
    rules:{maxGapMinutes:PLANNER_DEFAULTS.maxGapMinutes,minSegmentMinutes:PLANNER_DEFAULTS.minSegmentMinutes,maxSwitches:PLANNER_DEFAULTS.maxSwitches},
    timings:{noEffectiveTime:observed.requests.length-active.length,
      releasedDuringSlot:active.filter(r=>r.release<r.end).length,endedAfterBooked:data.endedAfterBooked,
      priorToDemoWindow:data.requests.filter(r=>r.submit<at(data.date)-(86400-CLOSE)).length},
    historical:{capacitySeconds,occupiedSeconds,utilization:occupiedSeconds/capacitySeconds,bins},
    workloads:counts.map(count=>runWorkload(fixed,{id:`added-${count}`,addedCount:count,requests:requests.slice(0,count)})),
  };
}
