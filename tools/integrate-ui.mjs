import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let bundle=await readFile(path.join(root,'assets/index-DWbUfj1l.js'),'utf8');
function replaceOnce(before,after){
  if(bundle.split(before).length!==2)throw new Error('The deployed application changed. Review integration anchor: '+before.slice(0,90));
  bundle=bundle.replace(before,after);
}
replaceOnce('function gh(){','const SeatWorkspace=createSeatWorkspace(f);function gh(){');
replaceOnce('[bt,ql]=ul.useState(!1),H=ul.useRef(null)', '[bt,ql]=ul.useState(!1),[showSimulator,setShowSimulator]=ul.useState(!1),H=ul.useRef(null)');
replaceOnce('[M,R]=ul.useState(y?"planner":"home")','[M,R]=ul.useState(y?"planner":"map")');
replaceOnce('[U,v]=ul.useState(kl(Math.max(Gl,_l(z.now)),!0)),[C,F]=ul.useState("22:30:00")','[U,v]=ul.useState(kl(Math.min(at-3600,Math.max(Gl,Math.ceil(_l(z.now)/900)*900)),!0)),[C,F]=ul.useState(kl(Math.min(at,Math.max(Gl,Math.ceil(_l(z.now)/900)*900)+10800),!0))');
replaceOnce('function cl(O=null){if(!y&&!O){x();return}Fl(el=>el+1),sl(O),R("planner"),El(""),Il("")}','function cl(O=null){Fl(el=>el+1),sl(O),R("planner"),El(""),Il("")}');
const ghStart=bundle.indexOf('function gh(){');
const rootReturn=bundle.indexOf('return f.createElement("div",{className:"workspace"}',ghStart);
if(rootReturn<0)throw new Error('Application root not found');
const bridge=`const renderWorkspace=()=>f.createElement(SeatWorkspace,{
seats:ne,state:z,date:D,dates:ae(z.now),start:U,end:C,onDate:Tt,onStart:v,onEnd:F,
nowSeconds:D===pl(z.now)?Math.max(Gl,_l(z.now)):Gl,
getWindows:seat=>_u(z,seat.id,D,Math.max(Gl,D===pl(z.now)?_l(z.now):Gl)).map(([a,b])=>[_l(a),_l(b)]),
getEligibility:(seat,start,end)=>Iy(z,{seatId:seat.id,date:D,start:Cl(D,start),end:Cl(D,end)}),
renderMap:(selected,onPick,query,statuses)=>f.createElement(qd,{seats:ne,selected,date:D,state:z,query,onPick,slotStatuses:statuses}),
onBook:(seat,start,end,note="")=>{const ok=Y(st=>Xd(st,{seatId:seat.id,date:D,start:Cl(D,Ra(start)),end:Cl(D,Ra(end)),note:note.slice(0,50)}),"预约成功。请在开始后30分钟内入馆签到。");if(ok)R("manage");return ok},
onPlanner:()=>cl(),onDemo:()=>x("stitch")});`;
bundle=bundle.slice(0,rootReturn)+bridge+bundle.slice(rootReturn);
replaceOnce('return f.createElement("div",{className:"workspace"}', 'return f.createElement("div",{className:"workspace view-"+M+(showSimulator?" show-simulator":"")}');
const headerStart=bundle.indexOf('f.createElement("header",{className:"app-header"}',ghStart);
const headerEnd=bundle.indexOf('M!=="home"&&',headerStart);
bundle=bundle.slice(0,headerStart)+`f.createElement("header",{className:"app-header"},
f.createElement("button",{className:"sl-brand",onClick:()=>{R("map");El("")},"aria-label":"SeatLink 推荐找座"},f.createElement("span",{className:"sl-brand-mark","aria-hidden":true},"▥"),"SeatLink",f.createElement("span",{className:"sl-brand-subtitle"},"交大图书馆")),
f.createElement("div",{className:"sl-header-actions"},f.createElement("span",{className:"sl-simulation"},"演示版"),f.createElement("button",{className:"sl-panel-toggle","aria-expanded":showSimulator,onClick:()=>setShowSimulator(!showSimulator)},showSimulator?"收起演示面板":"演示面板"))),`+bundle.slice(headerEnd);
const homeStart=bundle.indexOf('M==="home"&&f.createElement(f.Fragment,null',ghStart);
const homeEnd=bundle.indexOf('M==="planner"&&',homeStart);
if(homeStart<0||homeEnd<0)throw new Error('Home route not found');
bundle=bundle.slice(0,homeStart)+'M==="home"&&renderWorkspace(),'+bundle.slice(homeEnd);
const mapStart=bundle.indexOf('M==="map"&&f.createElement(f.Fragment,null',ghStart);
const mapEnd=bundle.indexOf('M==="form"&&tl&&',mapStart);
if(mapStart<0||mapEnd<0)throw new Error('Map route not found');
bundle=bundle.slice(0,mapStart)+'M==="map"&&renderWorkspace(),'+bundle.slice(mapEnd);
replaceOnce('initialReservationId:Z,onShowReservations','initialReservationId:Z,initialSearch:y||Z?null:{date:D,start:U,end:C},onShowReservations');
replaceOnce('function vh({state:o,onBook:E,initialReservationId:y=null,onShowReservations:s,demo:z=!1,onSelectDemo:M,renderMap:R})','function vh({state:o,onBook:E,initialReservationId:y=null,initialSearch:search=null,onShowReservations:s,demo:z=!1,onSelectDemo:M,renderMap:R})');
replaceOnce('const D=ae(o.now)[0],X=()=>z?"14:00:00"','const D=!z&&search?.date||ae(o.now)[0],X=()=>!z&&search?.start?search.start:z?"14:00:00"');
replaceOnce('[v,C]=ul.useState(z||D===pl(o.now)?"17:00:00":"10:00:00")','[v,C]=ul.useState(!z&&search?.end?search.end:z||D===pl(o.now)?"17:00:00":"10:00:00")');
replaceOnce('const A={start:j,end:v,minSegmentMinutes:al','const A={date:D,start:j,end:v,minSegmentMinutes:al');
replaceOnce('U(X()),C(D===pl(o.now)?"17:00:00":"10:00:00")','U(X()),C(search?.end||(D===pl(o.now)?"17:00:00":"10:00:00"))');
replaceOnce('使用当前预约数据找座，或点击上方场景进入独立演示。','拼座按时间和换座次数筛选，不应用推荐页的环境偏好。场景演示使用独立数据。');
replaceOnce('[["manage","▤","预约管理"],["home","⌂","首页"],["planner","⌕","智能找座"],["profile","♙","个人中心"]]','[["home","▥","推荐找座"],["planner","⌕","智能拼座"],["manage","▤","我的预约"],["profile","♙","个人中心"]]');
replaceOnce('className:M===O?"current":""','className:M===O||O==="home"&&M==="map"?"current":""');
replaceOnce('function qd({seats:o,selected:E,date:y,state:s,query:z,onPick:M,highlights:R=null})','function qd({seats:o,selected:E,date:y,state:s,query:z,onPick:M,highlights:R=null,slotStatuses:slotStatuses=null})');
replaceOnce('const X=Fo(s,D.id,y),j=z&&D.id.toLowerCase().includes(z.toLowerCase())','const X=slotStatuses?.[D.id]?.status||Fo(s,D.id,y),seatLabel=slotStatuses?.[D.id]?.label||ui[X],isVisible=slotStatuses?.[D.id]?.visible!==false,j=z&&D.id.toLowerCase().includes(z.toLowerCase())');
replaceOnce('role:"button",tabIndex:"0","aria-label":`${D.id} ${ui[X]}`','role:"button",tabIndex:isVisible?"0":"-1","aria-label":`${D.id} ${seatLabel}`');
replaceOnce('onClick:()=>M(D),onKeyDown:v=>{(v.key==="Enter"||v.key===" ")','onClick:()=>isVisible&&M(D),onKeyDown:v=>{isVisible&&(v.key==="Enter"||v.key===" ")');
replaceOnce('opacity:R&&!U||z&&!j?.25:1','opacity:!isVisible?.12:R&&!U||z&&!j?.25:1');
replaceOnce('f.createElement("title",null,D.id," · ",ui[X]','f.createElement("title",null,D.id," · ",seatLabel');
replaceOnce('fill:E?.id===D.id?"#ca3228":X==="free"?"#68a83e":X==="partial"?"url(#half)":"#fac849",stroke:U||j?"#075cd4":"#fff",strokeWidth:U||j?3:1','fill:slotStatuses?X==="free"?"#1d8369":X==="partial"?"#f0b64f":"#cbd5dc":E?.id===D.id?"#ca3228":X==="free"?"#68a83e":X==="partial"?"url(#half)":"#fac849",stroke:E?.id===D.id?"#234c92":U||j?"#075cd4":"#fff",strokeWidth:E?.id===D.id?4:U||j?3:1');
bundle=bundle.replace('fill:"#c6a17a"','fill:"#e2e8e3"').replace('stroke:"#ead8bc"','stroke:"#cbd5ce"');
bundle='import {createSeatWorkspace} from "../ui/seat-workspace.js";\n'+bundle;
await writeFile(path.join(root,'assets/index-seatlink-ui.js'),bundle);
let index=await readFile(path.join(root,'index.html'),'utf8');
index=index.replace('./assets/index-DWbUfj1l.js','./assets/index-seatlink-ui.js').replace(/<title>.*?<\/title>/,'<title>SeatLink · 偏好推荐找座</title>');
if(!index.includes('./ui/seat-workspace.css'))index=index.replace('</head>','  <link rel="stylesheet" href="./ui/seat-workspace.css">\n</head>');
if(!index.includes('./ui/recommendations.css'))index=index.replace('</head>','  <link rel="stylesheet" href="./ui/recommendations.css">\n</head>');
await writeFile(path.join(root,'index.html'),index);
console.log('Integrated the new seat browser. Original booking engine and demo flows retained.');
