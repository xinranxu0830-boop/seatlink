import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import CompactSeatBrowser from './CompactSeatBrowser.jsx';
import PlannerPanel from './PlannerPanel.jsx';
import ReplayPanel from './ReplayPanel.jsx';
import SeatMap from './SeatMap.jsx';
import Icon,{IconButton} from './Icons.jsx';
import {seats} from './seats.js';
import {createState,OPEN,CLOSE,at,dayOf,secOf,clock,bookingDays,USER,live,cancel,scan,advance} from './engine.js';
import {createScenario,SCENARIOS,DEMO_SEATS} from './scenarios.js';
import './style.css';
import './compact.css';
import './school.css';
import {SchoolHome,SchoolProfile} from './SchoolPages.jsx';
const KEY='c200-reservation-simulator-v2',DEMO_KEY='c200-guided-demo-v1';
function read(key){try{const s=JSON.parse(localStorage.getItem(key));return s?.version===2&&Number.isFinite(s.now)&&Array.isArray(s.reservations)&&Array.isArray(s.events)?s:null;}catch{return null;}}
function defaultRequest(state){const date=bookingDays(state.now)[0],start=date===dayOf(state.now)?Math.max(14*3600,Math.ceil(secOf(state.now)/900)*900):OPEN;return {date,start:clock(start),end:clock(Math.min(CLOSE,start+3*3600))};}
const statusNames={reserved:'待签到',checked_in:'已签到',completed:'已结束',expired:'已释放',cancelled:'已取消',signed_out:'已签退'};
function App(){
 const [base,setBase]=useState(()=>read(KEY)||createState()),[demo,setDemo]=useState(()=>{const d=read(DEMO_KEY);return SCENARIOS[d?.scenario]?d:null;}),[page,setPage]=useState(()=>SCENARIOS[read(DEMO_KEY)?.scenario]?'planner':'seats');
 const state=demo||base;
 const [request,setRequest]=useState(()=>defaultRequest(base)),[plannerRequest,setPlannerRequest]=useState(null),[plannerKey,setPlannerKey]=useState(0),[renewal,setRenewal]=useState(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[storageError,setStorageError]=useState(false),[modal,setModal]=useState(null);
 const modalRef=useRef(null);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(base));setStorageError(false);}catch{setStorageError(true);}},[base]);
 useEffect(()=>{try{if(demo)localStorage.setItem(DEMO_KEY,JSON.stringify(demo));else localStorage.removeItem(DEMO_KEY);}catch{setStorageError(true);}},[demo]);
 useEffect(()=>{if(!bookingDays(state.now).includes(request.date))setRequest(defaultRequest(state));},[state.now,request.date]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return ()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{if(modal&&!modalRef.current.open)modalRef.current.showModal();else if(!modal&&modalRef.current.open)modalRef.current.close();},[modal]);
 function act(fn,message){try{const next=fn(state);if(demo)setDemo(next);else setBase(next);setNotice(message||'已完成');setError('');return true;}catch(e){setError(e.message);return false;}}
 function book(fn,message){const ok=act(fn,message);if(ok)setPage('bookings');return ok;}
 function selectDemo(name){setDemo(createScenario(name));setPage('planner');setPlannerKey(k=>k+1);setRenewal(null);setNotice('');setError('');setModal(null);}
 function exitDemo(){setDemo(null);setRequest(defaultRequest(base));setPage('seats');setPlannerKey(k=>k+1);setRenewal(null);setError('');setNotice('已回到原预约');}
 function openPlanner(input=request,id=null){setPlannerRequest(input);setRenewal(id);setPlannerKey(k=>k+1);setPage('planner');}
 const replaying=page==='replay';
 const dataTitle=replaying?'回放数据':'模拟数据';
 const modalTitle=modal==='data'?dataTitle:modal==='scenes'?'场景演示':'模拟控制';
 const mine=state.reservations.filter(r=>r.userId===USER).sort((a,b)=>b.createdAt-a.createdAt);
 return <div className="compact-app school-app">
  <header className="school-header"><IconButton icon="back" label="返回首页" onClick={()=>setPage('home')}/><span>交圖座位预约</span><button className="school-simulation" onClick={()=>setModal('data')} aria-label={`查看${dataTitle}`}>{replaying?'回放':'模拟'}</button></header>
  <div className="school-subheader"><span className="subheader-spacer"/><span>{({home:'座位预约',seats:'C200-中区（M）',planner:'智能找座与续座',bookings:'预约管理',profile:'个人中心',replay:'东区预约回放'})[page]}</span><div><IconButton icon="play" label="场景演示" onClick={()=>setModal('scenes')}/>{!replaying&&<IconButton icon="settings" label="模拟控制" onClick={()=>setModal('controls')}/>}</div></div>
  {notice&&<div className="compact-toast" role="status"><Icon name="check" size={17}/>{notice}</div>}
  <main className="compact-main">
   {storageError&&<p role="alert" className="compact-error">浏览器无法保存，刷新后操作会丢失。</p>}
   {error&&<div role="alert" className="compact-error">{error}<IconButton icon="close" label="关闭提示" onClick={()=>setError('')}/></div>}
   {demo&&!replaying&&<div className="compact-demo-bar"><span><Icon name="play" size={15}/>{SCENARIOS[demo.scenario]}</span><div><button onClick={()=>selectDemo(demo.scenario)} aria-label="重演本场景"><Icon name="reset" size={16}/></button><button onClick={exitDemo}>退出演示<Icon name="close" size={15}/></button></div></div>}
   {page==='home'&&<SchoolHome state={state} onSeats={()=>setPage('seats')} onPlanner={()=>openPlanner()}/>}
   {page==='profile'&&<SchoolProfile state={state} onControls={()=>setModal('controls')} onScenes={()=>setModal('scenes')} onData={()=>setModal('data')}/>}
   {page==='seats'&&<CompactSeatBrowser state={state} request={request} onRequest={setRequest} onBook={book} onPlanner={openPlanner}/>}
   {page==='replay'&&<ReplayPanel/>}
   {page==='planner'&&<PlannerPanel key={plannerKey} state={state} onBook={act} initialSearch={plannerRequest} initialReservationId={renewal} onShowReservations={()=>setPage('bookings')} demo={!!demo} onSelectDemo={selectDemo} renderMap={()=><SeatMap seats={seats} selected={null} date={bookingDays(state.now)[0]} state={state} query="" onPick={()=>{}} highlights={DEMO_SEATS}/>}/>}
   {page==='bookings'&&<section className="compact-bookings"><div className="result-toolbar"><h1>我的预约</h1><span className="result-count">{mine.length}</span></div>{mine.length===0?<div className="compact-empty"><Icon name="booking" size={38}/><h2>还没有预约</h2><button onClick={()=>setPage('seats')}>找座</button></div>:mine.map(r=><article className="compact-booking" key={r.id}><div className="booking-top"><strong>{r.seatId}</strong><span className={`booking-status ${live(r)?'live':''}`}>{statusNames[r.status]}</span></div><div className="booking-time"><Icon name="clock" size={18}/><b>{clock(secOf(r.start))}–{clock(secOf(r.end))}</b><span>{r.date.slice(5).replace('-','/')}</span></div>{r.status==='reserved'&&<p className="booking-deadline">{clock(secOf(r.start+1800))} 前入馆</p>}{r.note&&<p className="booking-note"><Icon name="note" size={14}/>{r.note}</p>}<div className="booking-buttons">{(live(r)||r.status==='completed')&&<button onClick={()=>openPlanner(request,r.id)}><Icon name="route" size={16}/>续座</button>}{live(r)&&<button onClick={()=>act(s=>cancel(s,r.id),'已取消')}><Icon name="close" size={16}/>取消</button>}</div></article>)}</section>}
  </main>
  <nav className="compact-nav" aria-label="主要导航">{[['bookings','booking','预约管理'],['home','home','首页'],['planner','route','智能找座'],['profile','user','个人中心']].map(([id,icon,label])=><button key={id} aria-current={page===id||(id==='home'&&page==='seats')?'page':undefined} onClick={()=>id==='planner'?openPlanner():setPage(id)}><Icon name={icon} size={23}/><span>{label}</span></button>)}</nav>
  <dialog ref={modalRef} className="compact-dialog utility-dialog" aria-label={modalTitle} onCancel={()=>setModal(null)} onClick={e=>{if(e.target===modalRef.current)setModal(null);}}><div className="dialog-heading"><h2>{modalTitle}</h2><IconButton icon="close" label="关闭面板" onClick={()=>setModal(null)}/></div>
   {modal==='data'&&replaying&&<div className="simulation-data"><p>当天真实预约作为已知的现有排期，原座位与预约时段保持不变。提前释放按记录时刻发生。</p><p>四组只为额外增加的模拟请求分配空位。新增用户按目标时段提出需求，结果为模拟分配时长。</p></div>}
   {modal==='data'&&!replaying&&<div className="simulation-data"><p>以下均为合成数据，未现场核实。</p><ul><li><Icon name="display"/>显示屏 / HDMI</li><li><Icon name="daylight"/>自然光 / 直晒时段</li><li><Icon name="partition"/>隔板 / 通道 / 空调</li><li><Icon name="sparse"/>附近 6 座人数快照</li></ul><p>人数快照：11/19 12:40。超过 10 分钟或目标开始晚于当前 15 分钟，记为未知。</p><p>预约为合成记录；布局参考 C200，SIM 编号待核对。</p></div>}
   {modal==='scenes'&&<div className="scene-grid">{Object.entries(SCENARIOS).map(([id,label])=><button key={id} onClick={()=>selectDemo(id)}><Icon name={id==='single'?'seat':id==='renewal'?'plus':id==='gap'?'clock':'route'}/>{label}</button>)}<button className="replay-entry" onClick={()=>{setPage('replay');setModal(null);}}><Icon name="calendar"/>东区预约回放</button></div>}
   {modal==='controls'&&<div className="simulation-controls"><div className="simulation-clock"><span>{dayOf(state.now)}</span><strong>{clock(secOf(state.now),true)}</strong></div><div className="clock-controls">{[5,30,60].map(n=><button key={n} disabled={!!demo} onClick={()=>act(s=>advance(s,s.now+n*60),`已前进 ${n} 分钟`)}>+{n} 分钟</button>)}</div><div className="clock-controls"><button disabled={!!demo||secOf(state.now)>=CLOSE} onClick={()=>act(s=>advance(s,at(dayOf(s.now),CLOSE)),'已到 22:30')}>22:30</button><button disabled={!!demo} onClick={()=>act(s=>advance(s,at(dayOf(s.now),OPEN)+86400),'次日 08:00')}>次日 08:00</button></div><div className="gate-controls"><button disabled={!!demo||state.inside} onClick={()=>act(s=>scan(s,'in'),'已签到')}><Icon name="in"/>入馆</button><button disabled={!!demo||!state.inside} onClick={()=>act(s=>scan(s,'out'),'已签退')}><Icon name="out"/>离馆</button></div>{demo&&<p>演示中请用场景步骤推进。</p>}<button className="reset-data" disabled={!!demo} onClick={()=>{if(window.confirm('重置本地模拟预约？')){const s=createState();setBase(s);setRequest(defaultRequest(s));setNotice('已重置');}}}><Icon name="reset" size={16}/>重置</button></div>}
  </dialog>
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
