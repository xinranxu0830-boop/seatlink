import {OPEN,CLOSE,RULES,at,dayOf,timeValue,bookingDatesFor,seatsFor,readerFor,minBookingMinutes,freeSlots,overlap,live,reserveBatch} from './engine.js';

export const PLANNER_DEFAULTS = Object.freeze({minSegmentMinutes:60,maxSwitches:1,maxGapMinutes:5,allowPartial:true,limit:3});
export const SHORT_SEAT_MINUTES = 45;
// The exact search is bounded to two switches for this small-region prototype.
export const MAX_SWITCHES = 2;
const seconds = (value,date) => typeof value==='string' ? at(date,timeValue(value)) : value;
const signature = segments => segments.map(s=>`${s.seatId}:${s.start}:${s.end}`).join('|');
const moves = (segments,previousSeatId) => segments.reduce((n,s,i)=>n+((i?segments[i-1].seatId:previousSeatId)&&s.seatId!==(i?segments[i-1].seatId:previousSeatId)?1:0),0);

function normalize(state,input) {
 const request={...PLANNER_DEFAULTS,...input};
 const dates=bookingDatesFor(state);
 request.date=input.date||dates[0];
 request.start=seconds(input.start,request.date);
 request.end=seconds(input.end,request.date);
 if(!dates.includes(request.date))throw new Error('该日期尚未开放预约；22:30 起默认次日。');
 if(!Number.isFinite(request.start)||!Number.isFinite(request.end)||request.end<=request.start)throw new Error('请填写有效的学习起止时间。');
 if(request.start<at(request.date,OPEN)||request.end>at(request.date,CLOSE))throw new Error('学习时段必须在 08:00–22:30 内。');
 if(request.start<state.now)throw new Error('开始时间已经过去，请调整后重新找座。');
 if(!Number.isInteger(request.maxSwitches)||request.maxSwitches<0||request.maxSwitches>MAX_SWITCHES)throw new Error(`第一版支持最多换 ${MAX_SWITCHES} 次，次数须为整数。`);
 if(request.maxSegments!==undefined&&(!Number.isInteger(request.maxSegments)||request.maxSegments<1))throw new Error('每次规划的段数上限须为正整数。');
 if(!Number.isFinite(request.minSegmentMinutes)||request.minSegmentMinutes<60||request.minSegmentMinutes>960)throw new Error('每段最短时长须在 60–960 分钟之间。');
 const first=request.minFirstSegmentMinutes??request.minSegmentMinutes;
 if(!Number.isFinite(first)||first<minBookingMinutes(state)||first>request.minSegmentMinutes)throw new Error('首段最短时长须在预约下限和后续段下限之间。');
 if(!Number.isFinite(request.maxGapMinutes)||request.maxGapMinutes<0||request.maxGapMinutes>870)throw new Error('可接受空窗须在 0–870 分钟之间。');
 if(typeof request.allowPartial!=='boolean')throw new Error('是否接受短时方案须为布尔值。');
 if(!Number.isInteger(request.limit)||request.limit<1||request.limit>20)throw new Error('方案数量须为 1–20。');
 request.minDuration=request.minSegmentMinutes*60;
 request.minFirstDuration=first*60;
 request.maxGap=request.maxGapMinutes*60;
 return request;
}

// For a fixed chain of windows, schedule cuts backwards as late as possible,
// leaving the required minimum for every later segment. This avoids the greedy
// error A 14:00–16:30 + B 15:00–17:00 -> an invalid 30-minute B segment.
function schedule(windows,request,context) {
 const ends=Array(windows.length);
 for(let i=windows.length-1;i>=0;i--) {
  ends[i]=Math.min(windows[i].end,i===windows.length-1?request.end:ends[i+1]-request.minDuration);
  if(ends[i]-windows[i].start<(i===0?request.minFirstDuration:request.minDuration))return null;
 }
 const segments=[];const gaps=[];
 let previousEnd=context?.anchorEnd??request.start;
 for(let i=0;i<windows.length;i++) {
  const w=windows[i];
  const start=i===0?(context?Math.max(request.start,w.start):request.start):Math.max(previousEnd,w.start);
  if(start<w.start||ends[i]-start<(i===0?request.minFirstDuration:request.minDuration))return null;
  if(start<previousEnd||start-previousEnd>request.maxGap)return null;
  if(start>previousEnd)gaps.push({start:previousEnd,end:start,seconds:start-previousEnd});
  segments.push({seatId:w.seatId,date:request.date,start,end:ends[i]});previousEnd=ends[i];
 }
 const switches=moves(segments,context?.previousSeatId);
 if(switches>request.maxSwitches)return null;
 const gapSeconds=gaps.reduce((n,g)=>n+g.seconds,0);
 const seatedSeconds=segments.reduce((n,s)=>n+s.end-s.start,0);
 const reachesEnd=previousEnd===request.end;
 return {id:signature(segments),kind:reachesEnd?(switches===0&&gaps.length===0?'single':'stitched'):'partial',
  date:request.date,segments,gaps,switches,seatedSeconds,gapSeconds,
  requestedSeconds:request.end-(context?.anchorEnd??request.start),
  unfilledSeconds:request.end-previousEnd,coveredUntil:previousEnd,reachesEnd,
  firstSegmentSeconds:segments[0].end-segments[0].start,
  needsRenewal:!reachesEnd,needsGapConfirmation:gapSeconds>0,
  ...(context?{renewalOf:context.reservationId,planId:context.planId,priorSwitches:context.priorSwitches,totalSwitches:context.priorSwitches+switches}:{}),
  constraints:{minSegmentMinutes:request.minSegmentMinutes,maxSwitches:request.maxSwitches,maxGapMinutes:request.maxGapMinutes}};
}
function compare(a,b) {
 return Number(b.reachesEnd)-Number(a.reachesEnd)||b.seatedSeconds-a.seatedSeconds||a.switches-b.switches||b.firstSegmentSeconds-a.firstSegmentSeconds||a.gapSeconds-b.gapSeconds||a.id.localeCompare(b.id);
}
function search(state,request,context=null) {
 const own=state.reservations.filter(r=>r.userId===readerFor(state)&&live(r));
 if(own.some(r=>overlap(request.start,request.end,r.start,r.end)))return {request,plans:[],reason:'学习时段与你已有预约重叠。可从已有方案之后查找续座。'};
 const windows=seatsFor(state).flatMap(s=>freeSlots(state,s.id,request.date).map(([start,end])=>({seatId:s.id,start:Math.max(start,request.start),end:Math.min(end,request.end)})))
  .filter(w=>w.end-w.start>=request.minFirstDuration).sort((a,b)=>a.end-b.end||a.start-b.start||a.seatId.localeCompare(b.seatId));
 const best=[];const seen=new Set();let evaluated=0;
 const retain=plan=>{if(!plan||(!request.allowPartial&&!plan.reachesEnd)||seen.has(plan.id))return;seen.add(plan.id);best.push(plan);best.sort(compare);if(best.length>request.limit)best.pop();};
 function visit(chain) {
  evaluated++;
  const plan=schedule(chain,request,context);
  if(!plan)return;retain(plan);
  if(plan.reachesEnd||chain.length>=(request.maxSegments??Infinity))return;
  const last=chain.at(-1);
  // A later window ending no later than the current one cannot improve coverage
  // or reduce switches. Same-seat revisits after another seat are permitted.
  for(const next of windows)if(next.end-next.start>=request.minDuration&&next.end>last.end&&(next.seatId===last.seatId||plan.switches<request.maxSwitches)&&next.start<=last.end+request.maxGap)visit([...chain,next]);
 }
 for(const w of windows)if(context?w.start-context.anchorEnd<=request.maxGap:w.start===request.start)visit([w]);
 const plans=best.some(p=>p.reachesEnd)?best.filter(p=>p.reachesEnd):best;
 return {request,plans,reason:plans.length?'':request.allowPartial?'开始时刻没有符合最低时长和空窗要求的座位。':'未找到满足结束时间、换座次数和空窗要求的完整方案。',evaluatedChains:evaluated};
}

/** Pure, deterministic; start/end accept HH:mm[:ss] or epoch seconds. */
export function planSeats(state,input) {
 return search(state,normalize(state,input));
}

export function planReaderSeats(state,input) {
 const result=planSeats(state,input);
 const {request}=result;
 if(result.plans.length||!request.allowPartial||
   request.minSegmentMinutes!==PLANNER_DEFAULTS.minSegmentMinutes||
   minBookingMinutes(state)!==PLANNER_DEFAULTS.minSegmentMinutes)return result;
 const fallback=planSeats({...state,minReservationMinutes:SHORT_SEAT_MINUTES},{
  ...request,minFirstSegmentMinutes:SHORT_SEAT_MINUTES,maxSegments:1,maxSwitches:0,maxGapMinutes:0,
 });
 return {...result,shortSeatPlans:fallback.plans};
}

export function bookReaderShortSeat(state,input,planId) {
 const plan=planReaderSeats(state,input).shortSeatPlans?.find(option=>option.id===planId);
 if(!plan)throw new Error('短时单座的可用时段已变化，请重新找座。');
 // Scope the lower minimum to this confirmation.
 const {minReservationMinutes:_shortMinimum,...booked}=bookPlan({...state,minReservationMinutes:SHORT_SEAT_MINUTES},plan);
 return state.minReservationMinutes===undefined?booked:{...booked,minReservationMinutes:state.minReservationMinutes};
}

/** Recompute an extension after the latest retained segment of one booking plan.
 * Already-booked segments are preserved and count toward the total switch limit.
 * No future release events are guessed. Calling again sees the latest state.
 */
export function planRenewal(state,input) {
 const userId=readerFor(state);
 const selected=state.reservations.find(r=>r.id===input.reservationId&&r.userId===userId);
 if(!selected)throw new Error('找不到要续座的预约。');
 const retained=r=>live(r)||r.status==='completed';
 if(!retained(selected))throw new Error('已取消、签退或超时的预约不能直接续接，请重新找座。');
 const chain=state.reservations.filter(r=>r.userId===userId&&r.date===selected.date&&retained(r)&&(selected.planId?r.planId===selected.planId:r.id===selected.id)).sort((a,b)=>a.start-b.start);
 const anchor=chain.at(-1),anchorEnd=anchor.end;
 const start=Math.max(state.now,anchorEnd);
 const end=seconds(input.end,anchor.date);
 const totalLimit=input.maxSwitches??PLANNER_DEFAULTS.maxSwitches;
 const priorSwitches=moves(chain);
 if(!Number.isInteger(totalLimit)||totalLimit<0||totalLimit>MAX_SWITCHES)throw new Error(`最多换座次数须为 0–${MAX_SWITCHES}。`);
 if(start>=end)return {plans:[],reason:'已有预约已覆盖目标结束时间，或目标结束时间已经过去。'};
 if(totalLimit<priorSwitches)return {plans:[],reason:'已有方案的换座次数已超过当前设置。'};
 const request=normalize(state,{...input,date:anchor.date,start,end,maxSwitches:totalLimit-priorSwitches,minFirstSegmentMinutes:input.minSegmentMinutes??PLANNER_DEFAULTS.minSegmentMinutes});
 if(start-anchorEnd>request.maxGap)return {request,plans:[],reason:'距离上一段结束已超过可接受空窗，请重新发起找座。'};
 return search(state,request,{anchorEnd,previousSeatId:anchor.seatId,reservationId:anchor.id,planId:anchor.planId,priorSwitches});
}

/** Commit only after user confirmation, against the current state. */
export function bookPlan(state,plan) {
 if(!plan?.segments?.length)throw new Error('请先选择有效方案。');
 let staged=state;
 let planId=plan.planId;
 if(plan.renewalOf){
  const anchor=state.reservations.find(r=>r.id===plan.renewalOf&&r.userId===readerFor(state)&&(live(r)||r.status==='completed'));
  if(!anchor)throw new Error('原预约已发生变化，请重新计算续座。');
  planId=anchor.planId||`renewal-${anchor.id}`;
  // Link a previously manual booking only after the entire append succeeds.
  if(!anchor.planId)staged={...state,reservations:state.reservations.map(r=>r.id===anchor.id?{...r,planId}:r)};
 }
 return reserveBatch(staged,plan.segments,{planId,renewal:Boolean(plan.renewalOf)});
}
