// Entirely synthetic attributes. Replace this module with verified, seat-level records for real use.
// A reservation is deliberately NOT used as evidence that someone is physically sitting there.
const OCCUPANCY_TIME=Date.parse('2026-11-19T12:40:00+08:00')/1000;
export function demoSeatProfiles(seats) {
  const simulatedPresence=Object.fromEntries(seats.map((seat,i)=>[seat.id,(i+1)%19===0?null:(i+1)%4===1||(i+1)%7===3]));
  return Object.fromEntries(seats.map((seat,i)=>{
    const n=i+1;
    const missing=n%17===0;
    const neighbors=seats.filter(s=>s.id!==seat.id).map(s=>({seat:s,d:(s.x-seat.x)**2+(s.y-seat.y)**2})).sort((a,b)=>a.d-b.d).slice(0,6).map(s=>s.seat.id);
    const nearby={date:'2026-11-19',observedAt:OCCUPANCY_TIME,source:'demo',
      occupied:neighbors.filter(id=>simulatedPresence[id]===true).length,total:neighbors.length,
      unknown:neighbors.filter(id=>simulatedPresence[id]===null).length};
    return [seat.id,{seatId:seat.id,building:'闵行主馆',floor:2,zone:'C200中区',source:'demo',
      power:missing?null:n%3!==0,daylight:missing?null:n%4<=1,quietZone:missing?null:n%4<2,
      partition:missing?null:n%3===1,nearAisle:missing?null:n%4===2,directAir:missing?null:n%6===0,
      sunReferenceDate:'2026-11-19',directSunWindows:missing?null:n%3===0?[[12*3600,15*3600]]:n%4===0?[[14*3600,17*3600]]:[],nearby}];
  }));
}
