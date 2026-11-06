/* Local-first store with the same small API the page used on Claude (collection/doc/set/update/onSnapshot),
   saved in this browser and synced to a private GitHub Gist when online. */
(function(){
  const KEY='vx-store',CFG='vx-sync',FILE='vocab-sync.json',DESC='Vocab Screening sync (private)';
  let S={};try{S=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){S={}}
  const subs=[],isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
  function deepMerge(a,b){const o=Object.assign({},a);for(const k in b)o[k]=isObj(b[k])&&isObj(o[k])?deepMerge(o[k],b[k]):b[k];return o}
  function rec(c,id){S[c]=S[c]||{};return S[c][id]=S[c][id]||{d:{},t:{}}}
  function notify(c){subs.forEach(s=>{if(s.c===c)s.fire()})}
  function write(c,id,data,merge){const r=rec(c,id),now=Date.now();
    if(!merge){for(const k in r.d)if(!(k in data)){delete r.d[k];r.t[k]=now}}
    for(const k in data){r.d[k]=merge&&isObj(data[k])&&isObj(r.d[k])?deepMerge(r.d[k],data[k]):data[k];r.t[k]=now}
    persist();notify(c);Sync.soon();return Promise.resolve()}
  function docSnap(c,id){const r=S[c]&&S[c][id];return{id,exists:!!(r&&Object.keys(r.d).length),data:()=>r?JSON.parse(JSON.stringify(r.d)):undefined}}
  const db={collection(c){return{
    doc(id){return{set:d=>write(c,id,d,false),update:d=>write(c,id,d,true),get:()=>Promise.resolve(docSnap(c,id)),
      onSnapshot(cb){const s={c,fire:()=>{try{cb(docSnap(c,id))}catch(e){}}};subs.push(s);setTimeout(s.fire,0);return()=>subs.splice(subs.indexOf(s),1)}}},
    onSnapshot(cb){const s={c,fire:()=>{const m=S[c]||{};try{cb({docs:Object.keys(m).filter(id=>Object.keys(m[id].d).length).map(id=>docSnap(c,id)),metadata:{fromCache:false}})}catch(e){}}};
      subs.push(s);setTimeout(s.fire,0);return()=>subs.splice(subs.indexOf(s),1)}}}};

  /* field-level merge: for each document field, the newer write wins */
  function mergeStores(a,b){const out={};let changedA=false,changedB=false;
    const cols=new Set([...Object.keys(a||{}),...Object.keys(b||{})]);
    for(const c of cols){out[c]={};const A=(a||{})[c]||{},B=(b||{})[c]||{};
      for(const id of new Set([...Object.keys(A),...Object.keys(B)])){const ra=A[id]||{d:{},t:{}},rb=B[id]||{d:{},t:{}},r={d:{},t:{}};
        for(const k of new Set([...Object.keys(ra.t||{}),...Object.keys(rb.t||{})])){const ta=(ra.t||{})[k]||0,tb=(rb.t||{})[k]||0,src=tb>ta?rb:ra,t=Math.max(ta,tb);
          r.t[k]=t;if(k in (src.d||{}))r.d[k]=src.d[k];
          const va=JSON.stringify((ra.d||{})[k]),vb=JSON.stringify((rb.d||{})[k]),vr=JSON.stringify(r.d[k]);
          if(vr!==va||ta!==t)changedA=true;if(vr!==vb||tb!==t)changedB=true}
        out[c][id]=r}}
    return{out,changedA,changedB}}

  let cfg={};try{cfg=JSON.parse(localStorage.getItem(CFG)||'{}')||{}}catch(e){}
  const saveCfg=()=>{try{localStorage.setItem(CFG,JSON.stringify(cfg))}catch(e){}};
  const listeners=[];let state={busy:false,err:'',last:cfg.last||0},timer=null,poll=null;
  const emit=()=>listeners.forEach(f=>{try{f(Sync.status())}catch(e){}});
  async function gh(path,opt={}){const r=await fetch('https://api.github.com'+path,Object.assign({},opt,{headers:Object.assign({'Accept':'application/vnd.github+json','Authorization':'Bearer '+cfg.token,'X-GitHub-Api-Version':'2022-11-28'},opt.body?{'Content-Type':'application/json'}:{})}));
    if(r.status===401)throw new Error('令牌无效或已过期，请重新填写。');if(r.status===403||r.status===429)throw new Error('GitHub 暂时限制了请求，过几分钟会自动重试。');
    if(r.status===404)throw new Error('找不到同步文件，可能被删了。断开后重新连接即可。');if(!r.ok)throw new Error('同步失败（GitHub 返回 '+r.status+'）。');return r.json()}
  async function readRemote(){const g=await gh('/gists/'+cfg.gist);const f=g.files&&g.files[FILE];if(!f)return{};
    let txt=f.content;if(f.truncated){const r=await fetch(f.raw_url);txt=await r.text()}try{return JSON.parse(txt||'{}')||{}}catch(e){return{}}}
  async function writeRemote(store){await gh('/gists/'+cfg.gist,{method:'PATCH',body:JSON.stringify({files:{[FILE]:{content:JSON.stringify(store)}}})})}
  const Sync={
    configured:()=>!!(cfg.token&&cfg.gist),
    status:()=>({configured:Sync.configured(),busy:state.busy,err:state.err,last:state.last,online:navigator.onLine,login:cfg.login||''}),
    onChange(f){listeners.push(f);f(Sync.status())},
    async connect(token){cfg.token=token.trim();state.err='';emit();
      try{const u=await gh('/user');cfg.login=u.login;
        let found=null;for(let p=1;p<=5&&!found;p++){const list=await gh('/gists?per_page=100&page='+p);found=list.find(g=>g.description===DESC&&g.files&&g.files[FILE]);if(list.length<100)break}
        if(found)cfg.gist=found.id;
        else{const g=await gh('/gists',{method:'POST',body:JSON.stringify({description:DESC,public:false,files:{[FILE]:{content:JSON.stringify(S)}}})});cfg.gist=g.id}
        saveCfg();await Sync.now();return true}
      catch(e){cfg={};saveCfg();state.err=e.message||'连接失败。';emit();return false}},
    disconnect(){cfg={};saveCfg();state={busy:false,err:'',last:0};emit()},
    soon(){if(!Sync.configured())return;clearTimeout(timer);timer=setTimeout(()=>Sync.now(),3000)},
    async now(){if(!Sync.configured()||state.busy)return;if(!navigator.onLine){emit();return}
      state.busy=true;state.err='';emit();
      try{const remote=await readRemote();const m=mergeStores(S,remote);
        if(m.changedB)await writeRemote(m.out);
        if(m.changedA){S=m.out;persist();Object.keys(S).forEach(notify)}
        state.last=Date.now();cfg.last=state.last;saveCfg()}
      catch(e){state.err=e.message||'同步失败。'}
      state.busy=false;emit()},
    exportAll:()=>JSON.parse(JSON.stringify(S)),
    importStore(st){const m=mergeStores(S,st||{});S=m.out;persist();Object.keys(S).forEach(notify);Sync.soon()},
    _merge:mergeStores
  };
  window.addEventListener('online',()=>{emit();Sync.now()});window.addEventListener('offline',emit);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')Sync.now()});
  poll=setInterval(()=>{if(document.visibilityState==='visible')Sync.now()},120000);
  window.VX={db,Sync};
  if(Sync.configured())setTimeout(()=>Sync.now(),800);
})();
