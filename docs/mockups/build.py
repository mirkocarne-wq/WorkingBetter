#!/usr/bin/env python3
"""Genera le schermate mockup (HTML statico) di WorkingBetter a partire dai template qui sotto.
Uso: python3 build.py  → scrive 0N-*.html nella stessa cartella. Poi: node render.mjs → png/."""
import pathlib

ICON = {
 'home':'<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/></svg>',
 'target':'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
 'chat':'<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/></svg>',
 'heart':'<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/></svg>',
 'star':'<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/></svg>',
 'up':'<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
 'poll':'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 12h8M8 8h8M8 16h5"/></svg>',
 'gift':'<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 13h18M12 8c-2-4-6-4-6-1s4 1 6 1zm0 0c2-4 6-4 6-1s-4 1-6 1z"/></svg>',
 'users':'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M16 4a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-5-6.7"/></svg>',
 'chart':'<svg viewBox="0 0 24 24"><path d="M3 20h18M5 16l4-5 4 3 6-8"/></svg>',
 'grid':'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
 'cog':'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5A7 7 0 0 0 19 12z"/></svg>',
}
NAV = [
 ('home','Home','dashboard'),('target','Obiettivi','obiettivi'),('chat','1:1','one'),('heart','Feedback','feedback'),
 ('star','Review','review'),('up','Sviluppo','sviluppo'),('poll','Survey','survey'),('gift','Welfare','welfare'),('users','Persone','persone'),
 ('SEC','Amministrazione',''),('chart','Reportistica','report'),('grid','App Studio','studio'),('cog','Impostazioni','imp'),
]

def shell(title, active, body, user=('Giulia Ferri','Engineering Manager','GF')):
    nav=[]
    for ic,label,key in NAV:
        if ic=='SEC': nav.append(f'<div class="sec">{label}</div>'); continue
        nav.append(f'<a class="{"on" if key==active else ""}">{ICON[ic]}{label}</a>')
    return f'''<!doctype html><html lang="it"><head><meta charset="utf-8"><title>{title} · WorkingBetter</title><link rel="stylesheet" href="style.css"></head>
<body><div class="app">
<aside class="side"><div class="logo"><i></i>WorkingBetter</div><nav class="nav">{''.join(nav)}</nav>
<div class="me"><span class="av">{user[2]}</span><div><div style="font-weight:600">{user[0]}</div><div style="font-size:12px;color:var(--muted)">{user[1]}</div></div></div></aside>
<header class="top"><div class="search">🔍 Cerca persone, obiettivi, report…</div><span class="sp"></span><span class="pill n">Acme S.p.A.</span><span class="pill b">IT</span><span style="color:var(--muted)">🔔</span><span class="av">{user[2]}</span></header>
<main>{body}</main></div></body></html>'''

def W(name, html): pathlib.Path(name).write_text(html)

# ---------- 01 Dashboard manager ----------
W('01-dashboard-manager.html', shell('Home','dashboard','''
<div class="ph"><div><h1>Buongiorno, Giulia</h1><p>Sabato 13 settembre · Q3 2026 · 7 persone nel team</p></div><div><span class="btn">＋ Dai un feedback</span> <span class="btn p">＋ Riconoscimento</span></div></div>
<div class="grid kpis" style="margin-bottom:16px">
 <div class="card kpi"><div class="l">Obiettivi a rischio</div><div class="v">3</div><div class="d dn">+1 rispetto alla scorsa settimana</div></div>
 <div class="card kpi"><div class="l">1:1 in ritardo</div><div class="v">2</div><div class="d">Luca (18 gg), Sara (21 gg)</div></div>
 <div class="card kpi"><div class="l">Review Q3 da compilare</div><div class="v">5<span style="font-size:16px;color:var(--muted)">/7</span></div><div class="d">Scadenza 30 settembre</div></div>
 <div class="card kpi"><div class="l">Riconoscimenti dati (mese)</div><div class="v">4</div><div class="d up">Team: 11 ricevuti</div></div>
</div>
<div class="grid" style="grid-template-columns:1.6fr 1fr">
 <div class="card"><h3>Il tuo team <small>segnali degli ultimi 30 giorni</small></h3>
 <table><tr><th>Persona</th><th>Obiettivi</th><th>Ultimo 1:1</th><th>Review Q3</th><th>Segnali</th></tr>
 <tr><td><div class="who"><span class="av s">LB</span><div><div class="n">Luca Bianchi</div><div class="r">Senior Developer</div></div></div></td><td><div class="bar w"><i style="width:45%"></i></div></td><td>18 gg fa</td><td><span class="pill n">Da fare</span></td><td><span class="pill s"><i></i>1 obiettivo off track</span></td></tr>
 <tr><td><div class="who"><span class="av s">SR</span><div><div class="n">Sara Ricci</div><div class="r">Product Designer</div></div></div></td><td><div class="bar"><i style="width:72%"></i></div></td><td>21 gg fa</td><td><span class="pill g">Inviata</span></td><td><span class="pill w"><i></i>1:1 in ritardo</span></td></tr>
 <tr><td><div class="who"><span class="av s">MC</span><div><div class="n">Marco Conti</div><div class="r">Developer</div></div></div></td><td><div class="bar g"><i style="width:88%"></i></div></td><td>3 gg fa</td><td><span class="pill n">Da fare</span></td><td><span class="pill g"><i></i>Tutto ok</span></td></tr>
 <tr><td><div class="who"><span class="av s">EP</span><div><div class="n">Elena Parisi</div><div class="r">QA Engineer</div></div></div></td><td><div class="bar"><i style="width:60%"></i></div></td><td>6 gg fa</td><td><span class="pill n">Da fare</span></td><td><span class="pill b"><i></i>Onboarding giorno 42</span></td></tr>
 <tr><td><div class="who"><span class="av s">AR</span><div><div class="n">Andrea Russo</div><div class="r">Developer</div></div></div></td><td><div class="bar c"><i style="width:20%"></i></div></td><td>9 gg fa</td><td><span class="pill n">Da fare</span></td><td><span class="pill c"><i></i>2 KR senza check-in</span></td></tr>
 </table></div>
 <div style="display:flex;flex-direction:column;gap:16px">
 <div class="card"><h3>Da fare</h3><ul class="list">
  <li><span class="dot" style="background:var(--crit)"></span><div><div class="t">Manager review · Luca Bianchi</div><div class="m">Scade tra 4 giorni</div></div></li>
  <li><span class="dot" style="background:var(--warn)"></span><div><div class="t">Approva obiettivi Q4 · Marco Conti</div><div class="m">In attesa da 2 giorni</div></div></li>
  <li><span class="dot" style="background:var(--brand)"></span><div><div class="t">Rispondi alla richiesta di feedback di Sara</div><div class="m">"Come ho gestito il rilascio 3.2?"</div></div></li>
  <li><span class="dot" style="background:var(--brand)"></span><div><div class="t">Pulse survey settembre</div><div class="m">2 minuti · anonima</div></div></li>
 </ul></div>
 <div class="card"><h3>Prossimi 1:1</h3><ul class="list">
  <li><span class="av s">MC</span><div><div class="t">Marco Conti</div><div class="m">Lun 15 · 10:00 · 3 punti in agenda</div></div></li>
  <li><span class="av s">LB</span><div><div class="t">Luca Bianchi</div><div class="m">Lun 15 · 14:30 · 1 punto suggerito</div></div></li>
  <li><span class="av s">EP</span><div><div class="t">Elena Parisi</div><div class="m">Mar 16 · 11:00 · check-in 45 giorni</div></div></li>
 </ul></div>
 </div>
</div>'''))

# ---------- 02 Obiettivi ----------
def obj(level,title,owner,pct,conf,confcls,sel=False,children=''):
    return f'''<li><div class="obj{" sel" if sel else ""}"><div><div class="lvl">{level}</div><div class="t">{title}</div><div class="s">{owner}</div></div>
<div><div class="bar{' g' if confcls=='g' else (' w' if confcls=='w' else (' c' if confcls=='c' else ''))}"><i style="width:{pct}%"></i></div></div><div class="pct">{pct}%</div><div><span class="pill {confcls}"><i></i>{conf}</span></div></div>{children}</li>'''
tree = '<ul class="tree">' + obj('Azienda','Diventare il fornitore di riferimento per le PMI del Nord Italia','Acme S.p.A. · Q3 2026',58,'On track','g',False,
 '<ul class="tree">'+obj('Unità · Prodotto','Ridurre il churn dei clienti sotto il 3% mensile','Giulia Ferri · Engineering',41,'A rischio','w',False,
   '<ul class="tree">'+obj('Individuale','Portare il tempo di risposta ai ticket P1 sotto le 4 ore','Luca Bianchi',25,'Off track','c',True)
   +obj('Individuale','Rilasciare il nuovo onboarding in-app entro il 30/09','Sara Ricci',70,'On track','g')
   +obj('Individuale','Ridurre i bug critici in produzione da 12 a 4 al mese','Marco Conti',85,'On track','g')+'</ul>')
 +obj('Unità · Vendite','Chiudere 40 nuovi contratti PMI nel trimestre','Paolo Neri · Sales',62,'On track','g')+'</ul>')+'</ul>'
W('02-obiettivi.html', shell('Obiettivi','obiettivi',f'''
<div class="ph"><div><h1>Obiettivi</h1><p>Q3 2026 · 1 lug – 30 set · chiusura tra 17 giorni</p></div><div><span class="btn">Esporta</span> <span class="btn p">＋ Nuovo obiettivo</span></div></div>
<div class="tabs"><a>I miei</a><a>Team</a><a class="on">Albero di allineamento</a><a>Azienda</a></div>
<div class="filters"><span class="chip">Periodo <b>Q3 2026</b></span><span class="chip">Unità <b>Prodotto</b></span><span class="chip">Confidenza <b>Tutte</b></span><span class="chip">Stato <b>Attivi</b></span><span class="chip" style="border-style:dashed">＋ filtro</span></div>
<div class="grid" style="grid-template-columns:1fr 360px;align-items:start">
 <div>{tree}</div>
 <div class="card"><h3>Dettaglio <small>Luca Bianchi</small></h3>
  <div style="font-weight:700;font-size:15px">Portare il tempo di risposta ai ticket P1 sotto le 4 ore</div>
  <div style="font-size:12px;color:var(--muted);margin:4px 0 14px">Contribuisce a: <u>Ridurre il churn sotto il 3%</u> · Visibilità: Team · Peso 30%</div>
  <div class="lvl" style="margin-bottom:6px">Key result 1 · decrescente</div>
  <div style="display:flex;justify-content:space-between;font-size:13px"><span>Tempo medio risposta P1</span><b>7,5 h → 4 h</b></div>
  <div class="bar c" style="margin:6px 0 4px"><i style="width:25%"></i></div>
  <svg viewBox="0 0 320 80" width="100%" height="80" style="margin:8px 0 2px" aria-label="Andamento check-in">
   <line x1="0" y1="70" x2="320" y2="70" stroke="#c3c2b7"/><line x1="0" y1="20" x2="320" y2="20" stroke="#e1e0d9" stroke-dasharray="3 3"/>
   <polyline fill="none" stroke="#898781" stroke-width="1.5" stroke-dasharray="4 3" points="10,66 310,22"/>
   <polyline fill="none" stroke="#d03b3b" stroke-width="2" points="10,66 60,63 110,60 160,58 210,56 260,52 310,50"/>
   <g fill="#d03b3b" stroke="#fcfcfb" stroke-width="2"><circle cx="10" cy="66" r="4"/><circle cx="60" cy="63" r="4"/><circle cx="110" cy="60" r="4"/><circle cx="160" cy="58" r="4"/><circle cx="210" cy="56" r="4"/><circle cx="260" cy="52" r="4"/><circle cx="310" cy="50" r="4"/></g>
   <text x="12" y="16" font-size="10" fill="#898781">target 4 h</text><text x="240" y="78" font-size="10" fill="#898781">— atteso</text>
  </svg>
  <div class="lvl" style="margin:12px 0 6px">Ultimo check-in · 3 giorni fa</div>
  <div class="fb" style="border-color:var(--crit)">Il turno notturno non è ancora coperto: senza la seconda persona on-call non scendiamo sotto le 6 ore.<div class="m">Luca Bianchi · confidenza: off track</div></div>
  <div class="suggest" style="margin-top:12px">💡 <b>Suggerito per il 1:1 di lunedì</b>: discutere la copertura on-call e ricalibrare il target del KR.</div>
  <div style="display:flex;gap:8px;margin-top:14px"><span class="btn sm">Aggiungi al 1:1</span><span class="btn sm">Storico check-in</span></div>
 </div>
</div>'''))

# ---------- 03 One-to-one ----------
W('03-one-to-one.html', shell('1:1','one','''
<div class="ph"><div><h1>1:1 con Luca Bianchi</h1><p>Lunedì 15 settembre · 14:30–15:00 · settimanale · 27° incontro</p></div><div><span class="btn">Riprogramma</span> <span class="btn">📅 Google Calendar</span> <span class="btn p">Chiudi incontro</span></div></div>
<div class="grid" style="grid-template-columns:300px 1fr 280px;align-items:start">
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>Agenda <small>4 punti</small></h3>
   <div class="check"><span class="box on"></span><div><div>Retrospettiva rilascio 3.2</div><div class="m" style="font-size:12px;color:var(--muted)">Aggiunto da Luca</div></div></div>
   <div class="check"><span class="box"></span><div><div>Copertura on-call turno notturno</div><div style="font-size:12px;color:var(--muted)">Da obiettivo off track · suggerito</div></div></div>
   <div class="check"><span class="box"></span><div><div>Riportato: percorso verso Tech Lead</div><div style="font-size:12px;color:var(--muted)">Non discusso la scorsa volta</div></div></div>
   <div class="check"><span class="box"></span><div><div>Ferie di ottobre</div><div style="font-size:12px;color:var(--muted)">Aggiunto da Luca</div></div></div>
   <div style="margin-top:10px;color:var(--muted);font-size:13px">＋ Aggiungi punto…</div>
  </div>
  <div class="suggest"><b>Suggerimenti</b><ul style="margin:6px 0 0;padding-left:18px;line-height:1.7">
   <li>KR "Tempo risposta P1" è <b>off track</b> da 2 settimane</li><li>Feedback ricevuto da Marco Conti (3 gg fa)</li><li>Azione scaduta: "Documentare runbook on-call"</li><li>Check-in settimanale: umore 3/5, blocco segnalato</li></ul></div>
  <div class="card"><h3>Check-in di Luca <small>venerdì</small></h3>
   <div style="font-size:13px"><div style="display:flex;justify-content:space-between"><span>Come è andata la settimana?</span><b>3/5</b></div>
   <div style="margin-top:6px;color:var(--ink2)">"Tanti ticket P1, poco tempo per il refactoring che avevamo pianificato."</div></div></div>
 </div>
 <div class="card"><h3>Note condivise <small>visibili a te e Luca</small></h3>
  <div class="editor"><div class="tb"><span>B</span><span>I</span><span>• Elenco</span><span>@ Menzione</span><span>🔗 Obiettivo</span></div>
  <p><b>Retrospettiva rilascio 3.2</b><br>Rilascio andato bene; il rollback plan ha funzionato. Luca segnala che la fase di test è stata compressa: <span style="background:var(--brand-soft);border-radius:3px;padding:0 3px">@Sara Ricci</span> concorda di anticipare la review del design di una settimana nel prossimo ciclo.</p>
  <p><b>Copertura on-call</b><br>Servono due persone per il turno notturno. Proposta: coinvolgere <span style="background:var(--brand-soft);border-radius:3px;padding:0 3px">@Andrea Russo</span> da ottobre con affiancamento. Ricalibrare il KR a 5 h entro fine Q3 e 4 h in Q4.</p>
  <p style="color:var(--muted)">Continua a scrivere…</p></div>
  <div style="margin-top:14px;display:flex;gap:8px"><span class="btn sm">＋ Dai un feedback a Luca</span><span class="btn sm">＋ Riconoscimento</span><span class="btn sm">Collega a obiettivo</span></div>
 </div>
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>Action item <small>3 aperti</small></h3>
   <div class="check"><span class="box"></span><div><div>Proporre Andrea per on-call</div><div style="font-size:12px;color:var(--muted)">Giulia · entro 19 set</div></div></div>
   <div class="check"><span class="box"></span><div><div>Documentare runbook on-call</div><div style="font-size:12px"><span class="pill c" style="padding:1px 8px">Scaduta 8 set</span> Luca</div></div></div>
   <div class="check"><span class="box"></span><div><div>Anticipare design review ciclo 3.3</div><div style="font-size:12px;color:var(--muted)">Sara · entro 30 set</div></div></div>
   <div class="check"><span class="box on"></span><div style="color:var(--muted);text-decoration:line-through">Inviare piano ferie Q4</div></div>
  </div>
  <div class="card" style="background:#fffdf3"><h3>Note private <small>🔒 solo tu</small></h3><div style="font-size:13px;color:var(--ink2)">Luca sembra affaticato dai P1: valutare rotazione e menzionare il percorso Tech Lead nella review Q3 come segnale concreto.</div></div>
  <div class="card"><h3>Storico</h3><ul class="list" style="font-size:13px"><li><div><div class="t">8 set</div><div class="m">Rilascio 3.2, ferie</div></div></li><li><div><div class="t">1 set</div><div class="m">Carriera, on-call</div></div></li><li><div><div class="t">25 ago</div><div class="m">Saltato</div></div></li></ul></div>
 </div>
</div>'''))

# ---------- 04 Review ----------
def scale(sel):
    labels=[('1','Non soddisfa'),('2','Parzialmente'),('3','Soddisfa'),('4','Supera'),('5','Eccezionale')]
    return '<div class="scale">'+''.join(f'<span class="{"on" if i+1==sel else ""}"><b>{v}</b>{l}</span>' for i,(v,l) in enumerate(labels))+'</div>'
W('04-review.html', shell('Review','review',f'''
<div class="ph"><div><h1>Review Q3 2026 · Luca Bianchi</h1><p>Manager review · bozza salvata automaticamente alle 09:41 · scadenza 30 settembre</p></div><div><span class="btn">Anteprima</span> <span class="btn p">Invia review</span></div></div>
<div class="stepper"><div class="done"><i>✓</i>Self-review</div><div class="cur"><i>2</i>Manager review</div><div><i>3</i>Calibrazione</div><div><i>4</i>Condivisione</div><div><i>5</i>Conversazione</div><div><i>6</i>Firma</div></div>
<div class="grid" style="grid-template-columns:1fr 340px;align-items:start">
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>1. Obiettivi del periodo <small>auto-popolati da Obiettivi · peso 40%</small></h3>
   <table><tr><th>Obiettivo</th><th>Progresso</th><th>Auto-valutazione</th><th>La tua valutazione</th></tr>
   <tr><td><b>Tempo di risposta ticket P1 sotto 4 h</b><div style="font-size:12px;color:var(--muted)">peso 30% · off track</div></td><td><div class="bar c"><i style="width:25%"></i></div><div style="font-size:12px">25%</div></td><td><span class="pill n">2 · Parzialmente</span></td><td><span class="sel-box" style="display:inline-block">2 · Parzialmente ▾</span></td></tr>
   <tr><td><b>Migrazione database senza downtime</b><div style="font-size:12px;color:var(--muted)">peso 40% · chiuso</div></td><td><div class="bar g"><i style="width:100%"></i></div><div style="font-size:12px">100%</div></td><td><span class="pill n">4 · Supera</span></td><td><span class="sel-box" style="display:inline-block">5 · Eccezionale ▾</span></td></tr>
   <tr><td><b>Mentoring di due junior</b><div style="font-size:12px;color:var(--muted)">peso 30% · on track</div></td><td><div class="bar g"><i style="width:80%"></i></div><div style="font-size:12px">80%</div></td><td><span class="pill n">4 · Supera</span></td><td><span class="sel-box" style="display:inline-block;color:var(--muted)">Seleziona ▾</span></td></tr>
   </table></div>
  <div class="card"><h3>2. Competenze <small>profilo Senior Developer · peso 40%</small></h3>
   <div class="q"><div class="qt">Ownership</div><div class="qh">Livello atteso: 3 · Si assume la responsabilità dei risultati oltre il proprio perimetro</div>{scale(4)}</div>
   <div class="q"><div class="qt">Comunicazione</div><div class="qh">Livello atteso: 3 · Adatta il messaggio all'interlocutore, scrive documentazione chiara</div>{scale(3)}</div>
   <div class="q"><div class="qt">Qualità tecnica</div><div class="qh">Livello atteso: 4 · Progetta soluzioni robuste e testabili</div>{scale(0)}<div style="font-size:12px;color:var(--crit-text);margin-top:6px">Obbligatorio · un commento è richiesto per rating ≤ 2</div></div>
  </div>
  <div class="card"><h3>3. Commento complessivo <small>peso 20% · visibile a Luca dopo la condivisione</small></h3>
   <div class="ta">Luca ha guidato la migrazione del database con una preparazione impeccabile: zero downtime e un runbook che il team riusa. Sul fronte P1 il risultato è sotto target, ma la causa è strutturale (copertura on-call) più che individuale; concordato un piano con Andrea da ottobre. Il mentoring di Marco e Andrea è visibile nella qualità delle loro PR.|</div>
   <div class="foot">💡 Suggerimento: cita un esempio concreto per la competenza "Comunicazione". Lunghezza consigliata raggiunta ✓</div></div>
 </div>
 <div class="card ctx" style="position:sticky;top:0">
  <h3>Contesto <small>Luca Bianchi · Q3</small></h3>
  <h4>Feedback ricevuti (3)</h4>
  <div class="fb">"Grazie per il supporto nella migrazione: la checklist ci ha salvato."<div class="m">Marco Conti · 10 set · condiviso con manager</div></div>
  <div class="fb">"Nelle review di codice potresti essere più sintetico."<div class="m">Sara Ricci · 28 ago · suggerimento</div></div>
  <div class="fb" style="border-color:var(--c4)">🏅 Valore <b>Affidabilità</b> · migrazione DB<div class="m">Riconoscimento pubblico · 22 ago · 9 reazioni</div></div>
  <h4>Note dai 1:1 (ultimi 90 gg)</h4>
  <div style="font-size:13px;color:var(--ink2)">On-call notturno scoperto · interesse percorso Tech Lead · affaticamento da P1</div>
  <h4>Review precedente · Q2</h4>
  <div style="font-size:13px;display:flex;justify-content:space-between"><span>Rating finale</span><b>4 · Supera</b></div>
  <div style="font-size:13px;display:flex;justify-content:space-between"><span>Gap self vs manager</span><b>0</b></div>
  <h4>Piano di sviluppo</h4>
  <div style="font-size:13px;color:var(--ink2)">2 azioni attive: "Corso architetture distribuite" (in corso), "Guidare design review" (da avviare)</div>
 </div>
</div>'''))

# ---------- 05 Welfare ----------
W('05-welfare.html', shell('Welfare','welfare','''
<div class="ph"><div><h1>Il mio welfare</h1><p>Piano welfare 2026 · Acme S.p.A. · regolamento preso in visione il 12/01/2026</p></div><div><span class="btn">Estratto conto</span> <span class="btn p">＋ Nuova richiesta</span></div></div>
<div class="grid" style="grid-template-columns:1.2fr 1fr 1fr;margin-bottom:16px">
 <div class="card kpi"><div class="l">Disponibile</div><div class="v">1.240,00 €</div><div class="d">Saldo 1.420,00 € · impegnato 180,00 € · scade il 31/12/2026</div>
  <div style="display:flex;gap:16px;margin-top:12px;font-size:12px;color:var(--ink2);white-space:nowrap"><span>● On top azienda <b>800 €</b></span><span>● CCNL <b>200 €</b></span><span>● Premio convertito <b>1.000 €</b></span></div></div>
 <div class="card kpi"><div class="l">Speso nel 2026</div><div class="v">580,00 €</div><div class="d">6 richieste · ultima il 2 set</div></div>
 <div class="card kpi"><div class="l">Soglia fringe benefit 2026</div><div class="v">620<span style="font-size:16px;color:var(--muted)"> / 1.000 €</span></div><div class="bar w" style="margin:8px 0 6px"><i style="width:62%"></i></div><div class="d">Con 1 figlio a carico dichiarato · 380 € ancora esenti</div></div>
</div>
<div class="grid" style="grid-template-columns:1fr 380px;align-items:start">
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>Catalogo <small>categorie abilitate dal tuo piano</small></h3>
   <div class="wcat">
    <div><div class="ic"></div><b>Istruzione e figli</b><small>Rette, libri, campus, asilo · esente</small></div>
    <div><div class="ic" style="background:#e6f5e6"></div><b>Sanità integrativa</b><small>Visite, check-up, fondo sanitario · esente</small></div>
    <div><div class="ic" style="background:#fff3d6"></div><b>Previdenza complementare</b><small>Versamento al fondo pensione · esente</small></div>
    <div><div class="ic" style="background:#fde9e0"></div><b>Trasporti</b><small>Abbonamento TPL · esente</small></div>
    <div><div class="ic" style="background:#efeeea"></div><b>Cultura, sport, tempo libero</b><small>Palestra, cinema, viaggi · esente</small></div>
    <div><div class="ic" style="background:#fbe3e3"></div><b>Buoni acquisto</b><small>Voucher spesa, carburante · soglia annua</small></div>
   </div></div>
  <div class="card"><h3>Le mie richieste <small>2026</small></h3>
   <table><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th class="num">Importo</th><th>Stato</th></tr>
   <tr><td>2 set</td><td>Rimborso libri scolastici · Matteo</td><td>Istruzione</td><td class="num">184,50 €</td><td><span class="pill w"><i></i>In verifica</span></td></tr>
   <tr><td>20 ago</td><td>Buono spesa Esselunga</td><td>Buoni acquisto</td><td class="num">200,00 €</td><td><span class="pill g"><i></i>Evasa</span></td></tr>
   <tr><td>3 lug</td><td>Abbonamento annuale ATM</td><td>Trasporti</td><td class="num">330,00 €</td><td><span class="pill g"><i></i>Liquidata in cedolino</span></td></tr>
   <tr><td>11 giu</td><td>Visita specialistica</td><td>Sanità</td><td class="num">120,00 €</td><td><span class="pill s"><i></i>Integrazione richiesta</span></td></tr>
   </table></div>
 </div>
 <div class="card"><h3>Nuova richiesta di rimborso</h3>
  <div class="prop" style="grid-template-columns:1fr;gap:10px">
   <div><div class="k" style="margin-bottom:4px">Categoria</div><div class="sel-box">Istruzione e figli ▾</div></div>
   <div><div class="k" style="margin-bottom:4px">Beneficiario</div><div class="sel-box">Matteo (figlio a carico) ▾</div></div>
   <div><div class="k" style="margin-bottom:4px">Importo</div><div class="sel-box">184,50 €</div></div>
   <div><div class="k" style="margin-bottom:4px">Data spesa</div><div class="sel-box">01/09/2026</div></div>
   <div><div class="k" style="margin-bottom:4px">Giustificativo</div><div style="border:1.5px dashed var(--line);border-radius:8px;padding:16px;text-align:center;color:var(--muted);font-size:13px">📎 fattura_libreria.pdf · 212 KB<br><span style="font-size:12px">Trascina un altro file o scatta una foto</span></div></div>
  </div>
  <div class="suggest" style="margin:12px 0">✓ Categoria esente: non incide sulla soglia fringe benefit. Disponibile dopo la richiesta: <b>1.055,50 €</b>.</div>
  <div class="check" style="border:0"><span class="box on"></span><div style="font-size:12px;color:var(--ink2)">Dichiaro che la spesa è sostenuta per un familiare a carico e non è stata rimborsata da altri soggetti.</div></div>
  <span class="btn p" style="width:100%;justify-content:center;margin-top:8px">Invia richiesta</span>
 </div>
</div>''', user=('Luca Bianchi','Senior Developer','LB')))

# ---------- 06 Report builder ----------
def cell(v):
    if v is None: return '<td class="na">n&lt;5</td>'
    steps=[(55,'#cde2fb','#0b0b0b'),(62,'#9ec5f4','#0b0b0b'),(69,'#6da7ec','#0b0b0b'),(76,'#3987e5','#fff'),(83,'#256abf','#fff'),(200,'#184f95','#fff')]
    for lim,bg,fg in steps:
        if v<lim: return f'<td style="background:{bg};color:{fg}">{v}</td>'
rows=[('Prodotto',[71,64,58,77,69]),('Vendite',[80,73,66,74,71]),('Customer Care',[62,55,49,68,60]),('Amministrazione',[75,70,None,79,72]),('Marketing',[None,None,None,None,None]),('Azienda',[72,66,58,75,68])]
hm='<table class="hm"><tr><th></th><th>Leadership</th><th>Crescita</th><th>Riconoscimento</th><th>Chiarezza</th><th>Benessere</th></tr>'+''.join(f'<tr><td class="rl" style="background:none;color:var(--ink)">{r}</td>'+''.join(cell(v) for v in vs)+'</tr>' for r,vs in rows)+'</table>'
W('06-report-builder.html', shell('Reportistica','report',f'''
<div class="ph"><div><h1>Report builder</h1><p>Engagement × Review Q2 per unità · <span class="pill n">Bozza non salvata</span> · dati aggiornati 12 minuti fa</p></div><div><span class="btn">Salva report</span> <span class="btn">⏰ Programma invio</span> <span class="btn p">Esporta ▾</span></div></div>
<div class="filters"><span class="chip">Periodo <b>Q2 2026</b></span><span class="chip">Confronta con <b>Q1 2026</b></span><span class="chip">Unità <b>Tutte (perimetro HRBP Nord)</b></span><span class="chip">Sede <b>Tutte</b></span><span class="chip">Anzianità <b>Tutte</b></span></div>
<div class="grid" style="grid-template-columns:260px 1fr;align-items:start">
 <div class="card" style="padding:12px">
  <div class="search" style="margin-bottom:10px">🔍 Cerca metrica…</div>
  <div class="lvl" style="padding:6px 8px">Metriche · 64</div>
  <div class="metric on">eNPS <small>Engagement</small></div>
  <div class="metric on">Punteggio per driver <small>Engagement</small></div>
  <div class="metric on">Rating medio review <small>Review</small></div>
  <div class="metric">Tasso di risposta <small>Engagement</small></div>
  <div class="metric">Gap self–manager <small>Review</small></div>
  <div class="metric">% riporti con 1:1 (30 gg) <small>1:1</small></div>
  <div class="metric">Take-up welfare <small>Welfare</small></div>
  <div class="metric">Turnover % <small>Persone</small></div>
  <div class="lvl" style="padding:14px 8px 6px">Dimensioni</div>
  <div class="metric on">Unità organizzativa <small>righe</small></div>
  <div class="metric on">Driver <small>colonne</small></div>
  <div class="metric">Sede</div><div class="metric">Manager</div><div class="metric">Job family</div><div class="metric">Trimestre</div>
  <div class="lvl" style="padding:14px 8px 6px">Visualizzazione</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;padding:0 8px"><span class="pill b">Heatmap</span><span class="pill n">Tabella</span><span class="pill n">Barre</span><span class="pill n">Linee</span><span class="pill n">Radar</span></div>
 </div>
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>Punteggio engagement per driver e unità <small>scala 0–100 · Q2 2026</small></h3>
   {hm}
   <div class="legend"><span><i style="background:#cde2fb"></i>&lt;55</span><span><i style="background:#9ec5f4"></i>55–61</span><span><i style="background:#6da7ec"></i>62–68</span><span><i style="background:#3987e5"></i>69–75</span><span><i style="background:#256abf"></i>76–82</span><span><i style="background:#184f95"></i>≥83</span><span style="margin-left:auto">⛨ 2 unità soppresse per soglia di anonimato (n&lt;5)</span></div>
  </div>
  <div class="grid" style="grid-template-columns:1fr 1fr">
   <div class="card"><h3>eNPS per trimestre <small>azienda vs Prodotto</small></h3>
    <svg viewBox="0 0 440 170" width="100%" height="170">
     <g stroke="#e1e0d9"><line x1="40" y1="20" x2="410" y2="20"/><line x1="40" y1="60" x2="410" y2="60"/><line x1="40" y1="100" x2="410" y2="100"/></g><line x1="40" y1="140" x2="410" y2="140" stroke="#c3c2b7"/>
     <g font-size="10" fill="#898781"><text x="8" y="24">+40</text><text x="8" y="64">+20</text><text x="18" y="104">0</text><text x="8" y="144">-20</text><text x="70" y="160">Q3 25</text><text x="160" y="160">Q4 25</text><text x="250" y="160">Q1 26</text><text x="340" y="160">Q2 26</text></g>
     <polyline fill="none" stroke="#2a78d6" stroke-width="2" points="80,92 170,80 260,74 350,62"/><polyline fill="none" stroke="#eb6834" stroke-width="2" points="80,104 170,96 260,100 350,84"/>
     <g stroke="#fcfcfb" stroke-width="2"><circle cx="350" cy="62" r="4" fill="#2a78d6"/><circle cx="350" cy="84" r="4" fill="#eb6834"/></g>
     <text x="350" y="50" font-size="11" fill="#0b0b0b" font-weight="600" text-anchor="middle">Azienda +19</text><text x="350" y="102" font-size="11" fill="#0b0b0b" font-weight="600" text-anchor="middle">Prodotto +8</text>
    </svg><div class="legend"><span><i style="background:#2a78d6"></i>Azienda</span><span><i style="background:#eb6834"></i>Prodotto</span></div></div>
   <div class="card"><h3>Rating medio review Q2 × engagement <small>per unità</small></h3>
    <table><tr><th>Unità</th><th class="num">Rating medio</th><th class="num">Engagement</th><th class="num">eNPS</th><th class="num">Δ Q1</th></tr>
    <tr><td>Vendite</td><td class="num">3,9</td><td class="num">73</td><td class="num">+31</td><td class="num" style="color:var(--good-text)">+4</td></tr>
    <tr><td>Prodotto</td><td class="num">3,7</td><td class="num">68</td><td class="num">+8</td><td class="num" style="color:var(--crit-text)">−3</td></tr>
    <tr><td>Amministrazione</td><td class="num">3,6</td><td class="num">74</td><td class="num">+22</td><td class="num" style="color:var(--good-text)">+1</td></tr>
    <tr><td>Customer Care</td><td class="num">3,4</td><td class="num">59</td><td class="num">−5</td><td class="num" style="color:var(--crit-text)">−6</td></tr>
    </table><div class="foot">Definizioni nel data dictionary · perimetro: HRBP Nord · export tracciato in audit</div></div>
  </div>
 </div>
</div>''', user=('Chiara Moretti','HR Business Partner · Nord','CM')))

# ---------- 07 App Studio ----------
def ph(n,a,d,sel=False): return f'<div class="phase{" sel" if sel else ""}"><div class="n">{n}</div><div class="a">{a}</div><div class="d">{d}</div></div>'
W('07-app-studio.html', shell('App Studio','studio',f'''
<div class="ph"><div><h1>Review annuale 2026 <span class="pill n" style="vertical-align:middle">v3 · bozza</span></h1><p>App Studio · dal template "Review annuale con calibrazione" · v2 pubblicata il 14/02/2026</p></div><div><span class="btn">👁 Anteprima ▾</span> <span class="btn">Salva template</span> <span class="btn p">Pubblica v3</span></div></div>
<div class="tabs"><a>Form</a><a class="on">Workflow</a><a>Permessi</a><a>Naming</a><a>Notifiche</a><a>Popolazione</a></div>
<div class="grid" style="grid-template-columns:1fr 300px;align-items:start">
 <div class="card" style="overflow:hidden"><h3>Flusso <small>6 fasi · 2 in parallelo · trascina per riordinare</small></h3>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;font-size:12px;color:var(--muted)"><span style="padding:4px 0">Aggiungi fase:</span>{''.join(f'<span class="chip" style="padding:3px 9px;font-size:12px;border-style:dashed">＋ {x}</span>' for x in ['Nomina peer','Peer review','Skip-level','Approvazione','Conversazione','Firma','Azione automatica','Condizione'])}</div>
  <div class="flow">
   {ph('Avvio','HR Admin','Lancio: 1 dic 2026')}<div class="arrow"></div>
   <div class="par">{ph('Self-review','Soggetto','Form: sez. 1–3 · +14 gg')}{ph('Manager review','Manager del soggetto','Form: tutte · +21 gg',True)}</div><div class="arrow"></div>
   {ph('Calibrazione','HRBP + Manager di 2° livello','Sessione per unità · +35 gg')}<div class="arrow"></div>
   {ph('Approvazione','Manager del manager','Approva / rimanda · +40 gg')}<div class="arrow"></div>
   {ph('Condivisione','Manager del soggetto','Rating + commenti · +45 gg')}<div class="arrow"></div>
   {ph('Firma','Soggetto','Accetta / dissente · +52 gg')}
  </div>
  <div class="suggest" style="margin-top:6px">Regola attiva: <b>se rating finale ≤ 2 → aggiungi fase "Piano di miglioramento" assegnata a HRBP</b> (automazione L4)</div>
 </div>
 <div class="card"><h3>Proprietà · Manager review</h3>
  <div class="prop">
   <div class="k">Attore</div><div class="sel-box">Manager del soggetto ▾</div>
   <div class="k">Se assente</div><div class="sel-box">Riassegna al manager di 2° livello ▾</div>
   <div class="k">Form</div><div class="sel-box">Tutte le sezioni (4) ▾</div>
   <div class="k">Scadenza</div><div class="sel-box">+21 giorni dal lancio</div>
   <div class="k">Promemoria</div><div class="sel-box">7 gg, 2 gg prima · 1 gg dopo</div>
   <div class="k">Vede self-review</div><div class="sel-box">Dopo aver inviato la propria ▾</div>
   <div class="k">Obbligo commento</div><div class="sel-box">Se rating ≤ 2</div>
   <div class="k">Notifica avvio</div><div class="sel-box">Email + Teams · template "Avvio review" ▾</div>
  </div>
  <div class="lvl" style="margin:16px 0 6px">Anteprima naming</div>
  <div style="font-size:13px;color:var(--ink2)">Nel tenant Acme questa fase appare come <b>"Conversazione di crescita – parte manager"</b></div>
  <div class="foot" style="margin-top:14px">Modifiche a una versione pubblicata creano una nuova versione; le 214 istanze v2 in corso non vengono toccate.</div>
 </div>
</div>''', user=('Chiara Moretti','HR Admin','CM')))

# ---------- 08 Mobile ----------
W('08-mobile-collaboratore.html', '''<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Mobile · WorkingBetter</title><link rel="stylesheet" href="style.css"></head><body style="background:#e9e8e3">
<div class="phone"><div class="sb"><span>9:41</span><span>●●● ⌔ ▮</span></div>
<main>
 <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 16px"><div><div style="color:var(--muted);font-size:13px">Sabato 13 settembre</div><div style="font-size:24px;font-weight:700;letter-spacing:-.4px">Ciao, Luca</div></div><span class="av l">LB</span></div>
 <div class="card" style="border-left:4px solid var(--crit)"><h3>Check-in richiesto <small>KR in ritardo</small></h3><div style="font-weight:600">Tempo di risposta ticket P1</div><div style="color:var(--ink2);font-size:13px;margin:2px 0 10px">Ultimo valore 7,5 h · target 4 h</div>
  <div class="row2"><span class="btn">7,0 h · a rischio</span><span class="btn p">Aggiorna</span></div></div>
 <div class="card"><h3>Prossimo 1:1 <small>lun 15 · 14:30</small></h3><div class="who"><span class="av">GF</span><div><div class="n">Giulia Ferri</div><div class="r">4 punti in agenda · 1 azione scaduta</div></div></div><div style="margin-top:12px;color:var(--brand-2);font-weight:600">＋ Aggiungi un punto</div></div>
 <div class="card" style="border-left:4px solid var(--c3)"><h3>Nuovo feedback</h3><div style="font-size:14px">"Grazie per il supporto nella migrazione: la checklist ci ha salvato."</div><div style="font-size:12px;color:var(--muted);margin-top:4px">Marco Conti · 3 giorni fa</div><div class="row2" style="margin-top:12px"><span class="btn">👍 Utile</span><span class="btn">Rispondi</span></div></div>
 <div class="card"><h3>Welfare <small>scade il 31/12</small></h3><div class="big">1.240,00 €</div><div style="color:var(--ink2);font-size:13px">disponibili · 1 richiesta in verifica</div><span class="btn" style="margin-top:12px">📷 Rimborso con foto dello scontrino</span></div>
 <div class="card"><h3>Pulse di settembre <small>2 min · anonima</small></h3><div style="font-size:14px;margin-bottom:10px">Quanto ti senti in grado di crescere professionalmente in Acme?</div><div class="scale"><span>1</span><span>2</span><span>3</span><span class="on">4</span><span>5</span></div></div>
</main>
<div class="tabbar"><div class="on"><i></i>Home</div><div><i></i>Obiettivi</div><div><i></i>1:1</div><div><i></i>Feedback</div><div><i></i>Welfare</div></div>
</div></body></html>''')

# ---------- 09 Calibrazione 9-box ----------
def person(ini,name,role,color='var(--seq300)'):
    return f'<div style="display:flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:5px 8px;font-size:12px;box-shadow:var(--shadow)"><span class="av s" style="background:{color}">{ini}</span><div><div style="font-weight:600;line-height:1.2">{name}</div><div style="color:var(--muted);font-size:11px">{role}</div></div></div>'
cells = {
 (2,0):[person('SR','Sara Ricci','Design')], (2,1):[person('LB','Luca Bianchi','Eng'),person('PN','Paolo Neri','Sales')], (2,2):[person('MC','Marco Conti','Eng')],
 (1,0):[person('AR','Andrea Russo','Eng')], (1,1):[person('EP','Elena Parisi','QA'),person('FG','Fabio Galli','Sales'),person('CR','Chiara Rinaldi','CS')], (1,2):[person('DM','Davide Moro','Sales')],
 (0,0):[person('GT','Gianni Testa','CS')], (0,1):[], (0,2):[],
}
labels_y=['Alto','Medio','Basso']; labels_x=['Bassa','Media','Alta']
bg=[['#fff3d6','#e6f5e6','#d6ecd6'],['#fde9e0','#efeeea','#e6f5e6'],['#fbe3e3','#fde9e0','#fff3d6']]
titles=[['Enigma','Talento in crescita','Top talent'],['Da sviluppare','Solido','Alto potenziale'],['A rischio','Performer di base','Esperto']]
box='<div style="display:grid;grid-template-columns:70px repeat(3,1fr);grid-template-rows:repeat(3,176px) 34px;gap:6px">'
for r in range(3):
    box+=f'<div style="display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted);writing-mode:vertical-rl;transform:rotate(180deg)">Potenziale {labels_y[r].lower()}</div>'
    for c in range(3):
        items=cells.get((2-r,c),[])
        box+=f'<div style="background:{bg[r][c]};border-radius:10px;padding:8px;position:relative"><div style="font-size:11px;font-weight:700;color:var(--ink2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em">{titles[r][c]}</div><div style="display:flex;flex-wrap:wrap;gap:5px">{"".join(items)}</div></div>'
box+='<div></div>'+''.join(f'<div style="text-align:center;font-size:12px;color:var(--muted)">Performance {x.lower()}</div>' for x in labels_x)+'</div>'
W('09-calibrazione.html', shell('Review','review',f"""
<div class="ph"><div><h1>Calibrazione · Prodotto & Vendite</h1><p>Review Q3 2026 · 25 set · facilitatrice Chiara Moretti · 14 persone · 9 rating confermati</p></div><div><span class="btn">Storico</span> <span class="btn p">Blocca calibrazione</span></div></div>
<div class="tabs"><a>Tabella</a><a class="on">9-box</a><a>Distribuzione per manager</a></div>
<div class="grid" style="grid-template-columns:1fr 340px;align-items:start">
 <div class="card">{box}<div class="foot">Trascina una persona per proporre uno spostamento: la modifica richiede una motivazione e resta tracciata. Il potenziale è visibile solo a manager, HR e leadership.</div></div>
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>Luca Bianchi <small>Senior Developer</small></h3>
   <div class="prop"><div class="k">Manager</div><div>Giulia Ferri</div><div class="k">Rating proposto</div><div><span class="pill b">4 · Supera</span></div><div class="k">Self-review</div><div>3 · Soddisfa</div><div class="k">Obiettivi</div><div>68% · 1 off track</div><div class="k">Potenziale</div><div>Alto</div><div class="k">Review Q2</div><div>4 · Supera</div></div>
   <div class="lvl" style="margin:14px 0 6px">Proposta in sessione</div>
   <div class="sel-box" style="margin-bottom:6px">Rating calibrato: 4 · Supera ▾</div>
   <div class="ta" style="min-height:64px;font-size:13px;color:var(--muted)">Motivazione (obbligatoria se diversa dal rating del manager)…</div>
   <div style="display:flex;gap:8px;margin-top:10px"><span class="btn sm p">Conferma</span><span class="btn sm">Apri review</span></div></div>
  <div class="card"><h3>Distribuzione rating <small>proposti vs attesa</small></h3>
   <svg viewBox="0 0 300 150" width="100%" height="150">
    <g font-size="10" fill="#898781"><text x="34" y="145">1</text><text x="88" y="145">2</text><text x="142" y="145">3</text><text x="196" y="145">4</text><text x="250" y="145">5</text></g>
    <line x1="20" y1="130" x2="290" y2="130" stroke="#c3c2b7"/>
    <g fill="#2a78d6"><rect x="24" y="122" width="22" height="8" rx="3"/><rect x="78" y="100" width="22" height="30" rx="3"/><rect x="132" y="40" width="22" height="90" rx="3"/><rect x="186" y="55" width="22" height="75" rx="3"/><rect x="240" y="115" width="22" height="15" rx="3"/></g>
    <g fill="none" stroke="#898781" stroke-width="1.5" stroke-dasharray="4 3"><rect x="24" y="120" width="22" height="10" rx="3"/><rect x="78" y="95" width="22" height="35" rx="3"/><rect x="132" y="30" width="22" height="100" rx="3"/><rect x="186" y="80" width="22" height="50" rx="3"/><rect x="240" y="120" width="22" height="10" rx="3"/></g>
    <g font-size="10" fill="#0b0b0b" font-weight="600"><text x="30" y="117">1</text><text x="84" y="95">3</text><text x="138" y="35">6</text><text x="192" y="50">5</text><text x="246" y="110">2</text></g>
   </svg>
   <div class="legend"><span><i style="background:#2a78d6"></i>Proposti</span><span><i style="border:1.5px dashed #898781;background:none"></i>Distribuzione attesa (indicativa)</span></div>
   <div class="suggest" style="margin-top:10px;font-size:12px">⚠ Manager Paolo Neri: 4 rating su 5 sono "Supera" o superiori (media unità: 38%).</div></div>
 </div>
</div>""", user=('Chiara Moretti','HR Business Partner · Nord','CM')))

# ---------- 10 Report 360 ----------
import math
def radar(vals_by_series, labels, size=320):
    cx=cy=size/2; R=size/2-46; n=len(labels); out=[]
    for k in (0.25,0.5,0.75,1.0):
        pts=' '.join(f'{cx+R*k*math.sin(2*math.pi*i/n):.1f},{cy-R*k*math.cos(2*math.pi*i/n):.1f}' for i in range(n))
        out.append(f'<polygon points="{pts}" fill="none" stroke="#e1e0d9"/>')
    for i,l in enumerate(labels):
        x=cx+(R+26)*math.sin(2*math.pi*i/n); y=cy-(R+26)*math.cos(2*math.pi*i/n)
        out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx+R*math.sin(2*math.pi*i/n):.1f}" y2="{cy-R*math.cos(2*math.pi*i/n):.1f}" stroke="#e1e0d9"/><text x="{x:.1f}" y="{y:.1f}" font-size="11" fill="#52514e" text-anchor="middle" dominant-baseline="middle">{l}</text>')
    for color,vals,dash in vals_by_series:
        pts=' '.join(f'{cx+R*v/5*math.sin(2*math.pi*i/n):.1f},{cy-R*v/5*math.cos(2*math.pi*i/n):.1f}' for i,v in enumerate(vals))
        dasharg = 'stroke-dasharray="5 4"' if dash else ''
        out.append(f'<polygon points="{pts}" fill="{color}" fill-opacity="0.10" stroke="{color}" stroke-width="2" {dasharg}/>')
        out += [f'<circle cx="{cx+R*v/5*math.sin(2*math.pi*i/n):.1f}" cy="{cy-R*v/5*math.cos(2*math.pi*i/n):.1f}" r="3.5" fill="{color}" stroke="#fcfcfb" stroke-width="2"/>' for i,v in enumerate(vals)]
    return f'<svg viewBox="0 0 {size} {size}" width="100%" height="{size}">'+''.join(out)+'</svg>'
labels=['Comunicazione','Ownership','Qualità tecnica','Collaborazione','Leadership','Focus cliente']
r=radar([('#898781',[3.0,4.0,4.5,3.5,3.0,3.0],True),('#2a78d6',[3.8,4.4,4.6,4.2,3.4,3.9],False)],labels)
comp_rows=[('Qualità tecnica',4.5,4.7,4.5,4.6,'+0.1'),('Ownership',4.0,4.5,4.3,4.4,'+0.4'),('Collaborazione',3.5,4.0,4.4,4.2,'+0.7'),('Orientamento al cliente',3.0,4.0,3.8,3.9,'+0.9'),('Comunicazione',3.0,3.5,4.0,3.8,'+0.8'),('Leadership',3.0,3.5,3.2,3.4,'+0.4')]
tbl='<table><tr><th>Competenza</th><th class="num">Self</th><th class="num">Manager</th><th class="num">Pari (5)</th><th class="num">Altri</th><th class="num">Gap self–altri</th></tr>'+''.join(f'<tr><td><b>{c}</b></td><td class="num">{a}</td><td class="num">{b}</td><td class="num">{d}</td><td class="num"><b>{e}</b></td><td class="num" style="color:var(--good-text)">{g}</td></tr>' for c,a,b,d,e,g in comp_rows)+'</table>'
W('10-report-360.html', shell('Sviluppo','sviluppo',f"""
<div class="ph"><div><h1>Report 360° · Luca Bianchi</h1><p>Campagna settembre 2026 · 9 risposte su 10 · rilasciato dopo il debrief del 20 set</p></div><div><span class="btn">PDF</span> <span class="btn">Confronta 2025</span> <span class="btn p">Crea azioni di sviluppo</span></div></div>
<div class="grid" style="grid-template-columns:380px 1fr;align-items:start">
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>Profilo competenze <small>scala 1–5</small></h3>{r}<div class="legend"><span><i style="background:#2a78d6"></i>Altri (manager, pari, riporti)</span><span><i style="border:1.5px dashed #898781;background:none"></i>Self</span></div></div>
  <div class="card"><h3>Rispondenti</h3><table><tr><th>Categoria</th><th class="num">Invitati</th><th class="num">Risposte</th><th>Anonimato</th></tr>
   <tr><td>Self</td><td class="num">1</td><td class="num">1</td><td>—</td></tr><tr><td>Manager</td><td class="num">1</td><td class="num">1</td><td>—</td></tr><tr><td>Pari</td><td class="num">5</td><td class="num">5</td><td><span class="pill g">Aggregato</span></td></tr><tr><td>Riporti</td><td class="num">2</td><td class="num">2</td><td><span class="pill n">Sotto soglia → in "Altri"</span></td></tr><tr><td>Esterni</td><td class="num">1</td><td class="num">0</td><td>—</td></tr></table></div>
 </div>
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="grid" style="grid-template-columns:1fr 1fr">
   <div class="card" style="border-top:3px solid var(--good)"><h3>Punti di forza</h3><ul class="list"><li><div><div class="t">Qualità tecnica · 4,6</div><div class="m">Concordanza alta tra tutte le categorie</div></div></li><li><div><div class="t">Ownership · 4,4</div><div class="m">Citato in 6 commenti su 8</div></div></li></ul></div>
   <div class="card" style="border-top:3px solid var(--warn)"><h3>Aree di sviluppo</h3><ul class="list"><li><div><div class="t">Leadership · 3,4</div><div class="m">Sotto il livello atteso per Tech Lead (4)</div></div></li><li><div><div class="t">Comunicazione · 3,8</div><div class="m">Self 3,0: si sottovaluta</div></div></li></ul></div>
  </div>
  <div class="card"><h3>Dettaglio per competenza e categoria</h3>{tbl}<div class="foot">Le categorie con meno di 3 risposte sono accorpate in "Altri". I commenti non sono attribuiti e sono mostrati in ordine casuale.</div></div>
  <div class="card"><h3>Commenti · Cosa dovrebbe continuare a fare <small>8 commenti</small></h3>
   <div class="fb">"Le sue design review sono le più utili del team: concrete, con esempi."</div>
   <div class="fb">"Prende in carico i problemi anche quando non sono suoi, e li chiude."</div>
   <div class="fb" style="border-color:var(--c4)">"Potrebbe esporsi di più nelle riunioni con i clienti: ha le risposte ma le tiene per sé."<div class="m">Categoria: Cosa dovrebbe iniziare a fare</div></div>
   <div style="display:flex;gap:8px;margin-top:10px"><span class="btn sm">＋ Azione IDP da "Leadership"</span><span class="btn sm">＋ Azione IDP da "Comunicazione"</span></div></div>
 </div>
</div>""", user=('Luca Bianchi','Senior Developer','LB')))

# ---------- 11 Onboarding ----------
def task(done,t,who,when,kind=''):
    return f'<div class="check"><span class="box{" on" if done else ""}"></span><div style="flex:1"><div style="{"color:var(--muted);text-decoration:line-through" if done else ""}">{t}</div><div style="font-size:12px;color:var(--muted)">{who} · {when}</div></div>{kind}</div>'
W('11-onboarding.html', shell('Home','dashboard',f"""
<div class="ph"><div><h1>Il tuo onboarding</h1><p>Giorno 42 di 90 · QA Engineer · Prodotto · manager Giulia Ferri · buddy Marco Conti</p></div><div><span class="btn">Persone chiave</span> <span class="btn">Documenti</span></div></div>
<div class="card" style="margin-bottom:16px;padding:14px 18px">
 <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><b>Avanzamento percorso</b><span>18 task su 26 completati · 69%</span></div>
 <div style="position:relative;height:10px;background:var(--grid);border-radius:6px"><div style="position:absolute;left:0;top:0;height:100%;width:69%;background:var(--brand);border-radius:6px"></div>
  {''.join(f'<div style="position:absolute;left:{x}%;top:-6px;width:22px;height:22px;margin-left:-11px;border-radius:50%;background:{c};border:3px solid #fff;box-shadow:0 0 0 1px var(--grid)"></div>' for x,c in [(0,'var(--good)'),(8,'var(--good)'),(33,'var(--good)'),(47,'var(--brand)'),(67,'var(--grid)'),(100,'var(--grid)')])}</div>
 <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:12px"><span>Pre-boarding</span><span>Settimana 1</span><span>30 giorni ✓</span><span style="color:var(--brand-2);font-weight:700">Oggi · g. 42</span><span>60 giorni</span><span>90 giorni · fine prova</span></div>
</div>
<div class="grid" style="grid-template-columns:1.3fr 1fr;align-items:start">
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>Questa settimana <small>3 da fare</small></h3>
   {task(False,'Definisci i tuoi primi obiettivi Q4 con Giulia','Tu','entro ven 19 set','<span class="pill b">Obiettivi</span>')}
   {task(False,'Completa la formazione "Sicurezza e GDPR"','Tu','entro 20 set · 40 min','<span class="pill n">Corso</span>')}
   {task(False,'Compila la survey dei 45 giorni','Tu','3 min · nominale','<span class="pill n">Survey</span>')}
   {task(True,'Shadowing con Marco sul flusso di rilascio','Tu + buddy','fatto il 9 set')}
   {task(True,'Presentati al team Prodotto (5 min)','Tu','fatto il 2 set')}
  </div>
  <div class="card"><h3>Prossima milestone · check-in 60 giorni <small>1 ottobre</small></h3>
   <div style="font-size:13px;color:var(--ink2)">1:1 con Giulia con agenda "Check-in 60 giorni": cosa funziona, cosa manca, aspettative per la fine del periodo di prova. Prima dell'incontro riceverai 4 domande da compilare.</div>
   <div style="display:flex;gap:8px;margin-top:12px"><span class="btn sm">Vedi agenda</span><span class="btn sm">Aggiungi un punto</span></div></div>
  <div class="card"><h3>Cosa fanno gli altri per te <small>visibile solo a te e HR</small></h3>
   {task(True,'Attivazione accessi e laptop','IT','fatto 28 lug')}
   {task(True,'Primo 1:1 e piano dei 30 giorni','Giulia (manager)','fatto 1 ago')}
   {task(False,'Feedback di metà periodo di prova','Giulia (manager)','entro 30 set')}
   {task(False,'Iscrizione al piano welfare 2026 (pro-rata)','HR','entro 30 set')}
  </div>
 </div>
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>Le tue persone</h3><ul class="list">
   <li><span class="av">GF</span><div><div class="t">Giulia Ferri</div><div class="m">Manager · prossimo 1:1 mar 16 · 11:00</div></div></li>
   <li><span class="av" style="background:var(--c3)">MC</span><div><div class="t">Marco Conti</div><div class="m">Buddy · "chiedimi qualsiasi cosa, davvero"</div></div></li>
   <li><span class="av" style="background:var(--c2)">CM</span><div><div class="t">Chiara Moretti</div><div class="m">HR Business Partner</div></div></li></ul></div>
  <div class="card"><h3>Come sta andando <small>survey 7 e 30 giorni</small></h3>
   <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--grid)"><span>Mi sento accolto/a nel team</span><b>5/5</b></div>
   <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--grid)"><span>Ho gli strumenti per lavorare</span><b>4/5</b></div>
   <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0"><span>Capisco cosa ci si aspetta da me</span><b style="color:var(--warn-text)">3/5</b></div>
   <div class="suggest" style="margin-top:10px;font-size:12px">Il punteggio su "aspettative" ha generato un promemoria a Giulia: il task "Definisci i tuoi primi obiettivi" è stato anticipato.</div></div>
  <div class="card"><h3>Documenti utili</h3><ul class="list" style="font-size:13px"><li><div><div class="t">📄 Manuale del dipendente</div><div class="m">preso visione il 28 lug</div></div></li><li><div><div class="t">📄 Regolamento welfare 2026</div><div class="m">da leggere</div></div></li><li><div><div class="t">🔗 Runbook rilasci Prodotto</div><div class="m">wiki</div></div></li></ul></div>
 </div>
</div>""", user=('Elena Parisi','QA Engineer','EP')))

# ---------- 12 Piano welfare HR ----------
W('12-welfare-admin.html', shell('Welfare','welfare',f"""
<div class="ph"><div><h1>Piano welfare 2026 <span class="pill g" style="vertical-align:middle">Attivo</span></h1><p>1 gen – 31 dic 2026 · 214 persone · 3 categorie omogenee · budget 268.400 €</p></div><div><span class="btn">Payroll settembre</span> <span class="btn p">Modifica piano</span></div></div>
<div class="tabs"><a>Panoramica</a><a class="on">Configurazione</a><a>Richieste (23 in coda)</a><a>Provider</a><a>Report</a></div>
<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>Popolazione e fonti di budget</h3>
   <table><tr><th>Categoria omogenea</th><th class="num">Persone</th><th>Fonte</th><th class="num">Importo/persona</th><th>Accredito</th></tr>
   <tr><td><b>Impiegati e quadri</b><div style="font-size:12px;color:var(--muted)">CCNL Commercio · tempo indeterminato</div></td><td class="num">156</td><td>On top azienda<br>CCNL</td><td class="num">800 €<br>200 €</td><td>1 gen<br>1 giu</td></tr>
   <tr><td><b>Dirigenti</b></td><td class="num">8</td><td>On top azienda</td><td class="num">2.000 €</td><td>1 gen</td></tr>
   <tr><td><b>Operai e tempo determinato</b><div style="font-size:12px;color:var(--muted)">pro-rata sui mesi</div></td><td class="num">50</td><td>CCNL</td><td class="num">200 €</td><td>1 giu</td></tr>
   <tr><td><b>Tutti</b></td><td class="num">214</td><td>Conversione premio di risultato<br><span style="font-size:12px;color:var(--muted)">finestra 1–31 mar · min 25% · max 100%</span></td><td class="num">scelta del dipendente</td><td>1 apr</td></tr>
   </table>
   <div class="prop" style="margin-top:12px"><div class="k">Roll-over</div><div>Residuo trasferito al 2027 fino a 300 €; oltre, perso con avviso a 60/30/7 gg</div><div class="k">Regolamento</div><div>📄 Regolamento_welfare_2026_v2.pdf · presa visione obbligatoria (208/214)</div></div></div>
  <div class="card"><h3>Soglie fiscali 2026 <small>preset aggiornato · modificabile</small></h3>
   <table><tr><th>Categoria</th><th>Regime</th><th class="num">Soglia annua</th><th>Condizione</th></tr>
   <tr><td>Buoni acquisto / fringe benefit</td><td><span class="pill w">Soglia</span></td><td class="num">1.000 €</td><td>Standard</td></tr>
   <tr><td>Buoni acquisto / fringe benefit</td><td><span class="pill w">Soglia</span></td><td class="num">2.000 €</td><td>Figli a carico dichiarati</td></tr>
   <tr><td>Istruzione, sanità, previdenza, trasporti, cultura</td><td><span class="pill g">Esente</span></td><td class="num">—</td><td>Documentazione richiesta</td></tr>
   <tr><td>Interessi mutuo prima casa</td><td><span class="pill g">Esente</span></td><td class="num">—</td><td>Certificazione banca</td></tr>
   </table><div class="foot">Il sistema applica le soglie per anno fiscale e per persona. I valori sono responsabilità dell'HR/consulente del lavoro; il simulatore fornisce stime indicative.</div></div>
 </div>
 <div style="display:flex;flex-direction:column;gap:16px">
  <div class="card"><h3>Catalogo e provider</h3>
   <div class="check"><span class="box on"></span><div style="flex:1"><div><b>Provider voucher</b> · Edenred (API)</div><div style="font-size:12px;color:var(--muted)">Sincronizzato 2 ore fa · 1.240 voci · saldo presso provider 41.200 €</div></div><span class="pill g">Connesso</span></div>
   <div class="check"><span class="box on"></span><div style="flex:1"><div><b>Catalogo interno</b> · 14 convenzioni</div><div style="font-size:12px;color:var(--muted)">Palestra FitLab −20%, asilo nido Girotondo, abbonamento ATM…</div></div><span class="btn sm">Gestisci</span></div>
   <div class="check"><span class="box on"></span><div style="flex:1"><div><b>Rimborsi con giustificativo</b></div><div style="font-size:12px;color:var(--muted)">Approvatori: Chiara Moretti, Ufficio Personale · SLA 5 giorni lavorativi</div></div><span class="btn sm">Regole</span></div>
   <div class="check" style="border:0"><span class="box"></span><div style="flex:1"><div><b>Previdenza e sanità</b> · versamenti a fondi</div><div style="font-size:12px;color:var(--muted)">Non attivo · richiede dati fondo per categoria</div></div><span class="btn sm">Attiva</span></div></div>
  <div class="card"><h3>Payroll <small>flusso mensile</small></h3>
   <div class="prop"><div class="k">Sistema paghe</div><div>Zucchetti · tracciato CSV "WEL-01"</div><div class="k">Prossimo flusso</div><div>30 set · 41 rimborsi approvati · 6.812,40 € · 3 eccedenze soglia da assoggettare</div><div class="k">Ultimo</div><div>31 ago · confermato da paghe il 3 set</div></div>
   <div style="display:flex;gap:8px;margin-top:12px"><span class="btn sm">Anteprima flusso</span><span class="btn sm">Storico</span></div></div>
  <div class="card"><h3>Andamento <small>al 13 set</small></h3>
   <div class="grid kpis" style="grid-template-columns:repeat(3,1fr);gap:10px">
    <div><div style="font-size:12px;color:var(--ink2)">Take-up</div><div style="font-size:24px;font-weight:700">78%</div><div style="font-size:11px;color:var(--good-text)">+9 pt vs 2025</div></div>
    <div><div style="font-size:12px;color:var(--ink2)">Budget usato</div><div style="font-size:24px;font-weight:700">54%</div><div style="font-size:11px;color:var(--muted)">145.100 €</div></div>
    <div><div style="font-size:12px;color:var(--ink2)">Premio convertito</div><div style="font-size:24px;font-weight:700">61%</div><div style="font-size:11px;color:var(--muted)">131 persone</div></div></div>
   <div class="suggest" style="margin-top:12px;font-size:12px">⚠ 37 persone hanno più di 500 € in scadenza al 31/12 e nessuna richiesta negli ultimi 90 giorni: invia promemoria mirato.</div></div>
 </div>
</div>""", user=('Chiara Moretti','HR Admin','CM')))

print("html ok")
