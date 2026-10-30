const KEY='attendance-v1';
const D={version:1,config:{defaultTarget:75,odCountsAsPresent:true,semesterStartDate:'',semesterEndDate:'',theme:'aurora'},subjects:[],timetable:[],records:[],holidays:[],assignments:[],lastBackupAt:null};
let S=load();
function load(){try{const x=JSON.parse(localStorage.getItem(KEY));if(x&&x.version===1)return{...structuredClone(D),...x,config:{...D.config,...x.config}}}catch(e){}return structuredClone(D)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){alert('Storage is blocked or full. Please export a backup now.')}}

// ---------- helpers ----------
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const ds=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; // local date, never toISOString
const pd=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const dow=d=>d.getDay()||7; // Mon=1..Sun=7
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,9);
const fmt=s=>pd(s).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
const fm=t=>{const[h,m]=t.split(':').map(Number);return`${h%12||12}:${pad(m)} ${h<12?'AM':'PM'}`};
function range(a,b){let x=pd(a),y=pd(b);if(x>y)[x,y]=[y,x];const o=[];while(x<=y){o.push(ds(x));x.setDate(x.getDate()+1)}return o}
const subj=id=>S.subjects.find(s=>s.id===id);
const isHol=d=>S.holidays.some(h=>h.date===d);
const inSem=d=>{const{semesterStartDate:a,semesterEndDate:b}=S.config;return(!a||d>=a)&&(!b||d<=b)};
const rid=(s,d,t)=>`${s}_${d}_${t}`;
const byT=(a,b)=>a.startTime.localeCompare(b.startTime);
const PAL=['#ec4899','#ef4444','#eab308','#22c55e','#06b6d4','#8b5cf6','#f97316'];
const col=sb=>PAL[Math.max(0,S.subjects.findIndex(s=>s.id===sb.id))%PAL.length];

// ---------- themes ----------
const THEMES=[['aurora','Aurora','#a78bfa','#f9a8d4','#14111f'],['midnight','Midnight','#60a5fa','#22d3ee','#0b1220'],['sunset','Sunset','#fb923c','#f472b6','#1c0f1b'],['forest','Forest','#34d399','#a3e635','#0c1a15'],['cotton','Cotton Candy','#f9a8d4','#c4b5fd','#fff1f7'],['sky','Sky','#7dd3fc','#86efac','#eef7ff']];
function applyTheme(){const t=THEMES.find(x=>x[0]===S.config.theme)||THEMES[0];document.documentElement.dataset.theme=t[0];$('#tc').content=t[4]}

// ---------- engine ----------
function stats(sb){
  const hs=new Set(S.holidays.map(h=>h.date));
  let a=sb.initialBalance.attended,h=sb.initialBalance.held;
  for(const r of S.records){
    if(r.subjectId!==sb.id||hs.has(r.date))continue;
    if(r.status==='PRESENT'){a++;h++}
    else if(r.status==='ABSENT')h++;
    else if(r.status==='OD'&&S.config.odCountsAsPresent){a++;h++}
  }
  const t=Math.min(100,Math.max(1,Math.round(sb.targetPercent)));
  const safe=h===0||a*100>=t*h;let sf=0,rc=0;
  if(h>0){if(safe)sf=Math.max(0,Math.floor((a*100-t*h)/t));else rc=t>=100?null:Math.ceil((t*h-a*100)/(100-t))}
  const p=h?a/h*100:100;
  return{a,h,t,safe,sf,rc,p:(Math.floor(p*10)/10).toFixed(1),i:Math.floor(p)};
}
// classes still to come: today's unmarked + every future timetable class until semester end (holidays removed)
function remaining(sb){
  const end=S.config.semesterEndDate;if(!end)return null;
  const slots=S.timetable.filter(t=>t.subjectId===sb.id);if(!slots.length)return -1;
  const today=ds(new Date()),hs=new Set(S.holidays.map(h=>h.date)),cnt=Array(8).fill(0);
  slots.forEach(t=>cnt[t.dayOfWeek]++);
  let from=today;if(S.config.semesterStartDate>from)from=S.config.semesterStartDate;
  let n=0,i=0;
  for(const x=pd(from),e=pd(end);x<=e&&i++<800;x.setDate(x.getDate()+1)){
    const d=ds(x);if(hs.has(d))continue;
    n+=d===today?slots.filter(t=>t.dayOfWeek===dow(x)&&!S.records.some(r=>r.id===rid(sb.id,d,t.id))).length:cnt[dow(x)];
  }
  return n;
}
function proj(sb,s){
  const R=remaining(sb);if(R===null)return null;if(R===-1)return{none:true};
  if(s.h+R===0)return{R:0};
  const m=Math.floor((100*(s.a+R)-s.t*(s.h+R))/100);
  return{R,skip:Math.min(R,Math.max(0,m)),reach:m>=0,best:(Math.floor((s.a+R)/(s.h+R)*1000)/10).toFixed(1)};
}
function setSlot(sid,slot,d,st){
  const id=rid(sid,d,slot);S.records=S.records.filter(r=>r.id!==id);
  if(st)S.records.push({id,subjectId:sid,date:d,slotId:slot,status:st,isExtraClass:false,timestamp:Date.now()});
}
function items(d,f){
  const out=[];
  S.timetable.filter(t=>t.dayOfWeek===dow(pd(d))&&(!f||t.subjectId===f)).sort(byT).forEach(t=>{
    const sb=subj(t.subjectId);if(sb)out.push({sb,t,r:S.records.find(r=>r.id===rid(t.subjectId,d,t.id))})});
  S.records.filter(r=>r.date===d&&r.isExtraClass&&(!f||r.subjectId===f)).forEach(r=>{
    const sb=subj(r.subjectId);if(sb)out.push({sb,r,x:1})});
  return out;
}
function pending(){ // past classes (last 14 days) that were never marked
  const out=[];
  for(let i=1;i<=14;i++){const x=new Date();x.setDate(x.getDate()-i);const d=ds(x);
    if(isHol(d)||!inSem(d))continue;
    const n=items(d,'').filter(z=>!z.r&&!z.x).length;if(n)out.push([d,n])}
  return out;
}

// ---------- help texts (plain English) ----------
const HELP={
  percent:['How is my percentage calculated?','<p><b>Attendance % = classes attended ÷ classes held × 100.</b></p><p>A class counts as "held" only if it really took place. Cancelled classes and holidays are ignored completely.</p><p><b>Skip-safe right now</b> = how many classes in a row you could miss starting today and still stay at or above your required %.</p><p><b>Classes left this semester</b> = the classes in your Timetable from today until your semester end date (holidays removed). We use it to show how many of them you can still miss in total. For this you need a Timetable and a Semester end date (Settings).</p>'],
  opening:['Opening balance','<p>Use this only if you already attended some classes <b>before</b> installing this app.</p><p><b>Example:</b> your college has held 20 classes so far and you attended 16. Enter <b>16</b> attended and <b>20</b> held. The app then continues from there.</p><p>Starting from day one? Leave both as <b>0</b>.</p>'],
  target:['Required attendance','<p>The minimum percentage your college asks for, usually 75%. The app warns you and calculates how many classes you can skip against this number.</p>'],
  od:['On Duty (OD)','<p>OD is when you miss a class for an official reason such as a college event, sports or a medical leave.</p><p><b>ON:</b> OD counts as present (it raises your attendance).</p><p><b>OFF:</b> OD is ignored, as if the class never happened (it neither helps nor hurts).</p><p>Pick the rule your college follows.</p>'],
  sem:['Semester dates','<p>Start and end date of your semester. The end date lets the app count how many classes are still left, so it can tell you how many you can safely miss before the semester ends. Classes outside these dates are hidden from Daily Log.</p>'],
  adj:['Attended / Missed buttons','<p>A quick manual fix for the numbers.</p><p><b>Attended +</b> adds one class that you attended. <b>Missed +</b> adds one class that you missed. The − buttons undo them.</p><p>These change your opening balance. To fix a class you already marked in Daily Log, open the subject calendar or Daily Log instead.</p>'],
  status:['What do the marks mean?','<p><b>Attended:</b> you were there.</p><p><b>Not Attended:</b> you missed it. Counts against you.</p><p><b>Cancelled:</b> the class did not happen (teacher absent, etc.). Not counted at all.</p><p><b>On Duty:</b> official duty. Counted as present or ignored, depending on the OD setting in Settings.</p><p><b>Clear:</b> removes the mark, as if you never marked it.</p>'],
  whatif:['What-if simulator','<p>Shows what your percentage would become if you skip the next few classes. Nothing is saved. It is only a preview.</p>'],
};
const info=k=>`<button class=info data-a=help data-h="${k}" aria-label="What is this?">i</button>`;

// ---------- ui state ----------
const ST=[['PRESENT','P','Attended','You were there. Counts as attended.'],['ABSENT','A','Not Attended','You missed it. Counts against you.'],['CANCELLED','C','Cancelled','Class did not happen. Not counted at all.'],['OD','OD','On Duty','Official duty. Counted as present or ignored (see Settings).']];
const COL={PRESENT:'#22c55e',ABSENT:'#ef4444',CANCELLED:'#d97706',OD:'#3b82f6'};
const DN=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
let tab='sub',SEL=null,SELD=null,CAL=new Date(),LD=ds(new Date()),OPEN=new Set([dow(new Date())]),sheet=null,WI=0,ANIM=true;

function ring(p,sz,cls,txt){
  const r=sz/2-5,C=2*Math.PI*r,m=sz/2;
  return`<svg width="${sz}" height="${sz}" style="flex:none" role="img" aria-label="${txt}"><circle class=trk cx="${m}" cy="${m}" r="${r}" stroke-width="5" fill="none"/><circle class="rg ${cls}" cx="${m}" cy="${m}" r="${r}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${C*Math.min(100,p)/100} ${C}" transform="rotate(-90 ${m} ${m})"/><text class=rt x="50%" y="50%" text-anchor="middle" dy=".35em" font-weight="700" font-size="${sz/4.4}">${txt}</text></svg>`;
}
const rc=s=>s.safe?'':'bad';
function msg(s){
  if(s.h===0)return`<div class="msg mu">No classes counted yet.</div>`;
  if(!s.safe)return`<div class="msg bad">${s.rc===null?'Target can no longer be reached.':`Attend the next ${s.rc} class${s.rc>1?'es':''} in a row to reach ${s.t}%.`}</div>`;
  return s.sf>0?`<div class="msg ok">Skip-safe right now: ${s.sf} class${s.sf>1?'es':''}</div>`:`<div class="msg bl">At the limit. Don't skip.</div>`;
}
function projLine(p,s){
  if(!p)return`<div class="mu pl">Set your semester end date in Settings to see how many classes are left.</div>`;
  if(p.none)return`<div class="mu pl">Add this subject to your Timetable to see how many classes are left.</div>`;
  if(p.R===0)return`<div class="mu pl">No classes left in your timetable before the semester ends.</div>`;
  if(!p.reach)return`<div class="pl bad">${p.R} classes left. Even if you attend all of them you will reach only ${p.best}%.</div>`;
  return`<div class=pl>${p.R} classes left this semester. You can miss up to <b class=ok>${p.skip}</b> of them and still finish at ${s.t}% or more.</div>`;
}

// ---------- views ----------
function vSub(){
  if(SEL)return vCal();
  let A=0,H=0;S.subjects.forEach(s=>{const x=stats(s);A+=x.a;H+=x.h});
  const op=H?Math.floor(A/H*100):100;
  let h=`<h1><span>My Subjects</span>${S.subjects.length?ring(op,56,op>=S.config.defaultTarget?'':'bad',op+'%'):''}</h1>`;
  if(!S.subjects.length)h+=`<div class="glass pad">Welcome! Tap the <b>+</b> button to add your first subject. Then build your weekly schedule in the <b>Timetable</b> tab, or import it with AI.</div>`;
  for(const sb of S.subjects){
    const s=stats(sb),p=proj(sb,s);
    h+=`<div class="glass sc" data-a=open data-id="${sb.id}"><div class=scl><b>${esc(sb.name)}</b><div class=cnt style="margin-top:10px"><b>${s.a}</b>Attended</div><div class=cnt><b>${s.h-s.a}</b>Missed</div><div class=cnt><b>${s.h}</b>Total classes held</div>${msg(s)}${projLine(p,s)}<div class=mu style="margin-top:6px">Required: ${s.t}% ${info('percent')}</div></div>${ring(s.i,124,rc(s),s.i+'%')}</div>
    <div class=adj><div>Attended ${info('adj')}<br><button class=m data-a=adj data-id="${sb.id}" data-k=a data-n=-1 aria-label="Remove one attended">−</button><button class=p data-a=adj data-id="${sb.id}" data-k=a data-n=1 aria-label="Add one attended">+</button></div><div>Missed<br><button class=m data-a=adj data-id="${sb.id}" data-k=m data-n=-1 aria-label="Remove one missed">−</button><button class=p data-a=adj data-id="${sb.id}" data-k=m data-n=1 aria-label="Add one missed">+</button></div></div>`;
  }
  return h;
}

function logCard(it,d){
  const{sb,t,r,x}=it,s=stats(sb);
  return`<div class="glass lg"><div class=ttb><h3>${esc(sb.name)}</h3><div class=mu>${x?'Extra class':fm(t.startTime)+' – '+fm(t.endTime)}</div>${t&&t.room?`<div class=mu>Room: ${esc(t.room)}</div>`:''}<div class="pc ${s.safe?'ok':'bad'}">Attendance: ${s.i}%</div></div>
  <button class=circ style="background:${r?COL[r.status]:'var(--acc1)'}" data-a=menu data-d="${d}" ${x?`data-id="${r.id}"`:`data-sid="${sb.id}" data-slot="${t.id}"`} aria-label="Mark this class">${r?ST.find(z=>z[0]===r.status)[1]:'Mark'}</button></div>`;
}
function dayPanel(d,f){
  if(isHol(d))return`<div class="glass pad" style="margin:12px 0">🏖 Holiday: ${esc(S.holidays.find(h=>h.date===d).reason)}<br><button style="margin-top:10px" data-a=hol data-d="${d}">Unmark holiday</button></div>`;
  if(!inSem(d))return`<div class="glass mu pad" style="margin:12px 0">This date is outside your semester dates.</div>`;
  const it=items(d,f);
  return(it.map(i=>logCard(i,d)).join('')||`<div class="glass mu pad" style="margin:12px 0">No classes scheduled for this day.</div>`)
  +`<div class=row><button data-a=xtra data-d="${d}" data-sid="${f||''}">+ Extra class</button><button data-a=hol data-d="${d}">🏖 Mark as holiday</button></div>`;
}
function vLog(){
  const d=LD,hol=isHol(d),it=hol?[]:items(d,''),pn=pending().filter(x=>x[0]!==d);
  let h=`<h1>Daily Log ${info('status')}</h1><div class=row><div class="glass row" style="flex:1;padding:6px"><button class=rd data-a=ld data-n=-1 aria-label="Previous day">‹</button><b>${fmt(d)}</b><button class=rd data-a=ld data-n=1 aria-label="Next day">›</button></div></div>`;
  if(d!==ds(new Date()))h+=`<div class=row style="margin-top:8px"><button data-a=ltoday>Back to today</button></div>`;
  if(S.subjects.length&&pn.length)h+=`<div class="glass banner"><span>⏰ ${pn.reduce((a,x)=>a+x[1],0)} past classes were never marked.</span><button data-a=ldgo data-d="${pn[0][0]}">Review</button></div>`;
  if(!hol&&it.length)h+=`<div class=row style="margin:12px 4px"><div class=mu>Total classes: ${it.length}<br>Marked: ${it.filter(i=>i.r).length}</div><button data-a=allp>✓ Mark all present</button></div>`;
  return h+dayPanel(d,'');
}

function vTT(){
  let h=`<h1>Timetable</h1><div class=row style="margin-bottom:8px"><button class=aib data-a=sheet data-k=ai>✨ Import with AI</button></div>`;
  for(let w=1;w<=7;w++){
    const sl=S.timetable.filter(t=>t.dayOfWeek===w&&subj(t.subjectId)).sort(byT);if(!sl.length)continue;
    const o=OPEN.has(w);
    h+=`<div class="glass dh" data-a=tog data-w="${w}"><span><b>${DN[w]}</b> <span class=mu>(${sl.length} ${sl.length>1?'classes':'class'})</span></span><span>${o?'⌄':'›'}</span></div>`;
    if(o)h+=sl.map(t=>{const sb=subj(t.subjectId),s=stats(sb);
      return`<div class="glass tt tap" style="--c:${col(sb)}" data-a=editslot data-id="${t.id}"><i></i><div class=ttb><h3>${esc(sb.name)}</h3><div class=mu>${fm(t.startTime)} – ${fm(t.endTime)}</div><div class=mu>${t.room?'Room: '+esc(t.room):'No room set'}</div></div>${ring(s.i,68,rc(s),s.i+'%')}<button class=x data-a=delslot data-id="${t.id}" aria-label="Delete class">✕</button></div>`}).join('');
  }
  if(!S.timetable.length)h+=`<div class="glass pad">Your timetable is empty. Tap <b>+</b> to add a class, or use <b>Import with AI</b> to build the whole week from a photo of your timetable.</div>`;
  else h+=`<div class="mu" style="margin:10px 6px">Tap a class to edit it. The ring shows your current attendance in that subject.</div>`;
  return h;
}

function vAs(){
  const td=ds(new Date()),A=[...S.assignments].sort((a,b)=>(a.done-b.done)||a.due.localeCompare(b.due));
  let h=`<h1>Assignments</h1>`;
  if(!A.length)h+=`<div class="glass pad">No assignments yet. Tap <b>+</b> to add one.</div>`;
  return h+A.map(a=>{const od=!a.done&&a.due<td,sb=subj(a.subjectId);
    return`<div class="glass as ${a.done?'dn':''}"><button class=chk data-a=asdone data-id="${a.id}" aria-label="Toggle done">${a.done?'✓':''}</button><div class=ttb><h3>${esc(a.title)}</h3><div class="mu ${od?'bad':''}">${sb?esc(sb.name)+' · ':''}Due ${fmt(a.due)}${od?' · overdue':''}</div></div><button class=x data-a=asdel data-id="${a.id}" aria-label="Delete">✕</button></div>`}).join('');
}

function vSet(){
  const c=S.config;
  return`<h1>Settings</h1>
  <h2>Theme</h2><div class="glass pad"><div class=sws>${THEMES.map(t=>`<button class="sw ${c.theme===t[0]?'on':''}" data-a=theme data-t="${t[0]}" style="--s1:${t[2]};--s2:${t[3]}" aria-label="${t[1]}"><i></i><small>${t[1]}</small></button>`).join('')}</div></div>
  <h2>Attendance rules</h2><div class="glass set">
  <label class=row><span>Count On Duty (OD) as present ${info('od')}</span><input type=checkbox id=cf-od ${c.odCountsAsPresent?'checked':''}></label>
  <div><label class=fl>Default required attendance (%) ${info('target')}</label><input id=cf-t type=number min=1 max=100 value="${c.defaultTarget}">
  <label class=fl>Semester start date ${info('sem')}</label><input id=cf-s type=date value="${c.semesterStartDate||''}">
  <label class=fl>Semester end date</label><input id=cf-e type=date value="${c.semesterEndDate||''}"><button class=pri data-a=savecfg>Save</button></div></div>
  <h2>Holidays</h2><div class="glass set"><div><button class=pri style="margin:0" data-a=sheet data-k=holr>🏖 Add holiday or break</button></div>
  ${S.holidays.map(h=>`<div class=row><span>${fmt(h.date)} <span class=mu>${esc(h.reason)}</span></span><button class=x data-a=unhol data-d="${h.date}" aria-label="Remove holiday">✕</button></div>`).join('')}</div>
  <h2>Backup &amp; data</h2><div class="glass set">
  <div class=mu>Your data is stored only on this device. Last backup: ${S.lastBackupAt?new Date(S.lastBackupAt).toLocaleString('en-IN'):'never ⚠️'}</div>
  <div class=row><button data-a=export>⬇ Export backup</button><button data-a=import>⬆ Import backup</button></div>
  <div><button class=dng data-a=reset>↻ Reset the semester</button></div></div>`;
}

function vCal(){
  const sb=subj(SEL);if(!sb){SEL=null;return vSub()}
  const s=stats(sb),p=proj(sb,s),y=CAL.getFullYear(),m=CAL.getMonth(),lead=(new Date(y,m,1).getDay()+6)%7,n=new Date(y,m+1,0).getDate();
  let c=['M','T','W','T','F','S','S'].map(x=>`<div class=h>${x}</div>`).join('')+'<div class=e></div>'.repeat(lead);
  for(let i=1;i<=n;i++){
    const d=ds(new Date(y,m,i));
    const dots=S.records.filter(r=>r.subjectId===sb.id&&r.date===d).map(r=>`<span class=dot style="background:${COL[r.status]}"></span>`).join('');
    c+=`<div class="${isHol(d)?'hol':''} ${SELD===d?'sel':''}" data-a=day data-d="${d}">${i}<br>${dots}</div>`;
  }
  const h2=s.h+WI,wp=h2?Math.floor(s.a*1000/h2)/10:100,wok=s.a*100>=s.t*h2;
  return`<div class=row style="margin-top:14px"><button data-a=back>‹ Back</button><button class=dng data-a=delsub data-id="${sb.id}">Delete subject</button></div>
  <h1><span>${esc(sb.name)}</span>${ring(s.i,64,rc(s),s.i+'%')}</h1>
  <div class="glass pad">${s.a} attended · ${s.h-s.a} missed · ${s.h} held${msg(s)}${projLine(p,s)}</div>
  <div class="glass pad" style="margin-top:12px"><div class=mu>What if I skip the next… ${info('whatif')}</div><div class=row style="justify-content:center;gap:16px;margin:8px 0"><button class=rd data-a=wi data-n=-1>−</button><b style="font-size:22px">${WI} class${WI===1?'':'es'}</b><button class=rd data-a=wi data-n=1>+</button></div><div style="text-align:center" class="${wok?'ok':'bad'}"><b>${wp}%</b> ${wok?'· still safe':'· below '+s.t+'%'}</div></div>
  <div class=row style="margin-top:14px"><button data-a=mon data-n=-1 aria-label="Previous month">‹</button><b>${CAL.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</b><button data-a=mon data-n=1 aria-label="Next month">›</button></div>
  <div class=cal>${c}</div>
  <div class=mu><span class=dot style="background:${COL.PRESENT}"></span>Attended <span class=dot style="background:${COL.ABSENT}"></span>Not attended <span class=dot style="background:${COL.CANCELLED}"></span>Cancelled <span class=dot style="background:${COL.OD}"></span>On duty · grey = holiday</div>
  ${SELD?`<h2>${fmt(SELD)}</h2>`+dayPanel(SELD,sb.id):'<div class=mu style="margin-top:10px">Tap a date to view or change its attendance.</div>'}`;
}

const AIP=[
'You are helping me digitise a college class timetable. I will attach a photo, screenshot or PDF of my timetable.',
'',
'Read it carefully and reply with ONLY one JSON object (no explanation, no markdown fences) in exactly this format:',
'',
'{',
'  "subjects": [',
'    {"name": "Data Structures", "target": 75}',
'  ],',
'  "slots": [',
'    {"day": "Mon", "subject": "Data Structures", "start": "09:00", "end": "09:50", "room": "A-101"}',
'  ]',
'}',
'',
'Rules:',
'1. "day" must be one of: Mon, Tue, Wed, Thu, Fri, Sat, Sun.',
'2. "start" and "end" use 24-hour HH:MM format (2:00 PM = 14:00).',
'3. Create one slot for every class period in the table, on every day it occurs. If a lab is shown as one merged cell, output ONE slot for the full lab time.',
'4. Spell each subject exactly the same in "subjects" and in every slot. Include the subject code if the table shows one (for example "CSMC101 C Programming").',
'5. Skip breaks, lunch, free periods and empty cells.',
'6. If the room is not shown, use an empty string "".',
'7. "target" is the minimum attendance percentage. Use 75 unless the timetable says otherwise.',
'8. If something is unreadable, make your best guess. Do not ask me questions.'
].join('\n');

function parseAI(t){
  const a=t.indexOf('{'),b=t.lastIndexOf('}');if(a<0||b<a)throw new Error('No JSON found. Paste the full answer from the AI.');
  let j;try{j=JSON.parse(t.slice(a,b+1))}catch(e){throw new Error('That text is not valid JSON. Ask the AI to "reply with valid JSON only" and paste it again.')}
  if(!j||!Array.isArray(j.slots)||!j.slots.length)throw new Error('No "slots" found in the JSON.');
  const DM={mon:1,monday:1,tue:2,tues:2,tuesday:2,wed:3,wednesday:3,thu:4,thur:4,thurs:4,thursday:4,fri:5,friday:5,sat:6,saturday:6,sun:7,sunday:7};
  const tm=x=>{const m=/^(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(String(x||'').trim());if(!m)return null;let h=+m[1];const mi=+m[2];
    if(m[3]){const pm=m[3].toLowerCase()==='pm';if(h===12)h=pm?12:0;else if(pm)h+=12}
    return h<24&&mi<60?pad(h)+':'+pad(mi):null};
  const slots=[],bad=[];
  j.slots.forEach((s,i)=>{if(!s){bad.push(i+1);return}
    const w=typeof s.day==='number'?s.day:DM[String(s.day||'').trim().toLowerCase()],st=tm(s.start),en=tm(s.end),nm=String(s.subject||'').trim();
    if(w>=1&&w<=7&&st&&en&&st<en&&nm)slots.push({w,st,en,nm,room:String(s.room||'').trim()});else bad.push(i+1)});
  if(!slots.length)throw new Error('None of the slots could be read. Check the day names, times (HH:MM) and subject names.');
  const targets={};(Array.isArray(j.subjects)?j.subjects:[]).forEach(s=>{if(s&&s.name){const t=Math.round(+s.target);if(t>=1&&t<=100)targets[String(s.name).trim().toLowerCase()]=t}});
  return{slots,bad,targets};
}

function vSheet(){
  if(!sheet)return'';
  const k=sheet.k,td=ds(new Date());
  const opts=S.subjects.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  let h='';
  if(k==='st')h=`<h3>Mark this class</h3>`+ST.map(z=>`<button class=opt data-a=pick data-s="${z[0]}">${z[2]}<small>${z[3]}</small></button>`).join('')+`<button class=opt data-a=pick data-s="">Clear<small>Remove the mark, as if this class was never marked.</small></button>`;
  else if(k==='help')h=`<h3>${HELP[sheet.h][0]}</h3><div class=helpt>${HELP[sheet.h][1]}</div><button class=pri data-a=close>Got it</button>`;
  else if(k==='sub')h=`<h3>Add subject</h3><label class=fl>Subject name</label><input id=f1 placeholder="e.g. Data Structures"><label class=fl>Required attendance (%) ${info('target')}</label><input id=f2 type=number min=1 max=100 value="${S.config.defaultTarget}">
  <label class=fl>Already attended classes before using this app? ${info('opening')}</label><div class=two><div><div class=mu>Classes attended so far</div><input id=f3 type=number min=0 value=0></div><div><div class=mu>Total classes held so far</div><input id=f4 type=number min=0 value=0></div></div><div class=mu>Starting fresh? Leave both at 0.</div><button class=pri data-a=addsub>Add subject</button>`;
  else if(k==='slot'){const e=sheet.edit&&S.timetable.find(t=>t.id===sheet.edit);
    h=`<h3>${e?'Edit class':'Add class'}</h3><label class=fl>Subject</label><select id=f2><option value="">Choose a subject…</option>${S.subjects.map(s=>`<option value="${s.id}" ${e&&e.subjectId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select><input id=f6 placeholder="…or type a new subject name">
    <label class=fl>Days (pick every day this class happens)</label><div class=chips>${DN.slice(1).map((n,i)=>`<label class=chip><input type=checkbox name=wd value="${i+1}" ${e&&e.dayOfWeek===i+1?'checked':''}><span>${n.slice(0,3)}</span></label>`).join('')}</div>
    <div class=two><div><label class=fl>Start time</label><input id=f3 type=time value="${e?e.startTime:'09:00'}"></div><div><label class=fl>End time</label><input id=f4 type=time value="${e?e.endTime:'10:00'}"></div></div>
    <label class=fl>Room</label><input id=f5 placeholder="e.g. Room 125 or Lab 2" value="${e?esc(e.room||''):''}"><button class=pri data-a=addslot>${e?'Save changes':'Add to timetable'}</button>`}
  else if(k==='as')h=`<h3>Add assignment</h3><label class=fl>Title</label><input id=f1 placeholder="e.g. Lab file 3"><label class=fl>Subject (optional)</label><select id=f2><option value="">No subject</option>${opts}</select><label class=fl>Due date</label><input id=f3 type=date value="${td}"><button class=pri data-a=addas>Add assignment</button>`;
  else if(k==='xtra')h=S.subjects.length?`<h3>Extra class</h3><div class=mu>A class that is not in your timetable.</div><label class=fl>Subject</label><select id=f1>${opts}</select><button class=pri data-a=addx>Add as attended</button>`:'<h3>Add a subject first</h3>';
  else if(k==='holr')h=`<h3>Holiday or break</h3><div class=mu>For a single day, use the same date twice. Classes on holidays are not counted.</div><label class=fl>From</label><input id=f1 type=date value="${td}"><label class=fl>To</label><input id=f2 type=date value="${td}"><label class=fl>Reason (optional)</label><input id=f3 placeholder="e.g. Diwali break"><button class=pri data-a=addhol>Save holiday</button>`;
  else if(k==='ai')h=`<h3>Import timetable with AI</h3><div class=mu>Use any AI app that can read images (ChatGPT, Gemini, Claude, etc.).</div>
  <p class=step><b>Step 1.</b> Copy this prompt.</p><textarea id=ai-p readonly rows=5>${esc(AIP)}</textarea><button data-a=copyp>Copy prompt</button>
  <p class=step><b>Step 2.</b> Open your AI app, attach a photo or PDF of your timetable, paste the prompt and send.</p>
  <p class=step><b>Step 3.</b> Copy the AI's answer and paste it here.</p><textarea id=ai-txt rows=6 placeholder="Paste the AI's JSON answer here"></textarea>
  <label class=row style="justify-content:flex-start;gap:10px;margin:8px 0"><input type=checkbox id=ai-rep><span>Replace my current timetable</span></label><button class=pri data-a=aiimp>Import timetable</button>`;
  return`<div class=ov><div class=sheet role=dialog aria-modal=true>${h}</div></div>`;
}

const V={sub:vSub,log:vLog,tt:vTT,as:vAs,set:vSet};
const TABS=[['sub','📖','Subjects'],['log','🗒️','Daily Log'],['tt','📅','Timetable'],['as','📋','Tasks'],['set','⚙️','Settings']];
const FAB={sub:'sub',tt:'slot',as:'as'};
function render(){
  const a=$('#app');a.classList.toggle('anim',ANIM);ANIM=false;
  a.innerHTML=V[tab]();
  $('#nav').innerHTML=TABS.map(([k,i,l])=>`<button class="${tab===k?'on':''}" data-a=tab data-t="${k}"><span>${i}</span>${l}</button>`).join('');
  $('#fab').innerHTML=FAB[tab]&&!SEL?`<button class=pri data-a=sheet data-k="${FAB[tab]}" aria-label="Add">+</button>`:'';
  $('#sh').innerHTML=vSheet();
}
function commit(){save();render()}
const bad=m=>alert(m);

// ---------- events ----------
document.addEventListener('click',e=>{
  if(e.target.classList.contains('ov')){sheet=null;return render()}
  const el=e.target.closest('[data-a]');if(!el)return;
  const a=el.dataset.a,d=el.dataset,v=id=>$('#'+id).value;
  switch(a){
    case'tab':tab=d.t;SEL=null;SELD=null;sheet=null;ANIM=true;return render();
    case'sheet':sheet={k:d.k};return render();
    case'close':sheet=null;return render();
    case'help':sheet={k:'help',h:d.h};return render();
    case'menu':sheet={k:'st',d:d.d,id:d.id,sid:d.sid,slot:d.slot};return render();
    case'pick':{const z=sheet;sheet=null;
      if(z.id){if(d.s==='')S.records=S.records.filter(r=>r.id!==z.id);else{const r=S.records.find(r=>r.id===z.id);if(r)r.status=d.s}}
      else setSlot(z.sid,z.slot,z.d,d.s);break}
    case'allp':items(LD,'').forEach(i=>{if(!i.r&&!i.x)setSlot(i.sb.id,i.t.id,LD,'PRESENT')});break;
    case'xtra':if(d.sid){S.records.push({id:'extra_'+uid(),subjectId:d.sid,date:d.d,slotId:null,status:'PRESENT',isExtraClass:true,timestamp:Date.now()})}
      else{sheet={k:'xtra',d:d.d};return render()}break;
    case'addx':S.records.push({id:'extra_'+uid(),subjectId:v('f1'),date:sheet.d||LD,slotId:null,status:'PRESENT',isExtraClass:true,timestamp:Date.now()});sheet=null;break;
    case'ld':{const x=pd(LD);x.setDate(x.getDate()+ +d.n);LD=ds(x);return render()}
    case'ltoday':LD=ds(new Date());return render();
    case'ldgo':LD=d.d;return render();
    case'hol':{const have=isHol(d.d);S.holidays=have?S.holidays.filter(h=>h.date!==d.d):[...S.holidays,{date:d.d,reason:'Holiday'}].sort((p,q)=>p.date.localeCompare(q.date));break}
    case'unhol':S.holidays=S.holidays.filter(h=>h.date!==d.d);break;
    case'addhol':{if(!v('f1')||!v('f2'))return bad('Please pick both dates.');const have=new Set(S.holidays.map(h=>h.date));
      range(v('f1'),v('f2')).forEach(x=>{if(!have.has(x))S.holidays.push({date:x,reason:v('f3').trim()||'Holiday'})});
      S.holidays.sort((p,q)=>p.date.localeCompare(q.date));sheet=null;break}
    case'addsub':{
      const n=v('f1').trim(),t=+v('f2'),at=+v('f3'),h=+v('f4');
      if(!n)return bad('Please enter a subject name.');if(!(t>=1&&t<=100))return bad('Required attendance must be between 1 and 100.');
      if(!(at>=0&&h>=0))return bad('Numbers cannot be negative.');if(at>h)return bad('Classes attended cannot be more than classes held.');
      S.subjects.push({id:uid(),name:n,targetPercent:Math.round(t),initialBalance:{attended:Math.round(at),held:Math.round(h)}});sheet=null;break}
    case'adj':{const b=subj(d.id).initialBalance,n=+d.n,why='This count comes from classes marked in Daily Log. Change it there or in the subject calendar.';
      if(d.k==='a'){if(n>0){b.attended++;b.held++}else if(b.attended>0){b.attended--;b.held--}else return bad(why)}
      else{if(n>0)b.held++;else if(b.held-b.attended>0)b.held--;else return bad(why)}break}
    case'open':SEL=d.id;SELD=ds(new Date());CAL=new Date();WI=0;ANIM=true;break;
    case'back':SEL=null;SELD=null;ANIM=true;break;
    case'wi':WI=Math.max(0,Math.min(60,WI+ +d.n));return render();
    case'mon':CAL=new Date(CAL.getFullYear(),CAL.getMonth()+ +d.n,1);return render();
    case'day':SELD=d.d;return render();
    case'delsub':if(!confirm('This deletes the subject, its timetable slots and all its attendance records. Continue?'))return;
      S.subjects=S.subjects.filter(s=>s.id!==d.id);S.timetable=S.timetable.filter(t=>t.subjectId!==d.id);S.records=S.records.filter(r=>r.subjectId!==d.id);SEL=null;break;
    case'tog':{const w=+d.w;OPEN.has(w)?OPEN.delete(w):OPEN.add(w);return render()}
    case'editslot':sheet={k:'slot',edit:d.id};return render();
    case'addslot':{
      const days=[...document.querySelectorAll('input[name=wd]:checked')].map(x=>+x.value);
      let sid=v('f2');const nn=v('f6').trim();
      if(nn){let ex=S.subjects.find(s=>s.name.toLowerCase()===nn.toLowerCase());
        if(!ex){ex={id:uid(),name:nn,targetPercent:S.config.defaultTarget,initialBalance:{attended:0,held:0}};S.subjects.push(ex)}sid=ex.id}
      if(!sid)return bad('Choose a subject or type a new one.');
      if(!days.length)return bad('Pick at least one day.');
      if(!v('f3')||!v('f4')||v('f3')>=v('f4'))return bad('End time must be after the start time.');
      const f={subjectId:sid,startTime:v('f3'),endTime:v('f4'),room:v('f5').trim()};
      const old=sheet.edit&&S.timetable.find(t=>t.id===sheet.edit);
      if(old&&days.includes(old.dayOfWeek)){Object.assign(old,f);days.splice(days.indexOf(old.dayOfWeek),1)}
      else if(old)S.timetable=S.timetable.filter(t=>t.id!==old.id);
      days.forEach(w=>S.timetable.push({id:uid(),dayOfWeek:w,...f}));
      days.concat(old?[old.dayOfWeek]:[]).forEach(w=>OPEN.add(w));sheet=null;break}
    case'delslot':if(!confirm('Remove this class from your timetable? Attendance you already marked is kept.'))return;S.timetable=S.timetable.filter(t=>t.id!==d.id);break;
    case'copyp':{const done=()=>{el.textContent='Copied ✓'};
      const fb=()=>{const ta=$('#ai-p');ta.focus();ta.select();ta.setSelectionRange(0,99999);try{document.execCommand('copy')?done():bad('Long-press the box and choose Copy.')}catch(_){bad('Long-press the box and choose Copy.')}};
      if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(AIP).then(done,fb);else fb();return}
    case'aiimp':{
      let r;try{r=parseAI(v('ai-txt'))}catch(err){return bad(err.message)}
      const names=[...new Set(r.slots.map(s=>s.nm))],rep=$('#ai-rep').checked;
      if(!confirm(`Found ${names.length} subjects and ${r.slots.length} class slots${r.bad.length?` (${r.bad.length} unreadable slots skipped)`:''}.\n${rep?'Your current timetable will be replaced.':'They will be added to your timetable.'}\nContinue?`))return;
      if(rep)S.timetable=[];
      names.forEach(n=>{if(!S.subjects.some(s=>s.name.toLowerCase()===n.toLowerCase()))S.subjects.push({id:uid(),name:n,targetPercent:r.targets[n.toLowerCase()]||S.config.defaultTarget,initialBalance:{attended:0,held:0}})});
      r.slots.forEach(s=>{const sb=S.subjects.find(x=>x.name.toLowerCase()===s.nm.toLowerCase());
        if(!S.timetable.some(t=>t.dayOfWeek===s.w&&t.subjectId===sb.id&&t.startTime===s.st)){S.timetable.push({id:uid(),dayOfWeek:s.w,subjectId:sb.id,startTime:s.st,endTime:s.en,room:s.room});OPEN.add(s.w)}});
      sheet=null;alert('Timetable imported!');break}
    case'addas':if(!v('f1').trim())return bad('Please enter a title.');
      S.assignments.push({id:uid(),title:v('f1').trim(),subjectId:v('f2'),due:v('f3'),done:false});sheet=null;break;
    case'asdone':{const x=S.assignments.find(x=>x.id===d.id);if(x)x.done=!x.done;break}
    case'asdel':S.assignments=S.assignments.filter(x=>x.id!==d.id);break;
    case'theme':S.config.theme=d.t;applyTheme();break;
    case'savecfg':{const s0=v('cf-s'),e0=v('cf-e');if(s0&&e0&&s0>e0)return bad('Semester end date must be after the start date.');
      S.config={...S.config,odCountsAsPresent:$('#cf-od').checked,defaultTarget:Math.min(100,Math.max(1,+v('cf-t')||75)),semesterStartDate:s0,semesterEndDate:e0};alert('Saved ✓');break}
    case'reset':if(!confirm('This clears all attendance records, holidays, assignments and opening balances. Subjects and timetable stay. Export a backup first. Continue?'))return;
      S.records=[];S.holidays=[];S.assignments=[];S.subjects.forEach(s=>s.initialBalance={attended:0,held:0});break;
    case'export':{
      S.lastBackupAt=Date.now();save();
      const u=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));
      const l=document.createElement('a');l.href=u;l.download=`attendance-backup-${ds(new Date())}.json`;l.click();setTimeout(()=>URL.revokeObjectURL(u),1000);break}
    case'import':return $('#imp').click();
  }
  commit();
});
$('#imp').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{
    const x=JSON.parse(await f.text());
    if(x.version!==1||!['subjects','timetable','records','holidays'].every(k=>Array.isArray(x[k])))throw 0;
    if(!confirm('This will replace your current data with the backup. Continue?'))return;
    S={...structuredClone(D),...x,config:{...D.config,...x.config}};applyTheme();commit();alert('Backup restored ✓');
  }catch(_){alert('This is not a valid backup file.')}
});
applyTheme();render();
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{})})}
