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
    {id:"skl10",naziv:"Do 10 boxov",min:1,max:10,perBox:3.90},
    {id:"skl25",naziv:"Do 25 boxov",min:11,max:25,perBox:3.60},
    {id:"skl50",naziv:"Do 50 boxov",min:26,max:50,perBox:3.30},
    {id:"sklkontakt",naziv:"Nad 50 boxov",contact:true}
  ];
  var STEPS=[["paketi","Paketi"],["termin","Termin"],["povzetek","Povzetek"],["racun","Račun"]];

  var s={step:"choice",tip:null,plan:null,stBoxov:null,extras:{stopnice:false,krhko:false,pomoc:false,dvigalo:false},
    opis:"",nadstropje:"",naslov:"",enota:"",postna:"",mesto:"",telefon:"",datum:"",cas:"",ime:"",priimek:"",email:"",geslo:"",racunMode:"novo",soglasje:false,loggedIn:false,loginHint:false};

  var LJ_POSTE=["1000","1210","1211","1215","1231","1235","1236","1260","1261","1262","1290","1291","1292","1293","1294","1295","1296","1351","1354","1355","1356","1357","1358","1360","1370"];

  (function(){var qp=new URLSearchParams(location.search);var t=qp.get("tip");if(t==="izposoja"||t==="skladiscenje"){s.tip=t;s.plan=null;s.stBoxov=null;s.step="paketi";}})();

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
  function cenaOpis(){var p=planObj();if(!p)return "";return s.tip==="izposoja"?(eur(p.cena)+" mesečno"):((s.stBoxov||0)+" × "+eur(p.perBox)+" = "+eur(monthly())+" mesečno");}

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
      var unit=izp?"mesečno":"1 box / 1 mesec";
      var desc=izp?("Najem "+p.boxes+" boxov"):("do "+p.max+" boxov");
      return '<div class="plan'+sel+'"><div class="pic"><img src="Slike/Skatle.png" alt="box" /></div><div class="pt">'+esc(p.naziv)+'</div>'+
        '<div class="pd">'+esc(desc)+'</div><div class="pp">'+price+'</div><div class="pu">'+unit+'</div>'+
        '<button class="btn small selbtn" data-id="'+p.id+'">Izberi</button></div>';
    }).join("");
    var boxSel="";
    if(!izp&&s.plan){var p=planObj();var pmin=p.min||1;boxSel='<div class="card mt" style="max-width:460px;margin:18px auto 0"><div class="field"><label>Koliko boxov shranjuješ? ('+pmin+'–'+p.max+')</label><input type="number" id="stBoxov" min="'+pmin+'" max="'+p.max+'" value="'+(s.stBoxov||"")+'" placeholder="npr. '+pmin+'" /></div><div class="center muted" id="cenaCalc">'+(s.stBoxov?("Mesečno: "+eur(monthly())):"Vpiši število boxov")+'</div><div class="hint" style="margin-top:8px">Zaračunavamo samo število polnih boxov. Primer: če naročite 20 boxov in jih napolnite 10, se vam obračuna skladišče za 10 boxov.</div></div>';}
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>'+(izp?"Paketi izposoje":"Paketi skladiščenja")+'</h1>'+
      '<p class="co-sub">Najprej izberi paket'+(izp?"":", nato vpiši število boxov")+'.</p>'+
      progress("paketi")+'<div class="plan-grid">'+cards+'</div>'+boxSel+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><button class="btn" id="next" '+(canNextPaketi()?"":"disabled")+'>Naprej</button></div>'+
      infoBlock());
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="choice";route();};});
    q$all(".selbtn").forEach(function(b){b.onclick=function(){s.plan=b.getAttribute("data-id");if(s.tip==="izposoja"){s.step="termin";route();}else{route();}};});
    var bx=q$("#stBoxov");if(bx){bx.oninput=function(){var v=parseInt(bx.value,10);var p=planObj();if(v>p.max)v=p.max;s.stBoxov=isNaN(v)?null:v;var c=q$("#cenaCalc");if(c)c.textContent=s.stBoxov?("Mesečno: "+eur(monthly())):"Vpiši število boxov";var n=q$("#next");if(n)n.disabled=!canNextPaketi();};
      bx.onchange=function(){var p=planObj();var pmin=p.min||1;if(s.stBoxov&&s.stBoxov<pmin){s.stBoxov=pmin;bx.value=pmin;var c=q$("#cenaCalc");if(c)c.textContent="Mesečno: "+eur(monthly());var n=q$("#next");if(n)n.disabled=!canNextPaketi();}};}
    var nb=q$("#next");if(nb)nb.onclick=function(){if(canNextPaketi()){s.step="termin";route();}};
  }
  function canNextPaketi(){if(!s.plan)return false;if(s.tip==="skladiscenje"){var p=planObj();if(!p)return false;var pmin=p.min||1;return !!s.stBoxov&&s.stBoxov>=pmin&&s.stBoxov<=p.max;}return true;}

  // ---- DODATKI ----
  function viewDodatki(){
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>Dodatne informacije</h1>'+
      '<p class="co-sub">Nekaj podrobnosti, da bo dostava/prevzem potekal gladko.</p>'+progress("dodatki")+
      xrow("stairs","stopnice","Potrebujete dostop čez več kot 2 nadstropji stopnic?","")+
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
  function ljAllowed(){
    var pz=(s.postna||"").trim();
    var mesto=(s.mesto||"").toLowerCase();
    return LJ_POSTE.indexOf(pz)>=0 || mesto.indexOf("ljubljana")>=0;
  }
  function terminNavHtml(){
    var ok=ljAllowed();
    return '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button>'+
      (ok?'<button class="btn" id="next">Naprej</button>'
         :'<a class="btn" href="mailto:info@rabimbox.si?subject='+encodeURIComponent("Povpraševanje – dostava izven Ljubljane")+'">Kontaktiraj nas</a>')+
      '</div>'+
      (ok?'':'<p class="muted" style="text-align:center;font-size:13px;margin-top:10px">Online naročilo je trenutno možno samo za stranke v Ljubljani in okolici. Za druge lokacije nas kontaktirajte.</p>');
  }
  function bindTerminNav(){
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="paketi";route();};});
    var nb=q$("#next");
    if(nb)nb.onclick=function(){
      if(!s.ime||!s.priimek||!s.naslov||!s.postna||!s.mesto||!s.telefon){alert("Prosim izpolni ime, priimek, naslov, poštno številko, mesto in telefon.");return;}
      if(!s.email||s.email.indexOf("@")<1){alert("Prosim vpiši veljaven e-naslov.");return;}
      if(!s.datum||!s.cas){alert("Prosim izberi datum in uro.");return;}
      if(s.datum<todayStr()){alert("Datum ne more biti v preteklosti.");return;}
      s.step="povzetek";route();
    };
  }
  function refreshTerminNav(){var w=q$("#terminNav");if(w){w.innerHTML=terminNavHtml();bindTerminNav();}}
  function viewTermin(){
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>Termin dostave</h1>'+
      '<p class="co-sub">Vpiši kontaktne podatke, naslov ter izberi datum in uro.</p>'+progress("termin")+
      '<div class="split"><div class="card">'+
      '<div class="rowflex"><div class="field"><label>Ime</label><input id="ime" value="'+esc(s.ime)+'" /></div>'+
      '<div class="field"><label>Priimek</label><input id="priimek" value="'+esc(s.priimek)+'" /></div></div>'+
      '<div class="field"><label>Naslov za dostavo</label><input id="naslov" value="'+esc(s.naslov)+'" placeholder="Ulica in hišna številka" /></div>'+
      '<div class="rowflex"><div class="field" style="max-width:150px"><label>Poštna številka</label><input id="postna" value="'+esc(s.postna)+'" placeholder="1000" /></div>'+
      '<div class="field"><label>Mesto</label><input id="mesto" value="'+esc(s.mesto)+'" placeholder="Ljubljana" /></div></div>'+
      '<div class="rowflex"><div class="field"><label>Telefon</label><input id="telefon" value="'+esc(s.telefon)+'" placeholder="+386..." /></div>'+
      '<div class="field"><label>E-pošta</label><input type="email" id="email" value="'+esc(s.email)+'" placeholder="ime@primer.si" /></div></div>'+
      '<div class="rowflex"><div class="field"><label>Datum</label><input type="date" id="datum" min="'+todayStr()+'" value="'+esc(s.datum)+'" /></div>'+
      '<div class="field"><label>Ura</label><select id="cas"><option value="">Najprej izberi datum</option></select><div class="hint" id="casHint"></div></div></div>'+
      '<div class="field mt"><label>Vrsta objekta</label><textarea id="opis" rows="2" placeholder="Npr: Hiša, večstanovanjska hiša, blok, poslovni objekt,…">'+esc(s.opis)+'</textarea></div>'+
      '<div class="field mt"><label>Katero nadstropje?</label><textarea id="nadstropje" rows="2" placeholder="Npr: pritličje, 2. nadstropje,…">'+esc(s.nadstropje)+'</textarea></div>'+
      xrow("truck","dvigalo","Je v objektu dvigalo?","")+
      '</div>'+summaryCard()+'</div>'+
      '<div id="terminNav">'+terminNavHtml()+'</div>');
    ["ime","priimek","naslov","postna","mesto","telefon","email"].forEach(function(id){var e=q$("#"+id);if(e)e.oninput=function(ev){s[id]=ev.target.value;if(id==="postna"||id==="mesto")refreshTerminNav();};});
    q$all(".sw").forEach(function(sw){sw.onclick=function(){var k=sw.getAttribute("data-k");s.extras[k]=!s.extras[k];sw.classList.toggle("on",s.extras[k]);};});
    var op=q$("#opis");if(op)op.oninput=function(e){s.opis=e.target.value;};
    var nd=q$("#nadstropje");if(nd)nd.oninput=function(e){s.nadstropje=e.target.value;};
    q$("#datum").onchange=function(e){s.datum=e.target.value;s.cas="";refreshTimes();};
    q$("#cas").onchange=function(e){s.cas=e.target.value;};
    if(s.datum)refreshTimes();
    bindTerminNav();
  }
  function timeOpts(blocked){var o="";for(var h=10;h<=14;h++){var t=(h<10?"0":"")+h+":00";var dis=blocked&&blocked[h]?" disabled":"";o+='<option value="'+t+'"'+dis+(s.cas===t?" selected":"")+'>'+t+(dis?" (zasedeno)":"")+'</option>';}return o;}
  function todayStr(){var d=new Date();var m=d.getMonth()+1,dd=d.getDate();return d.getFullYear()+"-"+(m<10?"0":"")+m+"-"+(dd<10?"0":"")+dd;}
  async function blockedFor(date){var b={};if(!sb||!date)return b;try{var r=await sb.rpc("zasedeni_termini",{d:date});if(!r.error&&r.data){r.data.forEach(function(t){var h=parseInt(String(t).slice(0,2),10);if(!isNaN(h)){b[h]=1;}});}}catch(e){}return b;}
  async function refreshTimes(){var sel=q$("#cas");if(!sel)return;var hint=q$("#casHint");if(!s.datum){sel.innerHTML='<option value="">Najprej izberi datum</option>';return;}if(hint)hint.textContent="Preverjam razpolozljivost...";var bl=await blockedFor(s.datum);if(bl[parseInt(s.cas,10)])s.cas="";sel.innerHTML='<option value="">Izberi uro</option>'+timeOpts(bl);sel.value=s.cas||"";if(hint)hint.textContent="Zasedeni termini so onemogočeni (dostava traja 1 uro).";}

  function summaryCard(){
    return '<div class="card summary"><h3>Povzetek naročila</h3>'+
      '<div class="srow"><div class="sk">Storitev</div><div class="sv">'+(s.tip==="izposoja"?"Izposoja":"Skladiščenje")+'</div></div>'+
      '<div class="srow"><div class="sk">Paket</div><div class="sv">'+esc(planLabel())+'</div></div>'+
      '<div class="srow"><div class="sk">Dodatki</div><div class="sv">'+extrasLabel()+'</div></div>'+
      '<div class="total"><span class="muted">Mesečno</span><span class="big">'+eur(monthly())+'</span></div>'+
      '<input type="text" id="hp_order" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" /></div>';
  }
  function extrasLabel(){var a=[];if(s.extras.pomoc)a.push("pomoč pri polnjenju");return a.length?a.join(", "):"Brez";}
  function fmtDatum(d){if(!d)return "-";var p=String(d).slice(0,10).split("-");return p.length===3?(p[2]+". "+p[1]+". "+p[0]):String(d);}

  // ---- POVZETEK ----
  function viewPovzetek(){
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>Povzetek</h1>'+
      '<p class="co-sub">Preveri podatke pred oddajo.</p>'+progress("povzetek")+
      '<div class="split"><div class="card">'+
      kv("Storitev",s.tip==="izposoja"?"Izposoja":"Skladiščenje")+
      kv("Paket",planLabel())+
      kv("Cena",cenaOpis())+
      kv("Vrsta objekta",s.opis||"-")+
      kv("Nadstropje",s.nadstropje||"-")+
      kv("Dvigalo",s.extras.dvigalo?"Da":"Ne")+
      kv("Naslov",s.naslov||"-")+
      kv("Poštna številka",s.postna||"-")+
      kv("Mesto",s.mesto||"-")+
      kv("Telefon",s.telefon||"-")+
      kv("Termin",fmtDatum(s.datum)+" "+(s.cas||""))+
      '</div>'+summaryCard()+'</div>'+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn ghost" id="inquiry">Oddaj povpraševanje</button>'+(s.loggedIn?'<button class="btn" id="pay">Plačilo</button>':'<button class="btn" id="next">Registracija in plačilo</button>')+'</div></div>');
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="termin";route();};});
    var pb=q$("#pay");if(pb)pb.onclick=submit;
    var nx=q$("#next");if(nx)nx.onclick=function(){s.step="racun";route();};
    var iq=q$("#inquiry");if(iq)iq.onclick=function(){s.step="povprasevanje";route();};
  }
  function kv(k,v){return '<div class="kv"><span class="k">'+esc(k)+'</span><span class="v">'+esc(v)+'</span></div>';}

  // ---- POVPRAŠEVANJE ----
  function viewPovprasevanje(){
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>Oddaj povpraševanje</h1>'+
      '<p class="co-sub">Pustite sporočilo in kontaktirali vas bomo v najkrajšem možnem času.</p>'+
      '<div class="card" style="max-width:560px;margin:0 auto">'+
      '<div class="rowflex"><div class="field"><label>Ime</label><input id="pv_ime" value="'+esc(s.ime)+'" /></div>'+
      '<div class="field"><label>Priimek</label><input id="pv_priimek" value="'+esc(s.priimek)+'" /></div></div>'+
      '<div class="field"><label>E-pošta</label><input type="email" id="pv_email" value="'+esc(s.email)+'" placeholder="ime@primer.si" /></div>'+
      '<div class="field"><label>Telefon</label><input id="pv_telefon" value="'+esc(s.telefon)+'" placeholder="+386..." /></div>'+
      '<div class="field"><label>Vprašanje</label><textarea id="pv_vprasanje" rows="4" placeholder="Kako vam lahko pomagamo?"></textarea></div>'+
      '<input type="text" id="hp_pv" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" /><div id="pv_err"></div>'+
      '</div>'+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><button class="btn" id="pvSend">Pošlji povpraševanje</button></div>');
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="povzetek";route();};});
    q$("#pvSend").onclick=submitPovprasevanje;
  }
  async function submitPovprasevanje(){
    if(q$("#hp_pv")&&q$("#hp_pv").value){return;}
    var ime=q$("#pv_ime").value.trim(),priimek=q$("#pv_priimek").value.trim(),email=q$("#pv_email").value.trim(),tel=q$("#pv_telefon").value.trim(),vpr=q$("#pv_vprasanje").value.trim();
    if(!vpr){q$("#pv_err").innerHTML='<div class="alert err">Prosim vpiši vprašanje.</div>';return;}
    var btn=q$("#pvSend");btn.disabled=true;btn.textContent="Pošiljam...";
    s.ime=ime;s.priimek=priimek;s.email=email;s.telefon=tel;
    var rec={ime:ime||null,priimek:priimek||null,email:email||null,telefon:tel||null,vprasanje:vpr,paket:planLabel(),tip:s.tip};
    try{
      if(!sb)throw new Error("Supabase ni na voljo.");
      var r=await sb.from("povprasevanja").insert(rec);
      if(r.error)throw r.error;
      render('<div class="done-wrap"><div class="done-check">'+ICON.check+'</div>'+
        '<h1 class="co-title">Hvala!</h1><p class="co-sub">Kontaktirali vas bomo v najkrajšem možnem času.</p>'+
        '<div class="mt"><a class="btn" href="../index.html">Nazaj na domačo stran</a></div></div>');
    }catch(e){
      var body=encodeURIComponent("Ime: "+ime+" "+priimek+"\nE-pošta: "+email+"\nTelefon: "+tel+"\nPaket: "+planLabel()+" ("+(s.tip||"")+")\n\nVprašanje:\n"+vpr);
      window.location.href="mailto:info@rabimbox.si?subject="+encodeURIComponent("Povpraševanje – Rabimbox")+"&body="+body;
      btn.disabled=false;btn.textContent="Pošlji povpraševanje";
    }
  }

  // ---- RACUN ----
  function viewRačun(){ if(s.loggedIn) viewRačunPrijavljen(); else viewRačunGost(); }

  function viewRačunPrijavljen(){
    render('<h1 class="co-title"><button class="back-inline" data-back>‹</button>Tvoji podatki</h1>'+
      '<p class="co-sub">Prijavljen(a) kot '+esc(s.email)+'. Podatki so izpolnjeni – po želji jih spremeni.</p>'+progress("racun")+
      '<div class="split"><div class="card">'+
      '<div class="rowflex"><div class="field"><label>Ime</label><input id="ime" value="'+esc(s.ime)+'" /></div>'+
      '<div class="field"><label>Priimek</label><input id="priimek" value="'+esc(s.priimek)+'" /></div></div>'+
      '<div class="field"><label>E-pošta</label><input type="email" id="email" value="'+esc(s.email)+'" /></div>'+
      '<div class="alert info">Po oddaji te preusmerimo na varno plačilo prvega meseca (Stripe).</div>'+
      '</div>'+summaryCard()+'</div>'+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><button class="btn" id="submit">Plačilo</button></div>');
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
      '<div class="alert info">Po oddaji te preusmerimo na varno plačilo prvega meseca (Stripe).</div>'+
      '</div>'+summaryCard()+'</div>'+
      '<div class="nav-btns"><button class="btn ghost" data-back>Nazaj</button><button class="btn" id="submit">Plačilo</button></div>');
    q$all("[data-back]").forEach(function(b){b.onclick=function(){s.step="povzetek";route();};});
    ["ime","priimek","email","geslo"].forEach(function(id){q$("#"+id).oninput=function(e){s[id]=e.target.value;};});
    var cb=q$("#soglasje");if(cb)cb.onchange=function(e){s.soglasje=e.target.checked;};
    var mp=q$("#mPrijava");if(mp)mp.onclick=function(){s.loginHint=true;window.open("../Moj-profil/index.html","_blank");route();};
    q$("#submit").onclick=submit;
  }

  async function submit(){
    var _hp=q$("#hp_order"); if(_hp&&_hp.value){return;}
    if(!s.email||s.email.indexOf("@")<0||!s.ime||!s.priimek||!s.naslov||!s.postna||!s.mesto||!s.telefon||!s.datum||!s.cas){alert("Prosim izpolni vse podatke in termin (korak Termin).");s.step="termin";route();return;}
    if(!s.loggedIn){
      if(!s.geslo||s.geslo.length<6){alert("Vpiši geslo (vsaj 6 znakov) za svoj račun.");s.step="racun";route();return;}
      if(!s.soglasje){alert("Za ustvarjanje računa moraš soglašati s pogoji poslovanja.");s.step="racun";route();return;}
    }
    var btn=q$("#pay")||q$("#submit");if(btn){btn.disabled=true;btn.textContent="Pošiljam...";}
    if(s.datum&&s.cas){var _bl=await blockedFor(s.datum);if(_bl[parseInt(s.cas,10)]){alert("Izbrani termin je pravkar zaseden. Prosim izberi drug termin.");if(btn){btn.disabled=false;btn.textContent="Plačilo";}s.step="termin";route();return;}}
    if(sb&&!s.loggedIn){
      var su=await sb.auth.signUp({email:s.email,password:s.geslo});
      if(su&&su.error&&/registered|exists/i.test(su.error.message)){
        var li2=await sb.auth.signInWithPassword({email:s.email,password:s.geslo});
        if(li2&&li2.error){alert("Ta e-naslov je že registriran. Klikni 'Imam račun' in se prijavi v odprtem oknu.");if(btn){btn.disabled=false;btn.textContent="Plačilo";}return;}
      }
    }
    var now=new Date();
    var ref="RB-"+now.getFullYear()+"-"+now.getTime().toString().slice(-8);
    var rec={tip:s.tip,paket:planLabel(),st_boxov:(s.tip==="izposoja"?planObj().boxes:s.stBoxov),
      cena_opis:cenaOpis(),stopnice:false,krhko:false,pomoc_polnjenje:s.extras.pomoc,
      opis_lokacije:("Vrsta objekta: "+(s.opis||"-")+" | Nadstropje: "+(s.nadstropje||"-")+" | Dvigalo: "+(s.extras.dvigalo?"Da":"Ne")),naslov:s.naslov||null,enota:null,postna_stevilka:s.postna||null,mesto:s.mesto||null,telefon:s.telefon||null,
      datum_dostave:s.datum||null,cas_dostave:s.cas||null,ime:s.ime||null,priimek:s.priimek||null,
      email:s.email,stevilka:ref,placano:false,status:"nova"};
    try{
      if(!sb)throw new Error("Supabase ni na voljo.");
      var r=await sb.from("narocila").insert(rec);
      if(r.error)throw r.error;
      // Stripe plačilo (Checkout) – preusmeritev na varno plačilno stran
      try{
        var scr=null,lastErr=null;
        var _slugs=["rapid-api","stripe-checkout","Stripe-checkout"];
        for(var _i=0;_i<_slugs.length;_i++){
          try{
            scr=await sb.functions.invoke(_slugs[_i],{body:{ref:ref,pageUrl:location.origin+location.pathname}});
            if(scr&&!scr.error&&scr.data&&scr.data.url){window.location.href=scr.data.url;return;}
            lastErr=scr&&scr.error?(scr.error.message||"stripe"):"stripe";
          }catch(_e){lastErr=(_e&&_e.message)?_e.message:String(_e);}
        }
        throw new Error(lastErr||"stripe");
      }catch(se){
        console.warn("Stripe checkout ni uspel (preusmeritev preskočena):", (se&&se.message)?se.message:se);
        // Stripe (še) ni na voljo -> zaključimo brez spletnega plačila in izdamo račun
        var total=Math.round(monthly()*100)/100;
        var osnova=Math.round((total/1.22)*100)/100;
        var ddv=Math.round((total-osnova)*100)/100;
        var zap=new Date();zap.setDate(zap.getDate()+8);
        var zapStr=zap.getFullYear()+"-"+String(zap.getMonth()+1).padStart(2,"0")+"-"+String(zap.getDate()).padStart(2,"0");
        var racun={stevilka:ref,osnova:osnova,ddv:ddv,znesek:total,valuta:"EUR",opis:planLabel()+" - prvi mesec",status:"izdan",email:s.email,ime:s.ime||null,priimek:s.priimek||null,datum_izdaje:todayStr(),datum_zapadlosti:zapStr};
        s.emailSent=false;
        var ri=await sb.from("racuni").insert(racun);
        if(!ri.error){s.racun={stevilka:ref,osnova:osnova,ddv:ddv,znesek:total,zapStr:zapStr};try{var fr=await sb.functions.invoke("poslji-racun",{body:{stevilka:ref}});if(fr&&!fr.error)s.emailSent=true;}catch(e){}}else{console.warn(ri.error);}
        viewDone();
      }
    }catch(e){alert("Napaka pri oddaji: "+(e.message||e));btn.disabled=false;btn.textContent="Plačilo";}
  }

  function viewDone(){
    var rc=s.racun||{};
    render('<div class="done-wrap">'+
      '<h1 class="co-title">Naročilo oddano!</h1>'+
      '<p class="co-sub">Hvala, '+esc(s.ime||"")+'. Tvoje naročilo smo prejeli'+(s.emailSent?" in ti na e-pošto poslali račun":"")+'. Kmalu te pokličemo za potrditev termina.</p>'+
      '<div class="card" style="text-align:left;max-width:470px;margin:0 auto">'+
      kv("Storitev",s.tip==="izposoja"?"Izposoja":"Skladiščenje")+kv("Paket",planLabel())+
      kv("Termin",fmtDatum(s.datum)+" "+(s.cas||""))+
      (rc.stevilka?('<div style="border-top:1px solid var(--line);margin:6px 0 2px"></div>'+kv("Račun št.",rc.stevilka)+kv("Osnova",eur(rc.osnova))+kv("DDV (22%)",eur(rc.ddv))+kv("Za plačilo",eur(rc.znesek))+kv("Rok plačila",rc.zapStr)):"")+
      '</div>'+
      (s.emailSent?'':'<p class="muted" style="font-size:12.5px;margin-top:10px">Račun je shranjen; e-pošto s podatki pošljemo po potrditvi.</p>')+
      '<div class="mt"><a class="btn" href="../index.html">Nazaj na domačo stran</a></div></div>');
  }

  function znesekZaNarocilo(o){
    var tip=String(o.tip||"").toLowerCase();var n=Number(o.st_boxov)||0;
    if(tip.indexOf("izpos")>-1){var m={20:49,40:89,60:119,80:149};return m[n]||0;}
    var per=n<=10?3.90:n<=25?3.60:3.30;return Math.round(n*per*100)/100;
  }
  async function potrdiPlacilo(ref){
    // Ob vrnitvi s Stripe označi naročilo kot plačano in izda račun.
    if(!sb||!ref)return;
    // 1) Strežniška potrditev (service-role -> obide RLS; preveri sejo pri Stripe)
    var sid=new URLSearchParams(location.search).get("session_id");
    if(sid){
      var slugs=["rapid-api","stripe-checkout","Stripe-checkout"];
      for(var i=0;i<slugs.length;i++){
        try{ var cr=await sb.functions.invoke(slugs[i],{body:{confirm:true,session_id:sid}});
          if(cr&&!cr.error&&cr.data&&cr.data.ok){ return; }
        }catch(e){}
      }
    }
    // 2) Rezerva: samo poskus posodobitve naročila (račun izda strežniška potrditev/webhook).
    //    Namenoma NE ustvarimo računa iz brskalnika, da ne pride do neskladja
    //    (plačan račun + neplačano naročilo, če RLS blokira update naročila).
    try{
      await loadSession();
      await sb.from("narocila").update({placano:true}).eq("stevilka",ref);
    }catch(e){console.warn("potrdiPlacilo:",(e&&e.message)?e.message:e);}
  }
  function viewPlacanoUspeh(ref){
    render('<div class="done-wrap"><div class="done-check">'+ICON.check+'</div>'+
      '<h1 class="co-title">Plačilo uspešno!</h1>'+
      '<p class="co-sub">Hvala za naročilo. Račun ti pošljemo na e-pošto.'+(ref?' Številka naročila: <b>'+esc(ref)+'</b>.':'')+' Kmalu te pokličemo za potrditev termina.</p>'+
      '<div class="mt"><a class="btn" href="../index.html">Nazaj na domačo stran</a> <a class="btn ghost" href="../Moj-profil/index.html">Moj račun</a></div></div>');
    potrdiPlacilo(ref);
  }
  function viewPlacanoPreklic(ref){
    render('<div class="done-wrap">'+
      '<h1 class="co-title">Plačilo preklicano</h1>'+
      '<p class="co-sub">Plačilo ni bilo dokončano, zato naročilo ni potrjeno. Lahko poskusiš znova.</p>'+
      '<div class="mt"><a class="btn" href="index.html">Nazaj na naročilo</a> <a class="btn ghost" href="../index.html">Domov</a></div></div>');
  }

  function infoBlock(){
    var levo;
    if(s.tip==="izposoja"){
      levo='<h4>Koliko boxov potrebujem?</h4><p>Velikost našega zaboja je: Dolžina: 60, Širina: 40, Višina: 44 cm. Da pa boste lažje načrtovali in najeli pravilno število box-ov, si lahko pomagate z našimi splošnimi smernicami o številu škatel: Garsonjera: 15–30 boxov, 1-sobno stanovanje: 30–40 boxov, 2-sobno stanovanje: 40–60 boxov, 3-sobno stanovanje: 60–80 boxov.</p>';
    }else{
      levo='<h4>Kaj lahko shranjujem?</h4><p>Shranjujete lahko vse stvari, ki jih lahko spravite v naš box velikosti: Dolžine: 60, Širine: 40, Višine: 44 cm. Prepovedano je shranjevati krhke predmete, hrano in pijačo, vnetljive predmete, kemikalije in vse predmete, ki so zakonsko prepovedani.</p>';
    }
    return '<div class="info-2"><div>'+levo+'</div>'+
      '<div><h4>Prevzemi in dostave</h4><p>Dostave in prevzemi so od ponedeljka do petka. Termin uskladimo vsaj 48 ur vnaprej.</p></div></div>';
  }

  function q$(sel){return APP.querySelector(sel);}
  function q$all(sel){return Array.prototype.slice.call(APP.querySelectorAll(sel));}

  function route(){
    window.scrollTo(0,0);
    if(document.body)document.body.classList.toggle("bg-choice", s.step==="choice");
    if(s.step==="choice")viewChoice();
    else if(s.step==="paketi")viewPaketi();
    else if(s.step==="dodatki")viewDodatki();
    else if(s.step==="termin")viewTermin();
    else if(s.step==="povzetek")viewPovzetek();
    else if(s.step==="povprasevanje")viewPovprasevanje();
    else if(s.step==="racun")viewRačun();
  }

  function loadKupci(email){
    if(!sb||!email)return Promise.resolve();
    return sb.from("kupci").select("ime,priimek,telefon,naslov,postna_stevilka,kraj").eq("email",email).limit(1).maybeSingle().then(function(kr){
      if(kr&&kr.data){
        if(!s.ime)s.ime=kr.data.ime||"";
        if(!s.priimek)s.priimek=kr.data.priimek||"";
        if(!s.telefon)s.telefon=kr.data.telefon||"";
        if(!s.naslov)s.naslov=kr.data.naslov||"";
        if(!s.postna)s.postna=kr.data.postna_stevilka||"";
        if(!s.mesto)s.mesto=kr.data.kraj||"";
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
  var _qp=new URLSearchParams(location.search);var _pl=_qp.get("placilo");
  if(!sb){render('<div class="alert err" style="max-width:520px;margin:40px auto">Ni bilo mogoče naložiti Supabase. Preveri internetno povezavo in js/config.js.</div>');}
  else if(_pl==="uspeh"){ viewPlacanoUspeh(_qp.get("ref")); }
  else if(_pl==="preklic"){ viewPlacanoPreklic(_qp.get("ref")); }
  else{ loadSession().then(function(){route();subscribeAuth();}); }
})();
