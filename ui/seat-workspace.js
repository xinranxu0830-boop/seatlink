import {OPEN,CLOSE,MIN_BOOKING,parseTime,clock,duration,validateRange,analyzeAvailability} from './availability.js';
import {SEAT_PREFERENCES,REC_PRESETS,evaluateSeatProfile,rankSeats,profileLabels} from './recommendations.js';
import {demoSeatProfiles} from './seat-profiles.demo.js';

// React is supplied by the deployed application. No duplicate runtime or build step is needed.
export function createSeatWorkspace(React) {
  const h = React.createElement;
  function Icon({name,size=20}) {
    const paths = {
      map:'M3 6 9 3l6 3 6-3v15l-6 3-6-3-6 3V6m6-3v15m6-12v15',
      list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
      search:'m21 21-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
      clock:'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
      seat:'M5 11V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M4 11h16v6H4v-6m2 6v4m12-4v4',
      pin:'M12 22s7-8 7-13a7 7 0 0 0-14 0c0 5 7 13 7 13m2-13a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
      check:'m5 12 4 4L19 6',
      close:'m6 6 12 12M6 18 18 6',
    };
    return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:paths[name]||paths.seat}));
  }
  function Timeline({windows,start,end,range}) {
    const percent=x=>(x-OPEN)/(CLOSE-OPEN)*100;
    const safeStart=Math.max(OPEN,Math.min(CLOSE,start));
    const safeEnd=Math.max(safeStart,Math.min(CLOSE,end));
    return h('div',{className:'sl-timeline'},
      h('div',{className:'sl-time-track',role:'img','aria-label':`全天空闲时段：${windows.map(([a,b])=>clock(a)+'至'+clock(b)).join('，')||'暂无'}。学习目标${clock(start)}至${clock(end)}`},
        [10,12,14,16,18,20,22].map(t=>h('i',{key:t,className:'sl-grid-line',style:{left:percent(t*3600)+'%'}})),
        windows.map(([a,b],i)=>h('span',{key:i,className:'sl-free-window',style:{left:percent(a)+'%',width:(b-a)/(CLOSE-OPEN)*100+'%'}})),
        Number.isFinite(start)&&Number.isFinite(end)&&h('span',{className:'sl-target-window',style:{left:percent(safeStart)+'%',width:(safeEnd-safeStart)/(CLOSE-OPEN)*100+'%'}}),
        range&&h('span',{className:'sl-booking-window',style:{left:percent(range[0])+'%',width:(range[1]-range[0])/(CLOSE-OPEN)*100+'%'}})),
      h('div',{className:'sl-axis'},[8,10,12,14,16,18,20,22.5].map(t=>h('span',{key:t,style:{left:percent(t*3600)+'%'}},t===22.5?'22:30':String(t).padStart(2,'0')))));
  }
  function readPreferences(){try{const v=JSON.parse(localStorage.getItem('seatlink-seating-preferences-v2'));return v&&Array.isArray(v.preferences)?{preferences:v.preferences.filter(id=>SEAT_PREFERENCES.some(p=>p.id===id)),required:v.required===true,floor:['any','2'].includes(v.floor)?v.floor:'any'}:null}catch{return null}}
  return function SeatWorkspace({seats,state,date,dates,start,end,onDate,onStart,onEnd,getWindows,getEligibility=()=>'',nowSeconds,renderMap,onBook,onPlanner,onDemo}) {
    const [selected,setSelected]=React.useState(null);
    const [view,setView]=React.useState('recommend');
    const [filter,setFilter]=React.useState('all');
    const [query,setQuery]=React.useState('');
    const [range,setRange]=React.useState(null);
    const [zoom,setZoom]=React.useState(1);
    const [preferences,setPreferences]=React.useState(()=>readPreferences()?.preferences||[]);
    const [required,setRequired]=React.useState(()=>readPreferences()?.required||false);
    const [floor,setFloor]=React.useState(()=>readPreferences()?.floor||'any');
    const [notes,setNotes]=React.useState('');
    const resultsRef=React.useRef(null);
    const profiles=React.useMemo(()=>demoSeatProfiles(seats),[seats]);
    React.useEffect(()=>{try{localStorage.setItem('seatlink-seating-preferences-v2',JSON.stringify({preferences,required,floor}))}catch{}},[preferences,required,floor]);
    const startSeconds=parseTime(start),endSeconds=parseTime(end);
    const rangeError=validateRange(startSeconds,endSeconds,nowSeconds);
    const data=React.useMemo(()=>seats.map(seat=>{
      const availability=analyzeAvailability(getWindows(seat),startSeconds,endSeconds,!rangeError);
      const profile=profiles[seat.id]||{};
      const assessment=evaluateSeatProfile(profile,{now:state.now,date,start:startSeconds,end:endSeconds,startAt:Date.parse(date+'T00:00:00+08:00')/1000+startSeconds});
      const eligibilityError=availability.preferred?getEligibility(seat,...availability.preferred):'';
      return {...seat,...availability,profile,assessment,eligibilityError,...(eligibilityError?{status:'busy',label:'预约时段冲突'}:{})};
    }),[seats,state,date,start,end,rangeError,profiles]);
    const counts={free:0,partial:0,busy:0};
    data.forEach(s=>counts[s.status]++);
    const matches=seat=>(filter==='all'||seat.status===filter)&&seat.id.toLowerCase().includes(query.trim().toLowerCase());
    const visible=data.filter(matches);
    const recommendation=rankSeats(visible,preferences,{required,allowPartial:filter==='partial',floor});
    const topRecommendations=recommendation.results.slice(0,3);
    const togglePreference=id=>setPreferences(current=>current.includes(id)?current.filter(v=>v!==id):[...current,id]);
    const statuses=Object.fromEntries(data.map(s=>[s.id,{status:s.status,label:s.label,visible:matches(s)}]));
    const picked=data.find(s=>s.id===selected);
    React.useEffect(()=>{setRange(null)},[selected,date,start,end,state]);
    const bookingRange=range||picked?.preferred;
    const choose=seat=>{setSelected(seat.id);setRange(null)};
    const bookingAssessment=picked&&bookingRange?evaluateSeatProfile(picked.profile,{now:state.now,date,start:bookingRange[0],end:bookingRange[1],startAt:Date.parse(date+'T00:00:00+08:00')/1000+bookingRange[0]}):picked?.assessment;
    const requiredMisses=required&&picked?SEAT_PREFERENCES.filter(p=>preferences.includes(p.id)&&bookingAssessment.values[p.id]!==true):[];
    const floorMismatch=picked&&floor!=='any'&&String(picked.profile.floor)!==floor;
    const bookingError=(picked&&bookingRange?getEligibility(picked,...bookingRange):'')||(floorMismatch?'该座位不满足楼层限制。':requiredMisses.length?`该座位不满足或无法确认必须条件：${requiredMisses.map(p=>p.label).join('、')}。请更换座位或手动调整必须条件。`:'');
    const safeRange=bookingRange&&!bookingError&&picked?.windows.some(([a,b])=>a<=bookingRange[0]&&b>=bookingRange[1])&&bookingRange[1]-bookingRange[0]>=MIN_BOOKING;
    const coversGoal=bookingRange&&bookingRange[0]<=startSeconds&&bookingRange[1]>=endSeconds;
    const dateText=date.replaceAll('-','/');
    const timeField=(label,value,onChange)=>h('label',{className:'sl-field'},h('span',null,label),h('input',{type:'time',step:60,value:value.slice(0,5),min:'08:00',max:'22:30','aria-label':label,onChange:e=>onChange(e.target.value)}));
    const preferenceButton=p=>h('button',{key:p.id,type:'button',title:p.hint,'aria-pressed':preferences.includes(p.id),onClick:()=>togglePreference(p.id)},preferences.includes(p.id)&&h(Icon,{name:'check',size:15}),p.label);
    const eligibilityReason=data.find(s=>s.eligibilityError)?.eligibilityError;
    const noMatchTitle=rangeError?'请先调整时间':query&&!visible.length?'没有匹配该编号的座位':eligibilityReason&&recommendation.availableCount===0?'当前时段不符合预约条件':required&&preferences.length&&recommendation.availableCount>0?'没有全部满足偏好的座位':filter==='partial'?'没有可先坐一段的座位':'没有全程可约的座位';
    const noMatchDescription=rangeError||(query&&!visible.length?'可以清空编号，或试试其他座位。':eligibilityReason&&recommendation.availableCount===0?eligibilityReason:required&&preferences.length&&recommendation.availableCount>0?'可以手动取消“全部必须满足”，或调整偏好；系统不会自动改动你的条件。':'可以换一个时间，先坐部分时段，或尝试组合座位。');
    const preferenceReasons=seat=>h('div',{className:'sl-rec-reasons'},
      seat.matches.length>0&&h('p',{className:'matched'},h(Icon,{name:'check',size:15}),`符合：${seat.matches.map(p=>p.label).join('、')}`),
      seat.misses.length>0&&h('p',{className:'tradeoff'},`未满足：${seat.misses.map(p=>p.label).join('、')}`),
      seat.unknowns.length>0&&h('p',{className:'unknown'},`暂无可靠数据：${seat.unknowns.map(p=>p.label).join('、')}`),
      !preferences.length&&h('p',null,'可覆盖学习时段；选几个偏好，让推荐更适合你。'));
    return h('section',{className:'sl-workspace'},
      h('div',{className:'sl-page-heading'},h('div',null,h('p',{className:'sl-eyebrow'},'闵行主馆 / 二楼 · C200中区'),h('h1',null,'好座位，按你的偏好找'),h('p',{className:'sl-lede'},'先找一张能坐满的座位，再挑你喜欢的光线和环境。')),h('button',{className:'sl-demo-link',onClick:onDemo},'查看场景演示')),
      h('div',{className:'sl-search-bar'},
        h('label',{className:'sl-field sl-date-field'},h('span',null,'预约日期'),h('select',{'aria-label':'预约日期',value:date,onChange:e=>onDate(e.target.value)},dates.map(d=>h('option',{key:d,value:d},d.replaceAll('-','/'))))),
        timeField('开始时间',start,onStart),timeField('结束时间',end,onEnd),
        h('div',{className:'sl-search-summary'},h(Icon,{name:'clock',size:18}),h('span',null,rangeError?'请选择有效时段':`计划学习 ${duration(endSeconds-startSeconds)}`)),
        h('button',{className:'sl-primary',onClick:()=>{setView('recommend');setFilter('all');setQuery('');requestAnimationFrame(()=>resultsRef.current?.scrollIntoView({behavior:'smooth',block:'start'}))},disabled:!!rangeError},'推荐座位')),
      rangeError&&h('p',{role:'alert',className:'sl-validation'},rangeError),
      h('section',{className:'sl-preferences','aria-label':'座位推荐偏好'},
        h('div',{className:'sl-preferences-heading'},h('div',null,h('h2',null,'你更在意什么？'),h('span',null,'可多选，推荐会随偏好更新')),h('span',{className:'sl-demo-attributes'},'环境标签为演示数据')),
        h('div',{className:'sl-preference-chips'},h('button',{'aria-pressed':preferences.length===0,onClick:()=>{setPreferences([]);setRequired(false)}},'不限偏好'),SEAT_PREFERENCES.slice(0,5).map(preferenceButton)),
        h('div',{className:'sl-preset-row'},h('span',null,'快速选择'),REC_PRESETS.map(p=>h('button',{key:p.id,onClick:()=>{setPreferences([...p.preferences]);setRequired(false);setView('recommend')},'aria-pressed':p.preferences.length===preferences.length&&p.preferences.every(v=>preferences.includes(v))},p.label))),
        h('details',{className:'sl-more-preferences'},h('summary',null,'桌型、楼层和必须条件'),h('div',{className:'sl-preference-chips'},SEAT_PREFERENCES.slice(5).map(preferenceButton)),h('div',{className:'sl-advanced-preferences'},h('label',null,'楼层范围',h('select',{'aria-label':'楼层范围',value:floor,onChange:e=>setFloor(e.target.value)},h('option',{value:'any'},'当前区域不限楼层'),h('option',{value:'2'},'只看二楼'))),h('p',null,'目前仅有二楼C200中区数据，尚未接入其他楼层。'),h('label',{className:'sl-required-preferences'},h('input',{type:'checkbox',checked:required,'aria-label':'所选偏好全部必须满足',onChange:e=>setRequired(e.target.checked)}),'所选偏好全部必须满足'),h('p',null,'不勾选时尽量匹配；勾选后，缺少数据也不算满足，不会自动放宽条件。'))),
        preferences.includes('sparse')&&h('p',{className:'sl-nearby-caution'},data.some(s=>s.assessment.nearby.known)?'附近人数来自12:40模拟快照，仅在预约临近且数据未过期时参与排序。':'目标时段附近人数暂无可靠数据，本次不按人数加分，也不把“未知”当作无人。'),
        h('details',{className:'sl-data-disclosure'},h('summary',null,'推荐数据说明'),h('p',null,'插座、采光、安静区、桌型、通道和直吹标签，以及附近人数，均为合成演示数据，尚未现场核实。推荐不是现场占用承诺。'),h('p',null,'“自然光好”与“避开直晒”分别判断。人数快照不来自预约记录，不会用于预测远期人数；缺失、过期数据不作为匹配理由。'))),
      h('div',{className:'sl-results-heading','aria-live':'polite'},
        h('p',null,rangeError?'调整时间后即可查看座位':h(React.Fragment,null,h('strong',null,counts.free),' 个全程可约',h('span',{className:'sl-summary-divider'},'·'),h('strong',null,counts.partial),' 个部分可约',h('span',{className:'sl-query-note'},`${clock(startSeconds)}—${clock(endSeconds)}`))),
        h('span',{className:'sl-data-badge'},'合成演示数据')),
      h('div',{className:'sl-layout'},
        h('div',{className:'sl-browser',ref:resultsRef},
          h('div',{className:'sl-browser-heading'},h('div',null,h(Icon,{name:'pin',size:18}),h('h2',null,view==='recommend'?'为你推荐':'C200 中区'),h('span',null,`${seats.length}个座位`)),h('div',{className:'sl-view-switch',role:'group','aria-label':'座位展示方式'},[['recommend','seat','推荐'],['map','map','地图'],['list','list','时间列表']].map(([key,icon,label])=>h('button',{key,'aria-pressed':view===key,onClick:()=>setView(key)},h(Icon,{name:icon,size:16}),label)))),
          h('div',{className:'sl-filter-bar'},h('div',{className:'sl-status-filters',role:'group','aria-label':'按预约状态筛选'},[['all','全部',seats.length],['free','全程可约',counts.free],['partial','部分可约',counts.partial]].map(([key,label,count])=>h('button',{key,'aria-pressed':filter===key,onClick:()=>setFilter(key)},label,h('span',null,count)))),h('label',{className:'sl-seat-search'},h(Icon,{name:'search',size:17}),h('input',{'aria-label':'搜索座位编号',placeholder:'搜索座位编号',value:query,onChange:e=>setQuery(e.target.value)}))),
          view!=='recommend'&&h('div',{className:'sl-map-legend'},h('span',null,h('i',{className:'sl-swatch free'}),'全程可约'),h('span',null,h('i',{className:'sl-swatch partial'}),'部分可约'),h('span',null,h('i',{className:'sl-swatch busy'}),'所选时段不可约')),
          visible.length===0&&view!=='recommend'&&h('div',{className:'sl-no-matches',role:'status'},h('strong',null,rangeError?'请先调整学习时间':'当前条件下没有匹配座位'),h('p',null,query?'可以换个编号，或清空搜索。':counts.partial?'试试“部分可约”，或让系统组合不同时段。':'可以调整时间，或让系统寻找拼座方案。'),h('div',null,query&&h('button',{onClick:()=>setQuery('')},'清空搜索'),filter!=='all'&&h('button',{onClick:()=>setFilter('all')},'显示全部座位'))),
          view==='recommend'?h('div',{className:'sl-recommendations'},
            h('div',{className:'sl-rec-intro'},h('p',null,filter==='partial'?'你正在查看部分时段，以下座位不能坐满全部学习时间。':'优先坐满学习时段，再按偏好排序。'),h('span',null,`${recommendation.results.length}个符合条件 · 展示前3个`)),
            topRecommendations.map((seat,i)=>h('article',{key:seat.id,className:`sl-recommendation-card ${selected===seat.id?'selected':''}`,'data-recommended-seat':seat.id},
              h('div',{className:'sl-rec-card-top'},h('div',null,h('span',{className:'sl-rec-seat-icon'},h(Icon,{name:'seat',size:21})),h('h3',null,seat.id)),h('span',{className:`sl-status ${seat.status}`},seat.status==='free'?'全程可约':seat.label)),
              h('p',{className:'sl-rec-location'},`${seat.profile.building} · ${seat.profile.floor}楼 · ${seat.profile.zone}`,h('span',{className:'sl-rec-source'},'演示标签'),i===0&&h('span',null,preferences.length?'当前偏好优先':'优先看看')),
              h('div',{className:'sl-rec-tags'},profileLabels(seat.profile,seat.assessment).slice(0,4).map(label=>h('span',{key:label},label))),
              preferenceReasons(seat),
              h('div',{className:'sl-rec-card-bottom'},h('div',null,h('strong',null,`${clock(seat.preferred[0])}—${clock(seat.preferred[1])}`),h('span',null,`${duration(seat.preferred[1]-seat.preferred[0])} · ${seat.status==='free'?'无需换座':'其余时段未安排'}`)),h('div',null,h('button',{className:'sl-rec-map-button',onClick:()=>{choose(seat);setView('map')}},'地图定位'),h('button',{className:'sl-primary',onClick:()=>choose(seat),'aria-label':`选择推荐座位 ${seat.id}`},selected===seat.id?'已选择':'选这个座位'))))),
            !topRecommendations.length&&h('div',{className:'sl-rec-empty',role:'status'},h(Icon,{name:'search',size:28}),h('h3',null,noMatchTitle),h('p',null,noMatchDescription),
              h('div',null,query&&h('button',{onClick:()=>setQuery('')},'清空搜索'),required&&preferences.length>0&&h('button',{onClick:()=>setRequired(false)},'改为尽量满足'),counts.partial>0&&filter!=='partial'&&h('button',{onClick:()=>setFilter('partial')},'看看可先坐的座位'),h('button',{onClick:onPlanner,disabled:!!rangeError},'尝试拼座'))),
            h('div',{className:'sl-stitch-fallback'},h('div',null,h('strong',null,'没有一张座位能坐满？'),h('p',null,'再看看分时换座方案，是否换座由你决定。')),h('button',{onClick:onPlanner,disabled:!!rangeError},'尝试拼座'))):
          view==='map'?h('div',{className:'sl-map-wrap'},h('div',{className:'sl-map-scroll'},h('div',{style:{width:`${zoom*100}%`}},renderMap(picked,seat=>{if(statuses[seat.id]?.visible)choose(seat)},query,statuses))),h('div',{className:'sl-map-footer'},h('span',null,'点座位，直接看可约时间'),h('div',{className:'sl-zoom-controls'},h('button',{'aria-label':'缩小座位图',disabled:zoom===1,onClick:()=>setZoom(Math.max(1,zoom-.5))},'−'),h('span',null,`${Math.round(zoom*100)}%`),h('button',{'aria-label':'放大座位图',disabled:zoom===2.5,onClick:()=>setZoom(Math.min(2.5,zoom+.5))},'＋')))):
          h('div',{className:'sl-seat-list'},visible.map(seat=>h('button',{key:seat.id,className:`sl-seat-row ${picked?.id===seat.id?'selected':''}`,'aria-pressed':picked?.id===seat.id,onClick:()=>choose(seat)},h('div',{className:'sl-row-top'},h('strong',null,seat.id),h('span',{className:`sl-status ${seat.status}`},seat.label)),h(Timeline,{windows:seat.windows,start:startSeconds,end:endSeconds}),h('span',{className:'sl-row-windows'},seat.overlaps.length?seat.overlaps.map(([a,b])=>`${clock(a)}—${clock(b)}`).join(' / '):'目标时段内无空闲')))),
          h('p',{className:'sl-map-note'},'颜色按所选预约时段计算，表示预约可用性。现场是否有人尚未接入。')),
        h('aside',{className:`sl-seat-details ${picked?'has-selection':''}`,'aria-label':'座位时间详情','aria-live':'polite'},
          picked?h(React.Fragment,null,
            h('div',{className:'sl-detail-top'},h('span',{className:'sl-detail-icon'},h(Icon,{name:'seat',size:24})),h('div',null,h('p',null,'已选座位'),h('h2',null,picked.id)),h('button',{className:'sl-close-detail','aria-label':'取消选择座位',onClick:()=>setSelected(null)},h(Icon,{name:'close',size:18}))),
            h('p',{className:'sl-detail-location'},'主馆二楼 · C200中区',!picked.verified&&h('span',null,'模拟编号')),
            h('div',{className:`sl-availability-callout ${picked.status}`},h(Icon,{name:picked.status==='free'?'check':'clock',size:20}),h('div',null,h('strong',null,picked.label),h('p',null,picked.status==='free'?`可以覆盖${clock(startSeconds)}—${clock(endSeconds)}全部学习时间`:picked.preferred?`这段可以先坐${duration(picked.preferred[1]-picked.preferred[0])}`:'可查看其他时间，或选择另一张座位。'))),
            h('div',{className:'sl-detail-section'},h('h3',null,'当天预约时间'),h(Timeline,{windows:picked.windows,start:startSeconds,end:endSeconds,range:bookingRange}),h('div',{className:'sl-small-legend'},h('span',null,h('i',{className:'sl-swatch free'}),'空闲'),h('span',null,h('i',{className:'sl-swatch busy'}),'不可约'),h('span',null,h('i',{className:'sl-swatch target'}),'学习目标'))),
            h('details',{className:'sl-seat-attributes'},h('summary',null,'座位环境与附近情况 · 演示标签'),h('dl',null,
              [['插座',picked.profile.power===true?'有插座':picked.profile.power===false?'无插座':'未知'],['采光',picked.profile.daylight===true?'自然光好':picked.profile.daylight===false?'普通采光标签':'未知'],['直晒',bookingAssessment.values.shade===true?'所选时段无直晒标签':bookingAssessment.values.shade===false?'所选时段有直晒标签':'目标日期无可靠数据'],['安静区',picked.profile.quietZone===true?'安静区标签':picked.profile.quietZone===false?'普通区域标签':'未知'],['桌型',picked.profile.partition===true?'有桌面隔板':picked.profile.partition===false?'开放桌面':'未知'],['通道',picked.profile.nearAisle===false?'远离通道':picked.profile.nearAisle===true?'临近通道':'未知'],['空调',picked.profile.directAir===false?'无直吹标签':picked.profile.directAir===true?'有直吹标签':'未知'],['附近人数',bookingAssessment.nearby.known?`${bookingAssessment.nearby.occupied}/${bookingAssessment.nearby.total}个邻座有人 · 12:40快照`:bookingAssessment.nearby.reason]].map(([label,value])=>h(React.Fragment,{key:label},h('dt',null,label),h('dd',null,value))))),
            h('div',{className:'sl-detail-section'},h('h3',null,'可预约时段'),h('p',{className:'sl-section-hint'},'优先显示学习目标内的时段，确认后才会预约。'),h('div',{className:'sl-slots'},picked.windows.length?picked.windows.map(([a,b])=>{const clipped=[Math.max(a,startSeconds),Math.min(b,endSeconds)];const inGoal=clipped[1]-clipped[0]>=MIN_BOOKING;const slot=inGoal?clipped:[a,b];const active=bookingRange&&slot[0]===bookingRange[0]&&slot[1]===bookingRange[1];return h('button',{key:a,disabled:!!rangeError||b-a<MIN_BOOKING,'aria-pressed':!!active,onClick:()=>setRange(slot)},h('span',null,`${clock(slot[0])}—${clock(slot[1])}`),h('small',null,b-a<MIN_BOOKING?'不足1小时':inGoal?duration(slot[1]-slot[0]):'其他时间'),active&&h(Icon,{name:'check',size:16}))}):h('p',{className:'sl-section-hint'},'今天暂无可预约时段。'))),
            bookingRange&&!rangeError&&h('div',{className:'sl-booking-summary'},h('span',null,'本次预约'),h('strong',null,`${clock(bookingRange[0])}—${clock(bookingRange[1])}`),h('small',null,`${dateText} · ${duration(bookingRange[1]-bookingRange[0])}`),!coversGoal&&h('p',null,`仅预约以上时段，未覆盖全部学习目标。其余时间可以继续找座。`)),
            bookingError&&h('p',{className:'sl-booking-conflict',role:'alert'},bookingError),
            h('details',{className:'sl-booking-notes'},h('summary',null,'申请说明（选填）'),h('textarea',{'aria-label':'申请说明',maxLength:50,value:notes,onChange:e=>setNotes(e.target.value.slice(0,50)),placeholder:'如需备注，可填写，不超过50字'}),h('small',null,`${notes.length}/50`)),
            h('button',{className:'sl-primary sl-book-seat',disabled:!safeRange||!!rangeError,onClick:()=>onBook(picked,clock(bookingRange[0]),clock(bookingRange[1]),notes)},safeRange&&!rangeError?`确认预约 ${clock(bookingRange[0])}—${clock(bookingRange[1])}`:'当前时段无法预约'),
            h('p',{className:'sl-confirm-note'},'提交时会再次校验空闲时段和预约资格。'),
            picked.status!=='free'&&h('button',{className:'sl-stitch-action',disabled:!!rangeError,onClick:onPlanner},'帮我找接续的座位')):
          h('div',{className:'sl-detail-empty'},h('span',{className:'sl-empty-icon'},h(Icon,{name:'seat',size:36})),h('h2',null,'选一张推荐座位，直接看详情'),h('p',null,'先比较推荐理由，再决定预约。也可以切换地图和时间列表自行选择。'),h('div',{className:'sl-quick-picks'},h('h3',null,'符合当前偏好的座位'),topRecommendations.map(seat=>h('button',{key:seat.id,onClick:()=>choose(seat)},h('span',null,seat.id),h('small',null,`${clock(seat.preferred[0])}—${clock(seat.preferred[1])}`),h(Icon,{name:'check',size:16}))),!topRecommendations.length&&h('p',null,'可以调整时间或偏好，系统不会自动放宽必须条件。'))),
          h('div',{className:'sl-detail-rule'},'每次至少1小时 · 当天22:30闭馆',h('span',null,'请在预约开始后30分钟内入馆签到。')))),
      h('footer',{className:'sl-footer-note'},h('span',null,'演示环境 · 预约仅保存在本浏览器，不连接学校系统。'),h('span',null,'025、051位置已核对，其余SIM编号待核对。')));
  };
}
