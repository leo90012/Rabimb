/* Rabimbox – vecstopenjski checkout (Izposoja/Skladiščenje). Shrani v Supabase (narocila). */
(function(){
  "use strict";
  var CFG=window.RABIMBOX_CONFIG||{};
  var APP=document.getElementById("app");
  var sb=(window.supabase&&window.supabase.createClient)?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY):null;

  var IZP=[
    {id:"izp20",naziv:"20 boxov",boxes:20,cena:49},
    {id:"izp40",naziv:"40 boxov",boxes:40,cena:89},
    {id:"izp60",naziv:"60 boxov",boxes:60,cena:119},
    {id:"izp80",naziv:"80 boxov",boxes:80,cena:149}
  ];
  var SKL=[
    {id:"skl10",naziv:"Do 10 boxov",max:10,perBox:3.90},
    {id:"skl25",naziv:"Do 25 boxov",max:25,perBox:3.60},
    {id:"skl50",naziv:"Do 50 boxov",max:50,perBox:3.30},
    {id:"sklkontakt",naziv:"Nad 50 boxov",contact:true}
  ];
  var STEPS=[["paketi","Paketi"],["dodatki","Dodatki"],["termin","Termin"],["povzetek","Povzetek"],["racun","Račun"]];

  var s={step:"choice",tip:null,plan:null,stBoxov:null,extras:{stopnice:false,krhko:false,pomoc:false},
    opis:"",naslov:"",enota:"",telefon:"",datum:"",cas:"",ime:"",priimek:"",email:"",geslo:"",racunMode:"novo",soglasje:false,loggedIn:false,loginHint:false};

  var ICON={
    truck:'<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M3 6h11v9H3z"/><path d="M14 9h3.5L21 12.5V15h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg>',
    box:'<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round"><path d="M21 8l-9-4-9 4v8l9 4 9-4V8z"/><path d="M3 8l9 4 9-4M12 12v8"/></svg>',
    stairs:'<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round"><path d="M3 20h4v-4h4v-4h4V8h4V4"/></svg>',
    fragile:'<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round"><path d="M8 21h8M12 21v-5M7 3h10l-1 7a4 4 0 01-8 0z"/></svg>',
    help:'<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.5 3.2-5.4 7-5.4s7 1.9 7 5.4"/></svg>',
    check:'<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>'
  };

  function eur(n){try{return new Intl.NumberFormat("sl-SI",{style:"currency",currency:"EUR"}).format(n);}catch(e){return n+" €";}}
  function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m];});}
  function render(h){APP.innerHTML=h;}
  function planObj(){if(!s.plan)return null;var a=(s.tip==="izposoja"?IZP:SKL);for(var i=0;i<a.length;i++)if(a[i].id===s.plan)return a[i];return null;}
  function monthly(){var p=planObj();if(!p)return 0;return s.tip==="izposoja"?p.cena:(s.stBoxov||0)*p.perBox;}
  function planLabel(){var p=planObj();if(!p)return "-";return s.tip==="izposoja"?("Izposoja "+p.naziv):("Skladiščenje "+p.naziv+" ("+(s.stBoxov||0)+" boxov)");}
  function cenaOpis(){var p=planObj();if(!p)return "";return s.tip==="izposoja"?(eur(p.cena)+"/mesec"):((s.stBoxov||0)+" × "+eur(p.perBox)+" = "+eur(monthly())+"/mesec");}

  function progress(cur){
    var idx=-1;for(var i=0;i<STEPS.length;i++)if(STEPS[i][0]===cur)idx=i;
    return '<div class="steps">'+STEPS.map(function(st,i){
      var cls=i<idx?"done":(i===idx?"active":"");
      return '<div class="step '+cls+'"><span class="num">'+(i<idx?"✓":(i+1))+'</span><span class="lbl">'+st[1]+'</span></div>';
    }).join("")+'</div>';
  }

  // ---- CHOICE ----
  function viewChoice(){
    render('<h1 class="co-title">Naroči zdaj</h1><p class="co-sub">Izberi storitev</p>'+
      '<div class="choice-grid">'+
      '<div class="choice" data-tip="izposoja"><div class="t">Izposoja</div><div class="d">Najem boxov za selitev</div></div>'+
      '<div class="choice" data-tip="skladiscenje"><div class="t">Skladiščenje</div><div class="d">Shranjevanje na zahtevo</div></div>'+
      '</div>');
    q$all(".choice").forEach(function(c){c.onclick=function(){s.tip=c.getAttribute("data-tip");s.plan=null;s.stBoxov=null;s.step="paketi";route();};});
  }

  // ---- PAKETI ----
  function viewPaketi(){
    var izp=s.tip==="izposoja";
    var arr=izp?IZP:SKL;
    var cards=arr.map(function(p){
      if(p.contact){return '<div class="plan"><div class="pic"><img src="Slike/Skatle.png" alt="box" /></div><div class="pt">'+esc(p.naziv)+'</div><div class="pd">po dogovoru</div><div class="pp" style="font-size:17px">Po dogovoru</div><div class="pu">&nbsp;</div><a class="btn small" href="mailto:'+esc(CFG.SUPPORT_EMAIL||"info@rabimbox.si")+'?subject='+encodeURIComponent("Povprasevanje - skladiscenje nad 50 boxov")+'" style="text-decoration:none">Kontaktiraj nas</a></div>';}
      var sel=s.plan===p.id?" sel":"";
      var price=izp?eur(p.cena):eur(p.perBox);
      var unit=izp?"/mesec":"/box · min. 3 mesece";
      var desc=izp?("Najem "+p.boxes+" boxov"):("do "+p.max+" boxov");
      return '<div class="plan'+sel+'"><div class="pic"><img src="Slike/Skatle.png" alt="box" /></div><div class="pt">'+esc(p.naziv)+'</div>'+
        '<div class="pd">'+esc(desc)+'</div><div class="pp">'+price+'</div><div class="pu">'+unit+'</div>'+
        '<button class="btn small selbtn" data-id="'+p.id+'">Izberi</button></div>';
    }).join("");
    var boxSel="";
    if(!izp&&s.plan){var p=planObj();boxSel='<div class="card mt" style="max-width:420px;margin:18px auto 0"><div class="field"><label>Koliko boxov shranjuješ? (do '+p.max+')</label><input type="number" id="stBoxov" min="1" max="'+p.max+'" value="'+(s.stBoxov||"")+'" placeholder="npr. 8" /></div><div class="center muted" id="cenaCalc">'+(s.stBoxov?("Mesečno: "+eur(monthly())):"Vpiši število boxov")+'</div></div>';}
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>'+(izp?"Paketi izposoje":"Paketi skladiščenja")+'</h1>'+
      '<p class="co-sub">Najprej izberi paket'+(izp?"":", nato vpiši število boxov")+'.</p>'+
      progress("paketi")+'<div class="plan-grid">'+cards+'</div>'+boxSel+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><button class="btn" id="next" '+(canNextPaketi()?"":"disabled")+'>Naprej</button></div>'+
      infoBlock());
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="choice";route();};});
    q$all(".selbtn").forEach(function(b){b.onclick=function(){s.plan=b.getAttribute("data-id");if(s.tip==="izposoja"){s.step="dodatki";route();}else{route();}};});
    var bx=q$("#stBoxov");if(bx)bx.oninput=function(){var v=parseInt(bx.value,10);var p=planObj();if(v>p.max)v=p.max;s.stBoxov=isNaN(v)?null:v;var c=q$("#cenaCalc");if(c)c.textContent=s.stBoxov?("Mesečno: "+eur(monthly())):"Vpiši število boxov";var n=q$("#next");if(n)n.disabled=!canNextPaketi();};
    var nb=q$("#next");if(nb)nb.onclick=function(){if(canNextPaketi()){s.step="dodatki";route();}};
  }
  function canNextPaketi(){if(!s.plan)return false;if(s.tip==="skladiscenje")return !!s.stBoxov&&s.stBoxov>0;return true;}

  // ---- DODATKI ----
  function viewDodatki(){
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>Dodatne informacije</h1>'+
      '<p class="co-sub">Nekaj podrobnosti, da bo dostava/prevzem potekal gladko.</p>'+progress("dodatki")+
      xrow("stairs","stopnice","Potrebujete dostop čez več kot 2 nadstropji stopnic?","")+
      xrow("fragile","krhko","Ali shranjujete krhke predmete?","")+
      xrow("help","pomoc","Želite pomoč pri polnjenju boxov?","Doplačilo 25 €/h")+
      '<div class="card mt"><div class="field"><label>Opis lokacije / stavbe</label>'+
      '<textarea id="opis" rows="3" placeholder="Npr. 3. nadstropje, desno od dvigala, šifra vrat 1234...">'+esc(s.opis)+'</textarea>'+
      '<div class="hint">Več informacij pomeni bolj gladko dostavo.</div></div></div>'+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><button class="btn" id="next">Naprej</button></div>');
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="paketi";route();};});
    q$all(".sw").forEach(function(sw){sw.onclick=function(){var k=sw.getAttribute("data-k");s.extras[k]=!s.extras[k];sw.classList.toggle("on",s.extras[k]);};});
    q$("#opis").oninput=function(e){s.opis=e.target.value;};
    q$("#next").onclick=function(){s.step="termin";route();};
  }
  function xrow(icon,key,q,sub){
    return '<div class="xrow"><div class="xq">'+q+(sub?'<small>'+sub+'</small>':'')+'</div>'+
      '<div class="toggle">Ne<div class="sw'+(s.extras[key]?" on":"")+'" data-k="'+key+'"></div>Da</div></div>';
  }

  // ---- TERMIN ----
  function viewTermin(){
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>Termin dostave</h1>'+
      '<p class="co-sub">Vpiši naslov ter izberi datum in uro.</p>'+progress("termin")+
      '<div class="split"><div class="card">'+
      '<div class="rowflex"><div class="field"><label>Naslov za dostavo</label><input id="naslov" value="'+esc(s.naslov)+'" placeholder="Ulica in hisna stevilka, kraj" /></div>'+
      '<div class="field" style="max-width:120px"><label>Enota</label><input id="enota" value="'+esc(s.enota)+'" placeholder="npr. 12" /></div></div>'+
      '<div class="field"><label>Telefon</label><input id="telefon" value="'+esc(s.telefon)+'" placeholder="+386..." /></div>'+
      '<div class="rowflex"><div class="field"><label>Datum</label><input type="date" id="datum" min="'+todayStr()+'" value="'+esc(s.datum)+'" /></div>'+
      '<div class="field"><label>Ura</label><select id="cas"><option value="">Najprej izberi datum</option></select><div class="hint" id="casHint"></div></div></div>'+
      '</div>'+summaryCard()+'</div>'+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><button class="btn" id="next">Naprej</button></div>');
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="dodatki";route();};});
    ["naslov","enota","telefon"].forEach(function(id){q$("#"+id).oninput=function(e){s[id]=e.target.value;};});
    q$("#datum").onchange=function(e){s.datum=e.target.value;s.cas="";refreshTimes();};
    q$("#cas").onchange=function(e){s.cas=e.target.value;};
    if(s.datum)refreshTimes();
    q$("#next").onclick=function(){
      if(!s.naslov||!s.datum||!s.cas){alert("Prosim vpiši naslov, datum in uro.");return;}
      if(s.datum<todayStr()){alert("Datum ne more biti v preteklosti.");return;}
      s.step="povzetek";route();
    };
  }
  function timeOpts(blocked){var o="";for(var h=8;h<=18;h++){var t=(h<10?"0":"")+h+":00";var dis=blocked&&blocked[h]?" disabled":"";o+='<option value="'+t+'"'+dis+(s.cas===t?" selected":"")+'>'+t+(dis?" (zasedeno)":"")+'</option>';}return o;}
  function todayStr(){var d=new Date();var m=d.getMonth()+1,dd=d.getDate();return d.getFullYear()+"-"+(m<10?"0":"")+m+"-"+(dd<10?"0":"")+dd;}
  async function blockedFor(date){var b={};if(!sb||!date)return b;try{var r=await sb.rpc("zasedeni_termini",{d:date});if(!r.error&&r.data){r.data.forEach(function(t){var h=parseInt(String(t).slice(0,2),10);if(!isNaN(h)){b[h-1]=1;b[h]=1;b[h+1]=1;}});}}catch(e){}return b;}
  async function refreshTimes(){var sel=q$("#cas");if(!sel)return;var hint=q$("#casHint");if(!s.datum){sel.innerHTML='<option value="">Najprej izberi datum</option>';return;}if(hint)hint.textContent="Preverjam razpolozljivost...";var bl=await blockedFor(s.datum);if(bl[parseInt(s.cas,10)])s.cas="";sel.innerHTML='<option value="">Izberi uro</option>'+timeOpts(bl);sel.value=s.cas||"";if(hint)hint.textContent="Zasedeni termini so onemogoceni (kombi je rezerviran 2 uri).";}

  function summaryCard(){
    return '<div class="card summary"><h3>Povzetek naročila</h3>'+
      '<div class="srow"><div class="sk">Storitev</div><div class="sv">'+(s.tip==="izposoja"?"Izposoja":"Skladiščenje")+'</div></div>'+
      '<div class="srow"><div class="sk">Paket</div><div class="sv">'+esc(planLabel())+'</div></div>'+
      '<div class="srow"><div class="sk">Dodatki</div><div class="sv">'+extrasLabel()+'</div></div>'+
      '<div class="total"><span class="muted">Mesečno</span><span class="big">'+eur(monthly())+'</span></div></div>';
  }
  function extrasLabel(){var a=[];if(s.extras.stopnice)a.push("stopnice");if(s.extras.krhko)a.push("krhko");if(s.extras.pomoc)a.push("pomoč pri polnjenju");return a.length?a.join(", "):"Brez";}

  // ---- POVZETEK ----
  function viewPovzetek(){
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>Povzetek</h1>'+
      '<p class="co-sub">Preveri podatke pred oddajo.</p>'+progress("povzetek")+
      '<div class="split"><div class="card">'+
      kv("Storitev",s.tip==="izposoja"?"Izposoja":"Skladiščenje")+
      kv("Paket",planLabel())+
      kv("Cena",cenaOpis())+
      kv("Stopnice (>2 nadstropji)",s.extras.stopnice?"Da":"Ne")+
      kv("Krhki predmeti",s.extras.krhko?"Da":"Ne")+
      kv("Pomoč pri polnjenju",s.extras.pomoc?"Da (25 €/h)":"Ne")+
      kv("Opis lokacije",s.opis||"-")+
      kv("Naslov",(s.naslov||"-")+(s.enota?(", enota "+s.enota):""))+
      kv("Telefon",s.telefon||"-")+
      kv("Termin",(s.datum||"-")+" "+(s.cas||""))+
      '</div>'+summaryCard()+'</div>'+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><button class="btn" id="next">Naprej na račun</button></div>');
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="termin";route();};});
    q$("#next").onclick=function(){s.step="racun";route();};
  }
  function kv(k,v){return '<div class="kv"><span class="k">'+esc(k)+'</span><span class="v">'+esc(v)+'</span></div>';}

  // ---- RACUN ----
  function viewRačun(){ if(s.loggedIn) viewRačunPrijavljen(); else viewRačunGost(); }

  function viewRačunPrijavljen(){
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>Tvoji podatki</h1>'+
      '<p class="co-sub">Prijavljen(a) kot '+esc(s.email)+'. Podatki so izpolnjeni – po želji jih spremeni.</p>'+progress("racun")+
      '<div class="split"><div class="card">'+
      '<div class="rowflex"><div class="field"><label>Ime</label><input id="ime" value="'+esc(s.ime)+'" /></div>'+
      '<div class="field"><label>Priimek</label><input id="priimek" value="'+esc(s.priimek)+'" /></div></div>'+
      '<div class="field"><label>E-pošta</label><input type="email" id="email" value="'+esc(s.email)+'" /></div>'+
      '<div class="alert info">Plačilo (Stripe) bo dodano kmalu. Za zdaj oddaš naročilo brez plačila — poklicali te bomo za potrditev in termin.</div>'+
      '</div>'+summaryCard()+'</div>'+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><button class="btn" id="submit">Oddaj naročilo</button></div>');
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="povzetek";route();};});
    ["ime","priimek","email"].forEach(function(id){q$("#"+id).oninput=function(e){s[id]=e.target.value;};});
    q$("#submit").onclick=submit;
  }

  function viewRačunGost(){
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>Tvoji podatki</h1>'+
      '<p class="co-sub">Ustvari račun za spremljanje naročil – ali se prijavi, če ga že imaš.</p>'+progress("racun")+
      '<div class="split"><div class="card">'+
      '<div class="rowflex" style="margin-bottom:16px">'+
        '<button type="button" class="btn" id="mNovo">Ustvari račun</button>'+
        '<button type="button" class="btn ghost" id="mPrijava">Imam račun</button>'+
      '</div>'+
      (s.loginHint?'<div class="alert info">V novem oknu se prijavi v svoj račun, nato se vrni sem – podatke bomo samodejno izpolnili.</div>':'')+
      '<div class="rowflex"><div class="field"><label>Ime</label><input id="ime" value="'+esc(s.ime)+'" /></div>'+
      '<div class="field"><label>Priimek</label><input id="priimek" value="'+esc(s.priimek)+'" /></div></div>'+
      '<div class="field"><label>E-pošta</label><input type="email" id="email" value="'+esc(s.email)+'" placeholder="ime@primer.si" /></div>'+
      '<div class="field"><label>Geslo (za dostop do panela)</label><input type="password" id="geslo" value="'+esc(s.geslo||"")+'" placeholder="vsaj 6 znakov" minlength="6" /><div class="hint">Ustvarimo ti račun za spremljanje naročil v panelu Moj račun.</div></div>'+
      '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;color:#7b8794;margin:0 0 14px;cursor:pointer"><input type="checkbox" id="soglasje" '+(s.soglasje?"checked":"")+' style="margin-top:2px" /> <span>Soglašam s <a href="../pravila-in-pogoji/index.html" target="_blank" rel="noopener">pogoji poslovanja</a>.</span></label>'+
      '<div class="alert info">Plačilo (Stripe) bo dodano kmalu. Za zdaj oddaš naročilo brez plačila — poklicali te bomo za potrditev in termin.</div>'+
      '</div>'+summaryCard()+'</div>'+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><button class="btn" id="submit">Oddaj naročilo</button></div>');
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="povzetek";route();};});
    ["ime","priimek","email","geslo"].forEach(function(id){q$("#"+id).oninput=function(e){s[id]=e.target.value;};});
    var cb=q$("#soglasje");if(cb)cb.onchange=function(e){s.soglasje=e.target.checked;};
    var mp=q$("#mPrijava");if(mp)mp.onclick=function(){s.loginHint=true;window.open("../Moj-profil/index.html","_blank");route();};
    q$("#submit").onclick=submit;
  }

  async function submit(){
    if(!s.email||s.email.indexOf("@")<0){alert("Prosim vpiši veljaven e-naslov.");return;}
    if(!s.loggedIn){
      if(!s.geslo||s.geslo.length<6){alert("Vpiši geslo (vsaj 6 znakov).");return;}
      if(!s.soglasje){alert("Za ustvarjanje računa moraš soglašati s pogoji poslovanja.");return;}
    }
    var btn=q$("#submit");btn.disabled=true;btn.textContent="Pošiljam...";
    if(s.datum&&s.cas){var _bl=await blockedFor(s.datum);if(_bl[parseInt(s.cas,10)]){alert("Izbrani termin je pravkar zaseden. Prosim izberi drug termin.");btn.disabled=false;btn.textContent="Oddaj naročilo";s.step="termin";route();return;}}
    if(sb&&!s.loggedIn){
      var su=await sb.auth.signUp({email:s.email,password:s.geslo});
      if(su&&su.error&&/registered|exists/i.test(su.error.message)){
        var li2=await sb.auth.signInWithPassword({email:s.email,password:s.geslo});
        if(li2&&li2.error){alert("Ta e-naslov je že registriran. Klikni 'Imam račun' in se prijavi v odprtem oknu.");btn.disabled=false;btn.textContent="Oddaj naročilo";return;}
      }
    }
    var rec={tip:s.tip,paket:planLabel(),st_boxov:(s.tip==="izposoja"?planObj().boxes:s.stBoxov),
      cena_opis:cenaOpis(),stopnice:s.extras.stopnice,krhko:s.extras.krhko,pomoc_polnjenje:s.extras.pomoc,
      opis_lokacije:s.opis||null,naslov:s.naslov||null,enota:s.enota||null,telefon:s.telefon||null,
      datum_dostave:s.datum||null,cas_dostave:s.cas||null,ime:s.ime||null,priimek:s.priimek||null,
      email:s.email,status:"novo"};
    try{
      if(!sb)throw new Error("Supabase ni na voljo.");
      var r=await sb.from("narocila").insert(rec);
      if(r.error)throw r.error;
      var total=Math.round(monthly()*100)/100;
      var osnova=Math.round((total/1.22)*100)/100;
      var ddv=Math.round((total-osnova)*100)/100;
      var now=new Date();
      var stev="RB-"+now.getFullYear()+"-"+now.getTime().toString().slice(-8);
      var zap=new Date();zap.setDate(zap.getDate()+8);
      var zapStr=zap.getFullYear()+"-"+String(zap.getMonth()+1).padStart(2,"0")+"-"+String(zap.getDate()).padStart(2,"0");
      var racun={stevilka:stev,osnova:osnova,ddv:ddv,znesek:total,valuta:"EUR",opis:planLabel()+" - prvi mesec",status:"izdan",email:s.email,ime:s.ime||null,priimek:s.priimek||null,datum_izdaje:todayStr(),datum_zapadlosti:zapStr};
      s.emailSent=false;
      var ri=await sb.from("racuni").insert(racun);
      if(!ri.error){s.racun={stevilka:stev,osnova:osnova,ddv:ddv,znesek:total,zapStr:zapStr};try{var fr=await sb.functions.invoke("poslji-racun",{body:{stevilka:stev}});if(fr&&!fr.error)s.emailSent=true;}catch(e){}}else{console.warn(ri.error);}
      viewDone();
    }catch(e){alert("Napaka pri oddaji: "+(e.message||e));btn.disabled=false;btn.textContent="Oddaj naročilo";}
  }

  function viewDone(){
    var rc=s.racun||{};
    render('<div class="done-wrap">'+
      '<h1 class="co-title">Naročilo oddano!</h1>'+
      '<p class="co-sub">Hvala, '+esc(s.ime||"")+'. Tvoje naročilo smo prejeli'+(s.emailSent?" in ti na e-pošto poslali račun":"")+'. Kmalu te pokličemo za potrditev termina.</p>'+
      '<div class="card" style="text-align:left;max-width:470px;margin:0 auto">'+
      kv("Storitev",s.tip==="izposoja"?"Izposoja":"Skladiščenje")+kv("Paket",planLabel())+
      kv("Termin",(s.datum||"-")+" "+(s.cas||""))+
      (rc.stevilka?('<div style="border-top:1px solid var(--line);margin:6px 0 2px"></div>'+kv("Račun št.",rc.stevilka)+kv("Osnova",eur(rc.osnova))+kv("DDV (22%)",eur(rc.ddv))+kv("Za plačilo",eur(rc.znesek))+kv("Rok plačila",rc.zapStr)):"")+
      '</div>'+
      (s.emailSent?'':'<p class="muted" style="font-size:12.5px;margin-top:10px">Račun je shranjen; e-pošto s podatki pošljemo po potrditvi.</p>')+
      '<div class="mt"><a class="btn" href="../index.html">Nazaj na domačo stran</a></div></div>');
  }

  function infoBlock(){
    return '<div class="info-2"><div><h4>Koliko prostora potrebujem?</h4><p>Shranjujete lahko do meje izbranega paketa. Pri skladiščenju je minimalno obdobje 3 mesece.</p></div>'+
      '<div><h4>Prevzemi in dostave</h4><p>Dostave in prevzemi so od ponedeljka do sobote. Termin uskladimo vsaj 48 ur vnaprej.</p></div></div>';
  }

  function q$(sel){return APP.querySelector(sel);}
  function q$all(sel){return Array.prototype.slice.call(APP.querySelectorAll(sel));}

  function route(){
    window.scrollTo(0,0);
    if(s.step==="choice")viewChoice();
    else if(s.step==="paketi")viewPaketi();
    else if(s.step==="dodatki")viewDodatki();
    else if(s.step==="termin")viewTermin();
    else if(s.step==="povzetek")viewPovzetek();
    else if(s.step==="racun")viewRačun();
  }

  function loadKupci(email){
    if(!sb||!email)return Promise.resolve();
    return sb.from("kupci").select("ime,priimek,telefon,naslov").eq("email",email).limit(1).maybeSingle().then(function(kr){
      if(kr&&kr.data){
        if(!s.ime)s.ime=kr.data.ime||"";
        if(!s.priimek)s.priimek=kr.data.priimek||"";
        if(!s.telefon)s.telefon=kr.data.telefon||"";
        if(!s.naslov)s.naslov=kr.data.naslov||"";
      }
    }).catch(function(){});
  }
  async function loadSession(){
    if(!sb)return;
    try{
      var r=await sb.auth.getSession();
      var session=(r&&r.data)?r.data.session:null;
      if(session&&session.user){
        s.loggedIn=true;s.loginHint=false;
        if(!s.email)s.email=session.user.email||"";
        await loadKupci(session.user.email);
      }else{s.loggedIn=false;}
    }catch(e){}
  }
  function subscribeAuth(){
    if(!sb||!sb.auth||!sb.auth.onAuthStateChange)return;
    sb.auth.onAuthStateChange(function(event,session){
      if(session&&session.user){
        s.loggedIn=true;s.loginHint=false;
        if(!s.email)s.email=session.user.email||"";
        loadKupci(session.user.email).then(function(){if(s.step==="racun")route();});
      }else{s.loggedIn=false;}
    });
  }
  if(!sb){render('<div class="alert err" style="max-width:520px;margin:40px auto">Ni bilo mogoče naložiti Supabase. Preveri internetno povezavo in js/config.js.</div>');}
  else{ loadSession().then(function(){route();subscribeAuth();}); }
})();
