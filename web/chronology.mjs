export const calendarNames={han:'汉魏晋历',shu:'蜀汉历',wu:'孙吴历'};
export function julianDay(year,month=1,day=1){
  const a=Math.floor((14-month)/12),y=year+4800-a,m=month+12*a-3;
  return day+Math.floor((153*m+2)/5)+365*y+Math.floor(y/4)-32083;
}
export function julianDate(jdn){
  const c=jdn+32082,d=Math.floor((4*c+3)/1461),e=c-Math.floor(1461*d/4),m=Math.floor((5*e+2)/153);
  return {year:d-4800+Math.floor(m/10),month:m+3-12*Math.floor(m/10),day:e-Math.floor((153*m+2)/5)+1};
}
export function julianLabel(jdn){const d=julianDate(jdn);return `${d.year}年${d.month}月${d.day}日`;}
export function yearMonths(data,year,calendar='han'){return data.calendar.calendars[calendar].filter(m=>m.year===year);}
export function timelineStarts(data,cursor){
  const months=data.calendar.calendars[cursor.calendar].filter(m=>m.year>=184&&m.year<=280);
  if(cursor.granularity==='year')return months.filter((m,i)=>!i||m.year!==months[i-1].year).map(m=>m.start);
  if(cursor.granularity==='month')return months.map(m=>m.start);
  // Keep seven-day stepping aligned with a manually selected starting day.
  // At the calendar limit the first step may be shorter than seven days.
  const offset=(timeWindow(data,cursor).start-months[0].start)%7,starts=[];
  if(offset)starts.push(months[0].start);
  for(let day=months[0].start+offset;day<=months.at(-1).end;day+=7)starts.push(day);
  return starts;
}
export function monthName(month){
  const names=['正','二','三','四','五','六','七','八','九','十','十一','十二'];
  return `${month.note.startsWith('景初三年后')?'后':month.month<0?'闰':''}${names[Math.abs(month.month)-1]}月`;
}
export function timeWindow(data,cursor){
  if(cursor.world!=='history')return null;
  const months=yearMonths(data,cursor.position,cursor.calendar||'han');
  if(!cursor.granularity||cursor.granularity==='year')return {start:months[0].start,end:months.at(-1).end};
  const month=months.find(m=>m.start===cursor.monthStart);
  const start=month.start+(cursor.day||1)-1;
  const last=data.calendar.calendars[cursor.calendar||'han'].findLast(m=>m.year<=280);
  return cursor.granularity==='month'?{start:month.start,end:month.end}:{start,end:Math.min(start+6,last.end)};
}
export function windowLabel(data,cursor){
  if(!cursor.granularity||cursor.granularity==='year')return `${cursor.position}年`;
  const month=yearMonths(data,cursor.position,cursor.calendar||'han').find(m=>m.start===cursor.monthStart);
  const window=timeWindow(data,cursor);
  return `${cursor.position}年 · ${monthName(month)}${cursor.granularity==='week'?` · ${cursor.day}日起${window.end-window.start+1}日`:''}`;
}
export function eventWindow(event){
  return event.time;
}
export function overlaps(a,b){return a.start<=b.end&&a.end>=b.start;}
export function activityStatus(record,data,cursor){
  if(record.world!==cursor.world)return 'hidden';
  if(cursor.world==='romance')return record.position>cursor.position?'hidden':Math.floor(cursor.position/1000)*1000<record.until?'recorded':'earlier';
  if(!record.time)return 'undated';
  const window=timeWindow(data,cursor);
  if(!overlaps(record.time,window))return record.time.end<window.start?'earlier':'hidden';
  return record.time.start>=window.start&&record.time.end<=window.end?'recorded':'uncertain';
}
