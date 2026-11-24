import React,{useEffect,useState} from 'react';
import {bookingDays,clock,dayOf,secOf,USER,live} from './engine.js';
import {planSeats,planReaderSeats,planRenewal,bookPlan,bookReaderShortSeat,SHORT_SEAT_MINUTES} from './planner.js';
import {DemoSelector,DemoStory} from './DemoControls.jsx';
import {DEMO_SEATS,demoBookings,enterScenarioLibrary,advanceAndRelease} from './scenarios.js';
const minutes=seconds=>`${Number((seconds/60).toFixed(1))} 分钟`;
const format=t=>clock(secOf(t),secOf(t)%60!==0);
const planNames={single:'一张座位即可',stitched:'分段拼接方案',partial:'先坐一段，后续待续'};
export default function PlannerPanel({state,onBook,initialReservationId=null,initialSearch=null,onShowReservations,demo=false,onSelectDemo,renderMap}){
 const date=(!demo&&initialSearch?.date)||bookingDays(state.now)[0];
 const defaultStart=()=>!demo&&initialSearch?.start?initialSearch.start:demo?'14:00:00':date===dayOf(state.now)?clock(Math.max(14*3600,secOf(state.now)),true):'08:00:00';
 const [start,setStart]=useState(defaultStart),[end,setEnd]=useState((!demo&&initialSearch?.end)||(demo||date===dayOf(state.now)?'17:00:00':'10:00:00'));
 const [maxSwitches,setMaxSwitches]=useState(1),[minSegment,setMinSegment]=useState(60),[maxGap,setMaxGap]=useState(5),[allowPartial,setAllowPartial]=useState(true);
 const [reservationId,setReservationId]=useState(initialReservationId||''),[result,setResult]=useState(null),[resultState,setResultState]=useState(null),[error,setError]=useState(''),[confirmedGaps,setConfirmedGaps]=useState({});
 const [showShortSeats,setShowShortSeats]=useState(false);
 const anchors=state.reservations.filter(r=>r.userId===USER&&r.date===date&&(live(r)||r.status==='completed'));
 const grouped=anchors.filter((r,i,a)=>!r.planId||!a.slice(0,i).some(x=>x.planId===r.planId));
 const hasShortSeats=Boolean(result?.shortSeatPlans?.length);
 const viewingShortSeats=hasShortSeats&&showShortSeats;
 const visiblePlans=viewingShortSeats?result.shortSeatPlans:result?.plans||[];
 function calculate(snapshot=state,overrides={}){
  setError('');setConfirmedGaps({});setShowShortSeats(false);
  try{
   const input={date,start,end,minSegmentMinutes:minSegment,maxSwitches:Number(maxSwitches),maxGapMinutes:maxGap,allowPartial,...overrides};
   const id=demo&&snapshot.scenario==='renewal'?demoBookings(snapshot)[0]?.id:reservationId;
   const findSeats=demo?planSeats:planReaderSeats;
   setResult(id?planRenewal(snapshot,{...input,reservationId:id}):findSeats(snapshot,input));setResultState(snapshot);
  }catch(e){setResult(null);setError(e.message);}
 }
 useEffect(()=>{
  if(demo){
   if(['initial','released'].includes(state.demoStage))calculate();
   return;
  }
  setStart(defaultStart());setEnd(initialSearch?.end||(date===dayOf(state.now)?'17:00:00':'10:00:00'));setReservationId(initialReservationId||'');setResult(null);setError('');setConfirmedGaps({});
 },[date,demo]);
 useEffect(()=>{if(initialReservationId)setReservationId(initialReservationId);},[initialReservationId]);
 const change=setter=>e=>{setter(e.target.type==='checkbox'?e.target.checked:e.target.type==='number'?Number(e.target.value):e.target.value);setResult(null);setError('');setConfirmedGaps({});};
 function find(e){e?.preventDefault();calculate();}
 function transition(fn,message,recalculate=false){
  try{const next=fn(state);if(onBook(()=>next,message)&&recalculate)calculate(next);}catch(e){setError(e.message);}
 }
 function book(plan){
  if(plan.needsGapConfirmation&&!confirmedGaps[plan.id]){setError('请先确认可以接受方案中的空窗。');return;}
  try{
   let next=viewingShortSeats?bookReaderShortSeat(state,result.request,plan.id):bookPlan(state,plan);
   if(demo)next={...next,demoStage:state.scenario==='renewal'?(plan.needsRenewal?'reserved':'complete'):'booked'};
   const message=plan.needsRenewal?'可用时段预约成功，后续可再找续座。':'预约成功。';
   if(onBook(()=>next,message)){setError('');setResult(null);if(!demo)onShowReservations();}
  }catch(e){
   setError(`整套未提交：${e.message}`);
  }
 }
 function setGap(value){setMaxGap(value);calculate(state,{maxGapMinutes:value});}
 return <section className="planner-panel">
 {demo&&<DemoSelector active={state.scenario} onSelect={onSelectDemo}/>}
 {demo?<DemoStory state={state} maxGap={maxGap} onSetGap={setGap} onEnter={()=>transition(enterScenarioLibrary,'模拟入馆成功，A 座已签到。')} onRelease={()=>transition(advanceAndRelease,'14:50：B 座已释放，正在展示新的续座机会。',true)} onFind={find} onShowReservations={onShowReservations} renderMap={renderMap}/>:<>
 <div className="planner-intro"><h2>{reservationId?'为当前预约找续座':'智能找座'}</h2><p>{reservationId?'从当前方案结束后找空位，新增时段至少 60 分钟。':'优先找每段至少 60 分钟的座位。可在确认前查看每段时长和换座次数。'}</p></div>
 <form className="planner-form" onSubmit={find}>
 <div className="planner-date"><span>学习日期</span><strong data-testid="planner-date">{date.replaceAll('-','/')}</strong><small>22:30 前默认当天，之后默认次日</small></div>
 {grouped.length>0&&<label className="planner-mode">这次要做什么<select aria-label="找座模式" value={reservationId} onChange={change(setReservationId)}><option value="">新找一个学习时段</option>{grouped.map(r=><option key={r.id} value={r.id}>接着 {r.seatId} 的{r.planId?'整套方案':'预约'}续座</option>)}</select></label>}
 <div className="planner-fields">
 {!reservationId&&<label>学习开始<input aria-label="学习开始" type="time" step="1" required value={start} onChange={change(setStart)}/></label>}
 <label>希望学到<input aria-label="希望学到" type="time" step="1" required value={end} onChange={change(setEnd)}/></label>
 <label>最多换座<select aria-label="最多换座" value={maxSwitches} onChange={change(setMaxSwitches)}><option value="0">不换座</option><option value="1">1 次</option><option value="2">2 次</option></select></label>
 <label>每段至少（分钟）<input aria-label="每段至少（分钟）" type="number" min="60" max="960" step="1" required value={minSegment} onChange={change(setMinSegment)}/></label>
 <label>每次可接受空窗（分钟）<input aria-label="每次可接受空窗（分钟）" type="number" min="0" max="870" step="1" required value={maxGap} onChange={change(setMaxGap)}/></label>
 </div>
 <label className="planner-check"><input type="checkbox" checked={allowPartial} onChange={change(setAllowPartial)}/>没有完整方案时，也看看能先坐多久</label>
 {reservationId&&<p className="planner-hint">从所选方案最后一段之后查找，已有预约保持不变。换座上限包含该方案已经安排的换座。</p>}
 <button className="primary" type="submit">{reservationId?'重新找续座':'帮我找座'}</button>
 </form></>}
 {error&&<p role="alert" className="message error">{error}</p>}
 {result&&<div className="planner-results" aria-live="polite">
 <div className="result-title"><h3>{visiblePlans.length?`找到 ${visiblePlans.length} 个${viewingShortSeats?'短时单座':'方案'}`:hasShortSeats?'暂无达到 60 分钟的方案':'暂时没有合适方案'}</h3><button onClick={find}>重新计算</button></div>
 {resultState!==state&&<p className="planner-hint">座位或模拟时间已变化。可重新计算；确认时仍会检查每一段是否可约。</p>}
 {!visiblePlans.length&&!hasShortSeats&&<p className="planner-hint">{result.reason}</p>}
 {hasShortSeats&&<div className="short-seat-offer">
  <p>短时方案只预约一张座位，无需换座。</p>
  <button type="button" aria-expanded={viewingShortSeats} aria-controls="seat-plan-options" onClick={()=>setShowShortSeats(value=>!value)}>{viewingShortSeats?'收起短时单座':`查看 ${SHORT_SEAT_MINUTES}–59 分钟单座`}</button>
 </div>}
 <div id="seat-plan-options">{visiblePlans.map((p,i)=><article className="plan-card" key={p.id} data-testid="plan-card">
 <header><h3>{p.renewalOf?'新的续座机会':viewingShortSeats?'短时单座':planNames[p.kind]}</h3><span>{i===0?'优先推荐':`备选 ${i}`}</span></header>
 <p className="plan-summary">{p.renewalOf?'可追加有座':'实际有座'} <strong>{minutes(p.seatedSeconds)}</strong><span>{(p.totalSwitches??p.switches)>0?`换座 ${p.totalSwitches??p.switches} 次`:'无需换座'}{p.renewalOf?'（含已有安排）':''}</span></p>
 <ol className="plan-segments">{p.segments.map((s,j)=><React.Fragment key={`${s.seatId}-${s.start}`}>{p.gaps.find(g=>g.end===s.start)&&<li className="plan-gap">空窗 {minutes(p.gaps.find(g=>g.end===s.start).seconds)} · {format(p.gaps.find(g=>g.end===s.start).start)}–{format(s.start)}</li>}<li className="plan-segment"><span className="segment-number">{demo?Object.entries(DEMO_SEATS).find(([,id])=>id===s.seatId)?.[0]||j+1:j+1}</span><div><strong>{s.seatId}</strong><span>{format(s.start)}–{format(s.end)}</span></div><small>{minutes(s.end-s.start)}</small></li></React.Fragment>)}</ol>
 {p.needsRenewal&&<p className="partial-note">目前只能安排到 {format(p.coveredUntil)}，距离目标还缺 {minutes(p.unfilledSeconds)}。后续需要重新找续座，不保证有位。</p>}
 {p.gapSeconds>0&&<label className="planner-check gap-confirm"><input type="checkbox" aria-label={`接受方案 ${i+1} 的空窗`} checked={!!confirmedGaps[p.id]} onChange={e=>setConfirmedGaps({...confirmedGaps,[p.id]:e.target.checked})}/>我接受以上空窗，共 {minutes(p.gapSeconds)}；空窗不算有座时间。</label>}
 <button className="primary" disabled={p.needsGapConfirmation&&!confirmedGaps[p.id]} onClick={()=>book(p)}>{viewingShortSeats?'确认预约短时单座':p.renewalOf?'确认追加续座':p.kind==='partial'?'确认预约可用时段':'确认预约整套方案'}</button>
 {!viewingShortSeats&&<small className="plan-footnote">确认时再次检查全部时段；任一段失败，整套不提交。</small>}
 </article>)}</div>
 </div>}
 {!result&&!demo&&<p className="planner-hint planner-empty">相邻两段可以在同一时刻交接，不另扣搬东西的时间。仅时段之间确实无座时，才计为空窗。</p>}
 </section>;
}
