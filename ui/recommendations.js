export const SEAT_PREFERENCES = [
  {id:'power',label:'有插座',hint:'电脑、平板方便充电'},
  {id:'daylight',label:'自然光好',hint:'采光充足，不等于阳光直晒'},
  {id:'shade',label:'避开直晒',hint:'按学习时段判断直晒风险'},
  {id:'quiet',label:'安静些',hint:'参考安静区、通道等环境标签'},
  {id:'sparse',label:'附近少人',hint:'仅参考有效的当前人数快照，不能预测未来'},
  {id:'partition',label:'有桌面隔板',hint:'更独立的学习空间'},
  {id:'lowTraffic',label:'远离通道',hint:'减少身后走动'},
  {id:'noDraft',label:'避开空调直吹',hint:'参考座位与空调出风口位置'},
];
export const REC_PRESETS = [
  {id:'laptop',label:'电脑学习',preferences:['power','quiet','noDraft']},
  {id:'reading',label:'安静阅读',preferences:['daylight','shade','quiet']},
  {id:'space',label:'少些打扰',preferences:['sparse','lowTraffic']},
];

// A future-time booking must never turn a current occupancy snapshot into a prediction.
export function inspectNearby(snapshot,{now,startAt,date,maxAge=600,maxLead=900}) {
  if(!Number.isFinite(now)||!Number.isFinite(startAt)) return {known:false,reason:'请先选择有效的学习时间'};
  if(!snapshot || !Number.isFinite(snapshot.observedAt) || snapshot.date!==date) return {known:false,reason:'附近人数暂无有效数据'};
  if(snapshot.observedAt>now || now-snapshot.observedAt>maxAge) return {known:false,reason:'附近人数快照已过期'};
  if(startAt<now || startAt-now>maxLead) return {known:false,reason:'目标时段附近人数未知，当前快照不作未来预测'};
  if(!Number.isInteger(snapshot.occupied) || !Number.isInteger(snapshot.total) || snapshot.total<=0 || snapshot.occupied<0 || snapshot.occupied>snapshot.total || !Number.isInteger(snapshot.unknown)||snapshot.unknown!==0) return {known:false,reason:'附近人数记录不完整'};
  return {known:true,occupied:snapshot.occupied,total:snapshot.total,observedAt:snapshot.observedAt,ratio:snapshot.occupied/snapshot.total,source:snapshot.source};
}

export function evaluateSeatProfile(profile={},context) {
  const values={power:profile.power,daylight:profile.daylight,quiet:profile.quietZone,
    partition:profile.partition,lowTraffic:profile.nearAisle==null?null:!profile.nearAisle,
    noDraft:profile.directAir==null?null:!profile.directAir};
  const sunKnown=Number.isFinite(context.start)&&Number.isFinite(context.end)&&context.end>context.start&&Array.isArray(profile.directSunWindows) && profile.sunReferenceDate===context.date;
  values.shade=sunKnown?!profile.directSunWindows.some(([a,b])=>a<context.end && b>context.start):null;
  const nearby=inspectNearby(profile.nearby,context);
  values.sparse=nearby.known?nearby.ratio<=1/3:null;
  return {values,nearby,sunKnown,profile};
}

export function rankSeats(seats,preferences,{required=false,allowPartial=false,floor='any'}={}) {
  const selected=SEAT_PREFERENCES.filter(p=>preferences.includes(p.id));
  const available=seats.filter(seat=>seat.preferred&&!seat.eligibilityError&&(seat.status==='free'||allowPartial&&seat.status==='partial')&&(floor==='any'||String(seat.profile?.floor)===String(floor)));
  const evaluated=available.map(seat=>{
    const matches=selected.filter(p=>seat.assessment.values[p.id]===true);
    const misses=selected.filter(p=>seat.assessment.values[p.id]===false);
    const unknowns=selected.filter(p=>seat.assessment.values[p.id]!==true&&seat.assessment.values[p.id]!==false);
    return {...seat,matches,misses,unknowns};
  });
  const results=evaluated.filter(s=>!required||(!s.misses.length&&!s.unknowns.length)).sort((a,b)=>
    Number(b.status==='free')-Number(a.status==='free') || b.matches.length-a.matches.length || a.unknowns.length-b.unknowns.length || a.id.localeCompare(b.id,undefined,{numeric:true}));
  return {results,availableCount:available.length,excludedCount:evaluated.length-results.length,selected};
}

export function profileLabels(profile,assessment) {
  const labels=[];
  if(profile.power===true)labels.push('有插座');
  if(profile.daylight===true)labels.push('自然光');
  if(profile.quietZone===true)labels.push('安静区');
  if(profile.partition===true)labels.push('桌面隔板');
  if(profile.nearAisle===false)labels.push('远离通道');
  if(profile.directAir===false)labels.push('无直吹标签');
  return labels;
}
