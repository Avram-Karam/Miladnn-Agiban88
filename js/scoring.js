/* scoring.js — نظام درجات مؤتمر ميلادا عجيبًا 2026 */
(function(){
  'use strict';
  const MAX = Object.freeze({
    games: 100,
    hymn: 15,
    pressure: 15,
    sketch: 30,
    studio: 20,
    conferenceHymn: 20,
    lecture1: 15,
    lecture2: 15,
    attendance1: 15,
    attendance2: 15,
    attendance3: 15,
    attendance4: 15,
    attendance5: 15,
    attendance6: 15,
    attendance7: 15,
    attendance8: 15,
    pamphlet: 50,
    total: 300
  });
  const GAME_MAX = {
    hymn: 15,
    pressure: 15,
    sketch: 30,
    studio: 20,
    conferenceHymn: 20
  };
  const GAME_LABELS = {
    hymn:'ترنيمة وتقديمها', pressure:'تحت الضغط', sketch:'اسكتش مسرحي',
    studio:'استوديو تحليلي بمود شخصية', conferenceHymn:'تسميع اللحن الخاص بالمؤتمر'
  };
  const ATTENDANCE_LABELS = [
    'حضور التسحبة 1','حضور التسبحة 2','القداس','صلاة باكر',
    'غروب ونوم 1','غروب ونوم 2','محاضرة اليوم الأول','محاضرة اليوم الثاني'
  ];

  function profile(){
    try {
      const keys = ['yc_participant_profile_v1','yc2_user_profile'];
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const p = JSON.parse(raw);
        if (p && p.name) return p;
      }
      return null;
    } catch(e){ return null; }
  }
  function groupName(){ return String(profile()?.group || '').trim(); }
  function personName(){ return String(profile()?.name || '').trim(); }
  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

  async function fetchScorebook(){
    if(!window.DataService) throw new Error('DataService غير متاح');
    const result = {status:'success', data: await DataService.getScorebook()};
    if(result.status !== 'success') throw new Error(result.message || 'تعذر تحميل الدرجات');
    return result.data || {gameScores:[], individualScores:[], config:{}};
  }

  function groupMembers(data, group){
    const g = (data?.groups || []).find(x => String(x.name).trim() === String(group).trim() || String(x.id).trim() === String(group).trim());
    return Array.isArray(g?.members) ? g.members.map(String) : [];
  }
  function norm(s){ return String(s||'').trim().toLowerCase().replace(/[إأآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ـ/g,'').replace(/\s+/g,' '); }

  function computeGroupSummary(data, group){
    const members = groupMembers(data, group);
    const memberKeys = new Set(members.map(norm));
    const games = {};
    (data?.gameScores || []).forEach(r=>{
      if(norm(r.group)!==norm(group)) return;
      games[r.gameId] = Number(r.score||0);
    });
    const gameEarned = Object.keys(GAME_MAX).reduce((s,id)=>s+Math.min(GAME_MAX[id],Math.max(0,Number(games[id]||0))),0);
    const indiv = {};
    (data?.individualScores || []).forEach(r=>{
      if(norm(r.group)!==norm(group)) return;
      const cat=String(r.category||'');
      if(!indiv[cat]) indiv[cat]=new Map();
      const key=norm(r.name);
      if(key) indiv[cat].set(key, Math.max(0,Number(r.score||0)));
    });
    const avg = (cat,max)=>{
      if(!members.length) return 0;
      let total=0;
      members.forEach(name=>{ total += Math.min(max, Math.max(0, Number(indiv[cat]?.get(norm(name)) || 0))); });
      return total / members.length;
    };
    const lecture1=avg('lecture1',15), lecture2=avg('lecture2',15);
    const attendance=ATTENDANCE_LABELS.reduce((s,_,i)=>s+avg('attendance'+(i+1),15),0);
    const pamphletMax = Math.min(50, Math.max(0, Number(data?.config?.pamphletMax ?? 50)));
    const pamphlet=avg('pamphlet',pamphletMax);
    const lectures=lecture1+lecture2;
    const total=gameEarned+lectures+attendance+pamphlet;
    return {
      group, membersCount:members.length,
      games:{earned:gameEarned,max:100,details:games},
      lectures:{earned:lectures,max:30,details:{lecture1,lecture2}},
      attendance:{earned:attendance,max:120,details:ATTENDANCE_LABELS.map((_,i)=>avg('attendance'+(i+1),15))},
      pamphlet:{earned:pamphlet,max:50,details:pamphlet},
      total, max:300
    };
  }

  async function adminAuthorizeForGame(){
    const existing=sessionStorage.getItem('admin_session_token');
    // لا نثق في الجلسة القديمة وحدها: كل ضغطة تسجيل درجة تطلب كلمة المرور.
    const password=window.prompt('🔐 لإضافة درجة اللعبة، اكتب كلمة مرور الأدمن:');
    if(password===null) throw new Error('تم إلغاء تسجيل الدرجة.');
    if(String(password)!=='124578') throw new Error('كلمة المرور غير صحيحة.');
    const r=await fetch('/api/admin-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:String(password)})});
    const j=await r.json().catch(()=>null);
    if(!r.ok || j?.status!=='success' || !j.token) throw new Error(j?.message||'تعذر التحقق من كلمة المرور.');
    sessionStorage.setItem('admin_session_token',j.token);
    return j.token;
  }

  async function submitGame(gameId, score, groupOverride){
    const group=String(groupOverride||groupName()).trim();
    if(!group) throw new Error('لازم تختار المجموعة أولاً.');
    const max=GAME_MAX[gameId];
    if(max==null) throw new Error('اللعبة غير معروفة');
    const sessionToken=await adminAuthorizeForGame();
    const safeScore=Math.min(max,Math.max(0,Number(score||0)));
    const result=await DataService.sendToGAS({action:'saveGameAttempt',group,gameId,score:safeScore,max,sessionToken});
    if(result?.status==='error' && /جلسة أدمن|admin/i.test(String(result.message||''))){
      sessionStorage.removeItem('admin_session_token');
    }
    return result;
  }

  async function submitIndividualFor(name, group, category, score, max){
    name=String(name||'').trim(); group=String(group||'').trim();
    if(!name || !group) throw new Error('اختار الاسم والمجموعة أولاً.');
    const safeMax=Math.max(0,Number(max||0));
    const safeScore=Math.min(safeMax,Math.max(0,Number(score||0)));
    const result=await DataService.sendToGAS({action:'saveIndividualScore',name,group,category,score:safeScore,max:safeMax});
    return result;
  }

  async function submitIndividual(category, score, max){
    const name=personName(), group=groupName();
    if(!name || !group) throw new Error('لازم تختار اسمك ومجموعتك من صفحة البداية أولاً.');
    return submitIndividualFor(name,group,category,score,max);
  }

  window.YCScoring={MAX,GAME_MAX,GAME_LABELS,ATTENDANCE_LABELS,profile,personName,groupName,fetchScorebook,computeGroupSummary,submitGame,submitIndividual,submitIndividualFor,esc};
})();
