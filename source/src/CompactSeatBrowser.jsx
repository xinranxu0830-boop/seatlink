import React,{useEffect,useMemo,useRef,useState} from 'react';
import Icon,{IconButton} from './Icons.jsx';
import SeatMap from './SeatMap.jsx';
import {seats} from './seats.js';
import {OPEN,CLOSE,at,clock,bookingDays,secOf} from './engine.js';
import {duration} from './availability.js';
import {SEAT_PREFERENCES,buildTimelineSeats} from './recommendations.js';
import {findRecommendations,DEMO_PROFILES,selectionError,assess,reserveRecommended} from './recommendation-service.js';

const PREF_KEY='seatlink-compact-preferences-v3';
const short={display:'显示屏',daylight:'采光',shade:'避晒',sparse:'少人',partition:'隔板',lowTraffic:'少走动',noDraft:'无直吹'};
function readPrefs(){try{const p=JSON.parse(localStorage.getItem(PREF_KEY));return {preferences:Array.isArray(p?.preferences)?p.preferences.filter(id=>SEAT_PREFERENCES.some(p=>p.id===id)):[],required:p?.required===true};}catch{return {preferences:[],required:false};}}
export function PreferenceMenu({preferences,required,onChange}){
 const [open,setOpen]=useState(false),wrap=useRef(null),trigger=useRef(null),first=useRef(null);
 useEffect(()=>{
  if(!open)return;
  first.current?.focus();
  const outside=e=>{if(!wrap.current?.contains(e.target))setOpen(false);};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
  return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};
 },[open]);
 return <div className="preference-anchor" ref={wrap} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
  <button ref={trigger} type="button" className={`preference-trigger ${preferences.length?'active':''}`} aria-label={`座位偏好，已选 ${preferences.length} 项${required?'，必须满足':''}`} title="座位偏好" aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(v=>!v)}><Icon name="more"/>{preferences.length>0&&<span className="preference-count">{preferences.length}</span>}</button>
  {open&&<div className="preference-popup" role="dialog" aria-label="座位偏好"><div className="preference-grid">
   {SEAT_PREFERENCES.map((p,i)=><button ref={i===0?first:undefined} key={p.id} aria-label={p.label} title={p.hint} aria-pressed={preferences.includes(p.id)} onClick={()=>onChange({preferences:preferences.includes(p.id)?preferences.filter(v=>v!==p.id):[...preferences,p.id],required})}><Icon name={p.id} size={23}/><span>{short[p.id]}</span>{preferences.includes(p.id)&&<Icon name="check" size={12} className="pref-check"/>}</button>)}
   <button aria-label="清空偏好" onClick={()=>onChange({preferences:[],required:false})}><Icon name="reset" size={22}/><span>重置</span></button>
  </div><div className="preference-mode"><button aria-label="所选偏好必须满足" aria-pressed={required} onClick={()=>onChange({preferences,required:!required})}><Icon name={required?'lock':'unlock'} size={17}/><span>必须满足</span><span className={`switch ${required?'on':''}`}/></button><button className="pref-done" onClick={()=>{setOpen(false);trigger.current?.focus();}}>完成</button></div></div>}
 </div>;
}
function Facts({values,ids=SEAT_PREFERENCES.map(p=>p.id),interactive=false}){
 const [hint,setHint]=useState(null);
 return <div className="fact-wrap"><div className="seat-facts">{ids.map(id=>{
  const v=values[id],status=v===true?'yes':v===false?'no':'unknown';
  const title=`${SEAT_PREFERENCES.find(p=>p.id===id)?.label}：${v===true?'符合':v===false?'不符合':'未知'}（模拟）`;
  const content=<><Icon name={id} size={18}/>{status==='unknown'&&<span className="fact-mark">?</span>}{status==='no'&&<span className="fact-slash"/>}</>;
  return interactive?<button type="button" key={id} className={`fact ${status}`} aria-label={title} title={title} onClick={()=>setHint(hint===title?null:title)}>{content}</button>:<span key={id} className={`fact ${status}`} title={title} aria-label={title}>{content}</span>;
 })}</div>{hint&&<p className="fact-hint" role="status">{hint}</p>}</div>;
}
export function SeatTrack({windows,start,end,fullDay=false}){
 const from=fullDay?OPEN:start,to=fullDay?CLOSE:end;
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)return <div className="seat-track"/>;
 const pos=t=>(t-from)/(to-from)*100;
 return <div className="seat-track" role="img" aria-label={windows.length?`空闲 ${windows.map(([a,b])=>`${clock(a)}至${clock(b)}`).join('，')}`:'没有空闲时段'}>
  {[0,25,50,75,100].map(x=><i className="track-grid" key={x} style={{left:`${x}%`}}/>)}
  {windows.map(([a,b])=>[Math.max(from,a),Math.min(to,b)]).filter(([a,b])=>b>a).map(([a,b])=><span key={a} className="available-block" style={{left:`${pos(a)}%`,width:`${pos(b)-pos(a)}%`}}/>)}
  {fullDay&&<span className="requested-band" style={{left:`${pos(start)}%`,width:`${pos(end)-pos(start)}%`}}/>}
 </div>;
}
export default function CompactSeatBrowser({state,request,onRequest,onBook,onPlanner}){
 const [prefs,setPrefs]=useState(readPrefs),[view,setView]=useState('map'),[all,setAll]=useState(false),[partial,setPartial]=useState(false),[query,setQuery]=useState(''),[search,setSearch]=useState(false),[selected,setSelected]=useState(null),[range,setRange]=useState(null),[note,setNote]=useState(''),[notesOpen,setNotesOpen]=useState(false),[zoom,setZoom]=useState(1),[bookingMessage,setBookingMessage]=useState('');
 const details=useRef(null),searchInput=useRef(null);
 const {date,start,end}=request;
 const data=useMemo(()=>findRecommendations(state,{...request,...prefs,allowPartial:partial}),[state,date,start,end,prefs,partial]);
 const queryMatches=s=>s.id.toLowerCase().includes(query.trim().toLowerCase());
 const listed=buildTimelineSeats(data.rows,data.ranking,{includeAll:all}).filter(queryMatches);
 const picked=data.rows.find(s=>s.id===selected),recommendedIds=new Set(data.ranking.results.map(s=>s.id));
 const chosen=range||picked?.preferred;
 const input=chosen&&picked?{seatId:picked.id,date,start:at(date,chosen[0]),end:at(date,chosen[1]),note}:null;
 const error=input?selectionError(state,input,prefs.preferences,prefs.required):'此时段不可约';
 const chosenAssessment=picked&&chosen?assess(picked.profile,state,date,...chosen):picked?.assessment;
 useEffect(()=>{try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}catch{}},[prefs]);
 useEffect(()=>{setSelected(null);setRange(null);setBookingMessage('');},[date,start,end]);
 useEffect(()=>{if(selected&&!details.current?.open)details.current?.showModal();else if(!selected&&details.current?.open)details.current?.close();},[selected]);
 useEffect(()=>{if(search)searchInput.current?.focus();},[search]);
 function choose(seat){setSelected(seat.id);setRange(null);setNote('');setNotesOpen(false);setBookingMessage('');}
 function book(){
  if(!input)return;
  try{const next=reserveRecommended(state,input,prefs.preferences,prefs.required);if(onBook(()=>next,'预约成功'))setSelected(null);}catch(e){setBookingMessage(e.message);}
 }
 const matches=data.ranking.results.length;
 return <section className="compact-browser">
  <div className="school-open-hours">当日开放 08:00–22:30</div>
  <div className="school-date-row"><label htmlFor="study-date">预约日期</label><select id="study-date" aria-label="学习日期" value={date} onChange={e=>onRequest({...request,date:e.target.value})}>{bookingDays(state.now).map(d=><option key={d} value={d}>{d.replaceAll('-','/')}</option>)}</select><Icon name="calendar" size={20}/></div>
  <div className="school-time-row"><label><span>开始时间</span><input aria-label="开始时间" type="time" value={start.slice(0,5)} min="08:00" max="22:30" step="60" onChange={e=>onRequest({...request,start:e.target.value})}/></label><label><span>结束时间</span><input aria-label="结束时间" type="time" value={end.slice(0,5)} min="08:00" max="22:30" step="60" onChange={e=>onRequest({...request,end:e.target.value})}/></label></div>
  {data.error&&<p role="alert" className="compact-error">{data.error}</p>}
  <div className="result-toolbar"><div className="result-heading"><span className="result-count" aria-live="polite">{matches} <span>个推荐</span></span><div className="active-preferences" aria-label="已选偏好">{prefs.required&&prefs.preferences.length>0&&<Icon name="lock" size={16}/>}<Facts values={Object.fromEntries(prefs.preferences.map(id=>[id,true]))} ids={prefs.preferences}/></div></div><div className="result-actions"><button className={`partial-toggle ${partial?'active':''}`} aria-pressed={partial} onClick={()=>setPartial(v=>!v)} title="包含至少一小时的部分时段"><Icon name="clock" size={16}/>{partial?'含短时':'整段'}</button><div className="view-toggle" role="group" aria-label="座位视图"><IconButton icon="list" label="时间列表" aria-pressed={view==='list'} onClick={()=>setView('list')}/><IconButton icon="map" label="座位地图" aria-pressed={view==='map'} onClick={()=>setView('map')}/></div><IconButton icon="search" label="搜索座位" aria-expanded={search} onClick={()=>{setSearch(v=>!v);setQuery('');}}/><PreferenceMenu {...prefs} onChange={setPrefs}/></div></div>
  {search&&<div className="compact-search"><Icon name="search" size={18}/><input ref={searchInput} aria-label="搜索座位编号" placeholder="座位编号" value={query} onChange={e=>setQuery(e.target.value)}/><IconButton icon="close" label="关闭搜索" onClick={()=>{setSearch(false);setQuery('');}}/></div>}
  <div className="list-caption"><div className="compact-legend"><span><i className="legend-swatch free"/>空闲</span><span><i className="legend-swatch partial"/>半空闲</span><span><i className="legend-swatch busy"/>已约</span>{prefs.preferences.includes('sparse')&&!data.rows.some(s=>s.assessment.nearby.known)&&<span className="unknown-hint"><Icon name="sparse" size={14}/>?</span>}</div><button className="scope-toggle" aria-pressed={all} onClick={()=>setAll(v=>!v)}>{all?'仅推荐':'全部座位'}<Icon name="down" size={14}/></button></div>
  {listed.length===0&&<div className="compact-empty"><Icon name={prefs.required?'lock':'seat'} size={36}/><h2>{data.error?'调整时间':query?'没有这个座位':prefs.required?'没有完全匹配':'暂无整段座位'}</h2><div>{prefs.required&&<button onClick={()=>setPrefs({...prefs,required:false})}>放宽偏好</button>}{!partial&&<button onClick={()=>setPartial(true)}>看看短时</button>}<button onClick={()=>onPlanner(request)}>智能找座<Icon name="route" size={16}/></button></div></div>}
  {view==='list'?<div className="seat-list" aria-label="推荐座位列表"><div className="seat-list-head"><span>座位</span><span className="time-axis"><span>{start.slice(0,5)}</span><span>{end.slice(0,5)}</span></span><span>可坐时段</span><span/></div><div className="seat-list-scroll">{listed.map((seat,i)=><button key={seat.id} className={`seat-result ${seat.isRecommended?'recommended':'outside'}`} data-seat-id={seat.id} data-recommended={seat.isRecommended} aria-label={`查看 ${seat.id}，${seat.label}`} onClick={()=>choose(seat)}><div className="seat-result-id"><span className={`rank-dot ${seat.isRecommended?'':'unranked'}`}>{seat.isRecommended?seat.recommendationRank:<Icon name="seat" size={14}/>}</span><div><strong>{seat.id.replace('SIM-M-','M·').replace('LC2-M-','LC·')}</strong><Facts values={seat.assessment.values} ids={prefs.preferences.length?prefs.preferences:['display','daylight','partition']}/></div></div><div className="result-track"><SeatTrack windows={seat.windows} start={data.start} end={data.end}/></div><div className="seat-result-time">{seat.preferred?<><strong>{clock(seat.preferred[0])}–{clock(seat.preferred[1])}</strong><small>{duration(seat.preferred[1]-seat.preferred[0])}{seat.status==='partial'?' · 部分':''}</small></>:<span>{seat.label==='预约重叠'?'与你的预约重叠':'不可约'}</span>}</div><Icon name="next" size={18}/></button>)}</div></div>:
   <div className="compact-map"><div className="compact-map-scroll"><div style={{width:`${zoom*100}%`}}><SeatMap seats={seats} selected={picked} date={date} state={state} query={query} statuses={Object.fromEntries(data.rows.map(s=>[s.id,s]))} visibleIds={new Set(listed.map(s=>s.id))} onPick={choose}/></div></div><div className="map-bottom"><span>{all?`${seats.length} 个座位`:`${recommendedIds.size} 个推荐`}</span><div><IconButton icon="minus" label="缩小地图" disabled={zoom===1} onClick={()=>setZoom(z=>Math.max(1,z-.5))}/><span>{zoom*100}%</span><IconButton icon="plus" label="放大地图" disabled={zoom===2.5} onClick={()=>setZoom(z=>Math.min(2.5,z+.5))}/></div></div></div>}
  <div className="browser-footer"><span><Icon name="info" size={14}/>环境为模拟数据</span><button onClick={()=>onPlanner(request)}><Icon name="route" size={16}/>智能找座</button></div>
  <dialog ref={details} className="compact-dialog seat-detail-dialog" aria-label="座位详情" onCancel={()=>setSelected(null)} onClick={e=>{if(e.target===details.current)setSelected(null);}}>{picked&&<><div className="dialog-heading"><div><span className="eyebrow-label">{picked.verified?'C200 · 已核对编号':'C200 · 模拟编号'}</span><h2>{picked.id}</h2></div><IconButton icon="close" label="关闭座位详情" onClick={()=>setSelected(null)}/></div>
   <div className="detail-facts"><Facts values={chosenAssessment.values} interactive/>{picked.profile.display&&<span className="display-port">HDMI</span>}</div>
   <div className="detail-timeline"><SeatTrack windows={picked.windows} start={data.start} end={data.end} fullDay/><div className="time-axis"><span>08:00</span><span>22:30</span></div></div>
   <div className="detail-slots">{picked.windows.filter(([a,b])=>b-a>=3600).map(([a,b])=>{const clipped=[Math.max(a,data.start),Math.min(b,data.end)],slot=clipped[1]-clipped[0]>=3600?clipped:[a,b];return <button key={a} aria-pressed={chosen?.[0]===slot[0]&&chosen?.[1]===slot[1]} onClick={()=>{setRange(slot);setBookingMessage('');}}>{clock(slot[0])}–{clock(slot[1])}</button>;})}</div>
   {chosen&&<div className="booking-duration"><strong>{duration(chosen[1]-chosen[0])}</strong>{(chosen[0]>data.start||chosen[1]<data.end)&&<span>仅部分时段</span>}</div>}
   {(bookingMessage||error)&&<p className="compact-error" role="alert">{bookingMessage||error}</p>}
   {notesOpen&&<textarea autoFocus aria-label="预约备注" maxLength={50} placeholder="备注（选填，50 字内）" value={note} onChange={e=>setNote(e.target.value)}/>}
   <div className="detail-actions"><IconButton icon="note" label="预约备注" aria-expanded={notesOpen} onClick={()=>setNotesOpen(v=>!v)}/><button className="compact-primary" disabled={!input||!!error||!!data.error} onClick={book}><Icon name="check" size={18}/>预约{chosen?` ${clock(chosen[0])}–${clock(chosen[1])}`:''}</button></div>
  </>}</dialog>
 </section>;
}
