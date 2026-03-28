import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp, query, where, onSnapshot, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "AIzaSyAh7dwRs1j7Vxib70lB7mVRB-MNthAo5NA",
  authDomain: "peppe-ai-platform.firebaseapp.com",
  projectId: "peppe-ai-platform",
  storageBucket: "peppe-ai-platform.firebasestorage.app",
  messagingSenderId: "214462018633",
  appId: "1:214462018633:web:f224407eba3b107e27fb98",
  measurementId: "G-54RQ3L1EDW"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let currentUser = null;

const Cache = {
  location: {},
  Famiglie: {},
  Organizzazioni: {},
  people: {},
  external_workers: {}
};
let liveTasks = [], liveRequests = [], liveExpenses = [], liveCash = [], liveNotifications = [], liveLogs = [], liveWorkSessions = [];

const ICONS = {
 home: `<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,
 agenda: `<svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z"/></svg>`,
 finance: `<svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v-2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>`,
 directory: `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 18H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V8h2v2zm0-4H6V4h2v2zm6 12h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V8h4v2zm0-4h-4V4h4v2zm6 12h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V8h4v2zm0-4h-4V4h4v2z"/></svg>`,
 report: `<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>`
};

async function init() {
    await Promise.all(['locations','families','organizations','people','external_workers'].map(async coll => {
        const s = await getDocs(collection(db, coll));
        s.forEach(d => cache[coll][d.id] = d.data());
    }));
    
    const loginSelect = document.getElementById('loginSelect');
    Object.keys(cache.people).forEach(id => {
        const p = cache.people[id];
        if(p.active && p.appAccess) {
            let roleLbl = p.roles[0];
            if(id === 'giuseppe') roleLbl = 'Admin totale';
            else if(id === 'davide' || id === 'teresa') roleLbl = 'Supervisore';
            else if(id === 'stefano' || id === 'caterina') roleLbl = 'Approvatore';
            else if(id === 'paolo') roleLbl = 'Operativo';
            loginSelect.innerHTML += `<option value="${id}">${p.fullName} — ${roleLbl}</option>`;
        }
    });

    document.getElementById('btnLogin').addEventListener('click', () => {
        if(!loginSelect.value) return;
        currentUser = { id: loginSelect.value, ...cache.people[loginSelect.value] };
        document.getElementById('loginOverlay').classList.remove('open');
        setTimeout(() => document.getElementById('loginOverlay').style.display='none', 300);
        boot();
    });
    
    document.getElementById('bottomNav').addEventListener('click', (e) => {
        const b = e.target.closest('.nav-item');
        if(!b) return;
        document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        document.querySelectorAll('.view-section').forEach(v=>v.classList.remove('active'));
        document.getElementById(b.dataset.target).classList.add('active');
        document.getElementById('headerTitle').textContent = b.dataset.title;
    });

    document.getElementById('fabMain').addEventListener('click', openNewRequestWizard);
    document.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', e => {
        const p = e.target.closest('.modal-fs, .bottom-sheet'); if(p) p.classList.remove('open');
        const bd = document.getElementById('bsBackdrop'); if(bd) bd.classList.remove('open');
    }));
    document.getElementById('btnNotifs').addEventListener('click', () => { document.getElementById('notifPanel').classList.add('open'); });
}

const logActivity = async(a, eT, eI)=>addDoc(collection(db,"activity_logs"),{userId:currentUser.id,userName:currentUser.fullName,action:a,entityType:eT,entityId:eI,timestamp:serverTimestamp()});
const sendNotification = async(tI, t, m)=>addDoc(collection(db,"notifications"),{userId:tI,title:t,message:m,read:false,createdAt:serverTimestamp()});
window.markNotifRead = async(id)=>updateDoc(doc(db,"notifications",id),{read:true});

function boot() {
    const r = currentUser.roles||[];
    let nav = '';
    const isSuper = r.includes('admin') || r.includes('owner') || r.includes('management_control') || r.includes('admin_support') || r.includes('domain_approver');
    if(isSuper) {
        nav = `<button class="nav-item active" data-target="view-home" data-title="Home Controllo">${ICONS.home}<span>Home</span></button>
               <button class="nav-item" data-target="view-finance" data-title="Costi e Spese">${ICONS.finance}<span>Finanza</span></button>
               <button class="nav-item" data-target="view-directory" data-title="Rubrica">${ICONS.directory}<span>Enti</span></button>
               <button class="nav-item" data-target="view-report" data-title="Report Statistico">${ICONS.report}<span>Report</span></button>`;
    } else if(r.includes('technician')||r.includes('coordinator')) {
        nav = `<button class="nav-item active" data-target="view-home" data-title="Oggi">${ICONS.home}<span>Oggi</span></button>
               <button class="nav-item" data-target="view-agenda" data-title="Agenda">${ICONS.agenda}<span>Agenda</span></button>
               <button class="nav-item" data-target="view-finance" data-title="Cassa">${ICONS.finance}<span>Cassa</span></button>
               <button class="nav-item" data-target="view-directory" data-title="Rubrica">${ICONS.directory}<span>Rubrica</span></button>`;
        document.getElementById('headerWallet').classList.remove('hidden');
    } else {
        nav = `<button class="nav-item active" data-target="view-home" data-title="Le Mie Richieste">${ICONS.home}<span>Home</span></button>
               <button class="nav-item" data-target="view-directory" data-title="Proprietà">${ICONS.directory}<span>Proprietà</span></button>`;
    }
    document.getElementById('bottomNav').innerHTML = nav;

    onSnapshot(query(collection(db,"tasks"),orderBy("createdAt","desc")), snap=>{liveTasks=snap.docs.map(d=>({id:d.id,...d.data()})); renderHome(); renderAgenda(); renderReport();});
    onSnapshot(query(collection(db,"requests"),orderBy("createdAt","desc")), snap=>{liveRequests=snap.docs.map(d=>({id:d.id,...d.data()})); renderHome();});
    onSnapshot(query(collection(db,"expenses"),orderBy("createdAt","desc")), snap=>{liveExpenses=snap.docs.map(d=>({id:d.id,...d.data()})); renderFinance(); renderReport();});
    onSnapshot(query(collection(db,"cash_movements"),orderBy("createdAt","desc")), snap=>{liveCash=snap.docs.map(d=>({id:d.id,...d.data()})); if(r.includes('technician')){const bal=liveCash.filter(c=>c.givenTo===currentUser.id).sort((a,b)=>b.createdAt-a.createdAt)[0]?.balanceAfter||0; document.getElementById('headerWallet').textContent=`€${bal.toFixed(2)}`; currentUser.wallet=bal;} renderFinance();});
    onSnapshot(query(collection(db,"notifications"),where("userId","==",currentUser.id)), snap=>{liveNotifications=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.createdAt-a.createdAt); const x=liveNotifications.filter(n=>!n.read).length; const b=document.getElementById('notifBadge'); if(x>0){b.textContent=x;b.classList.remove('hidden');}else b.classList.add('hidden'); document.getElementById('notifList').innerHTML = liveNotifications.map(n=>`<div class="card" onclick="window.markNotifRead('${n.id}')" style="border-left:4px solid ${!n.read?'var(--danger)':'#ccc'}"><strong>${n.title}</strong><p>${n.message}</p></div>`).join('');});
    onSnapshot(query(collection(db,"activity_logs")), snap=>liveLogs=snap.docs.map(d=>({id:d.id,...d.data()})));
    onSnapshot(query(collection(db,"work_sessions"),orderBy("createdAt","desc")), snap=>{liveWorkSessions=snap.docs.map(d=>({id:d.id,...d.data()})); renderFinance(); renderReport();});
    renderDirectory();
}

const getEntTags=(fam,org)=>`${(fam||[]).map(x=>`<span class="entity-tag family">${cache.families[x]?.name}</span>`).join('')}${(org||[]).map(x=>`<span class="entity-tag org">${cache.organizations[x]?.name}</span>`).join('')}`;

function renderHome() {
    const feed = document.getElementById('feedList'); feed.innerHTML='';
    const isAdmin = currentUser.roles.includes('admin') || currentUser.roles.includes('owner');
    const isSupervisor = currentUser.roles.includes('management_control') || currentUser.roles.includes('admin_support');
    const isDomainApprover = currentUser.roles.includes('domain_approver');
    const isWorker = currentUser.roles.includes('technician');

    const myFam = [...(currentUser.familyIds||[]), ...(currentUser.familyIds||[]).map(f=>f.replace('famiglia_','fam_'))];
    const myOrgs = (currentUser.organizationRoles||[]).map(x=>x.organizationId);

    const canSee = (item) => {
        if(isAdmin) return true;
        if(isSupervisor) {
            if(item.status === 'pending_approval' || item.status === 'new') return true;
            if((item.familyIds||[]).includes('famiglia_teresa') || (item.familyIds||[]).includes('fam_teresa')) return true;
            if((item.organizationIds||[]).includes('eubios') || (item.organizationIds||[]).includes('org_eubios')) return true;
            return false;
        }
        if(isDomainApprover) {
            if(item.status === 'pending_approval' && (
                (item.familyIds||[]).some(x=>myFam.includes(x)) || 
                (item.organizationIds||[]).some(x=>myOrgs.includes(x))
            )) return true;
            if((item.familyIds||[]).some(x=>myFam.includes(x))) return true;
            if((item.organizationIds||[]).some(x=>myOrgs.includes(x))) return true;
            return false;
        }
        return false;
    };

    if(isAdmin || isSupervisor || isDomainApprover) {
        liveRequests.filter(r=> (r.status==='new'||r.status==='approved') && canSee(r)).forEach(r => feed.innerHTML += `<div class="card"><div class="card-header"><span class="status-badge status-${r.status}">${r.status}</span> <span style="font-size:0.8rem;color:var(--text-muted)">📍 ${cache.locations[r.locationId]?.name||'N/D'}</span></div><div class="card-title">${r.title}</div><p style="font-size:0.9rem;color:#666">${r.description}</p><div class="entity-tags">${getEntTags(r.familyIds,r.organizationIds)}</div><button class="btn btn-primary mt-2" onclick="window.openApproveWizard('${r.id}')">Assegna e Pianifica</button></div>`);
        liveTasks.filter(t=>t.status==='pending_approval' && canSee(t)).forEach(t => feed.innerHTML += `<div class="card" style="border-left: 5px solid var(--warning)"><div class="card-header"><span class="status-badge" style="background:var(--warning); color:white;">Proposto da Paolo</span></div><div class="card-title">${t.title}</div><div class="entity-tags">${getEntTags(t.familyIds,t.organizationIds)}</div><button class="btn btn-success mt-2" onclick="window.execAction('APPROVE_PROPOSED','${t.id}')">👍 Approva (Inizia Oggi)</button></div>`);
        liveTasks.filter(t=>t.status!=='completed' && t.status!=='pending_approval' && canSee(t)).forEach(t => feed.innerHTML += `<div class="card" onclick="window.openTaskDetail('${t.id}')"><div class="card-header"><span class="status-badge status-${t.status}">${t.status}</span> <div style="text-align:right"><div style="font-weight:bold;color:var(--primary);font-size:0.8rem">${t.scheduledStart?new Date(t.scheduledStart).toLocaleDateString():''}</div><span style="font-size:0.75rem;color:var(--text-muted)">📍 ${cache.locations[t.locationId]?.name}</span></div></div><div class="card-title">${t.title}</div><div class="entity-tags">${getEntTags(t.familyIds,t.organizationIds)}</div></div>`);
    } else if(isWorker) {
        const todayStr = new Date().toISOString().split('T')[0];
        let validTasks = liveTasks.filter(t => t.assignedTo === currentUser.id && t.status !== 'completed');
        
        const morning = []; const afternoon = []; const pendingProps = [];
        
        validTasks.forEach(t => {
            if(t.status==='pending_approval') { pendingProps.push(t); return; }
            const isUrgent = t.priority === 'high' || t.priority === 'urgent';
            let tgt = afternoon;
            if(t.scheduledStart) {
                const d = new Date(t.scheduledStart); const hrs = d.getHours(); const dStr = t.scheduledStart.split('T')[0];
                if(dStr < todayStr && !isUrgent) tgt = morning; // Overdue top priority
                else if(dStr === todayStr) tgt = hrs < 13 ? morning : afternoon;
                else if(isUrgent) tgt = morning;
                else return; // Future skipped
            } else { if(isUrgent) tgt = morning; }
            tgt.push(t);
        });

        const sortAgenda = (arr) => arr.sort((a,b) => {
            const aU=(a.priority==='high'||a.priority==='urgent')?1:0, bU=(b.priority==='high'||b.priority==='urgent')?1:0;
            if(aU !== bU) return bU - aU;
            if(a.locationId && b.locationId && a.locationId !== b.locationId) return a.locationId.localeCompare(b.locationId);
            if(a.scheduledStart && b.scheduledStart) return a.scheduledStart.localeCompare(b.scheduledStart);
            return 0;
        });

        sortAgenda(morning); sortAgenda(afternoon);

        let html = '';
        if(morning.length===0 && afternoon.length===0) { feed.innerHTML = '<div class="text-center text-muted">Nessuna attività pendente per oggi. Vai al mare! 🏖️</div>'; return; }

        const buildQA = (t) => `
            <div class="card" style="border-left: 5px solid ${t.priority==='urgent'||t.priority==='high'?'var(--danger)':'var(--primary)'}">
                <div class="card-header">
                    <div><span class="status-badge status-${t.status}">${t.status}</span> ${t.priority==='urgent'||t.priority==='high'?'<span class="status-badge badge-urgent">🚨 URGENTE</span>':''} ${t.needsMaterial?'<span class="status-badge badge-material">📦 NO MAT</span>':''}</div>
                    <div style="text-align:right"><span style="font-size:0.85rem; font-weight:bold; color:var(--text-main); display:block;">${t.scheduledStart?`🕒 ${new Date(t.scheduledStart).getHours().toString().padStart(2,'0')}:${new Date(t.scheduledStart).getMinutes().toString().padStart(2,'0')}`:'Nessun Orario'}</span><span style="font-size:0.75rem; color:var(--text-muted)">📍 ${cache.locations[t.locationId]?.name||'N/D'}</span></div>
                </div>
                <div class="card-title" onclick="window.openTaskDetail('${t.id}')" style="cursor:pointer; margin-bottom:8px;">${t.title}</div>
                <div class="entity-tags" style="margin-bottom:10px;">${getEntTags(t.familyIds,t.organizationIds)}</div>
                <div class="quick-actions-bar">
                    <button class="qa-btn qa-close" onclick="window.execAction('COMP_TASK','${t.id}')"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>Chiudi</button>
                    <button class="qa-btn qa-material" onclick="window.execAction('TOGGLE_MATERIAL','${t.id}')"><svg viewBox="0 0 24 24"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg>Materia</button>
                    <button class="qa-btn qa-expense" onclick="window.openExpenseWizard('${t.id}')"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.11-1.36-3.11-2.92v-.46h2.26v.29c0 .61.75 1.14 2.18 1.14 1.63 0 2.21-.6 2.21-1.31 0-.89-.96-1.32-2.5-1.84-1.86-.64-3.32-1.52-3.32-3.23 0-1.54 1.25-2.58 2.95-2.92V4h2.67v1.94c1.55.33 2.81 1.25 2.81 2.8v.4h-2.2v-.23c0-.68-.81-1.21-2.04-1.21-1.52 0-2.12.59-2.12 1.22 0 .84.85 1.22 2.5 1.76 1.88.62 3.32 1.54 3.32 3.26 0 1.58-1.23 2.62-2.94 2.91z"/></svg>Spesa</button>
                    <button class="qa-btn qa-reschedule" onclick="window.openRescheduleWizard('${t.id}')"><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>Sposta</button>
                </div>
            </div>`;

        if(morning.length > 0) { html += '<h3 style="margin-bottom:12px; color:var(--primary); font-size:1.1rem; border-bottom:2px solid var(--border); padding-bottom:5px;">☀️ Mattina</h3>'; morning.forEach(t => html += buildQA(t)); }
        if(afternoon.length > 0) { html += '<h3 style="margin-top:20px; margin-bottom:12px; color:var(--primary); font-size:1.1rem; border-bottom:2px solid var(--border); padding-bottom:5px;">🌙 Pomeriggio</h3>'; afternoon.forEach(t => html += buildQA(t)); }
        if(pendingProps.length > 0) { html += '<h3 style="margin-top:20px; margin-bottom:12px; color:var(--warning); font-size:1.1rem; border-bottom:2px solid var(--border); padding-bottom:5px;">🟡 Proposti (In Attesa)</h3>'; pendingProps.forEach(t => html += `<div class="card" style="border-left: 5px solid var(--warning)"><div class="card-header"><div><span class="status-badge" style="background:var(--warning); color:white;">⏳ IN ATTESA</span></div><div style="text-align:right"><span style="font-size:0.75rem; color:var(--text-muted)">📍 ${cache.locations[t.locationId]?.name||'N/D'}</span></div></div><div class="card-title">${t.title}</div><div class="entity-tags" style="margin-bottom:10px;">${getEntTags(t.familyIds,t.organizationIds)}</div></div>`); }
        feed.innerHTML = html;
    } else {
        liveTasks.filter(t=> t.requestedBy===currentUser.id || (t.familyIds||[]).some(b=>myFam.includes(b)) || (t.organizationIds||[]).some(b=>myOrgs.includes(b)))
                 .forEach(t => {
                     let hb = '';
                     if(t.status === 'pending_approval' && (
                         (t.familyIds||[]).some(b=>myFam.includes(b)) || (t.organizationIds||[]).some(b=>myOrgs.includes(b))
                     )) hb = `<button class="btn btn-success mt-2" onclick="window.execAction('APPROVE_PROPOSED','${t.id}')" style="display:block; width:100%;">👍 Approva Task Proposto</button>`;
                     feed.innerHTML += `<div class="card" onclick="window.openTaskDetail('${t.id}')"><div class="card-title">${t.title}</div><span class="status-badge status-${t.status} mt-2">${t.status}</span>${hb}</div>`;
                 });
    }
}

function renderAgenda() {
    const ag = document.getElementById('agendaList'); ag.innerHTML='';
    if(currentUser.roles.includes('technician')) ag.innerHTML += `<button class="btn btn-secondary mb-4" onclick="window.openWorkerSessionWizard()" style="width:100%; border-radius:12px; font-weight:bold;">👨‍🔧 Registra Giornata Manovale</button>`;
    const q = currentUser.roles.includes('technician') ? liveTasks.filter(t=>t.assignedTo===currentUser.id) : liveTasks;
    q.filter(t=>t.scheduledStart).sort((a,b)=>a.scheduledStart.localeCompare(b.scheduledStart)).forEach(t => {
        ag.innerHTML += `<div class="card" onclick="window.openTaskDetail('${t.id}')" style="border-left:4px solid var(--primary);"><div class="flex-between"><div style="font-weight:bold;">🕒 ${t.scheduledStart.split('T')[1]} - ${new Date(t.scheduledStart).getDate()}/${new Date(t.scheduledStart).getMonth()+1}</div><div style="font-size:0.8rem; background:#eef2ff; padding:3px 8px; border-radius:12px;">👤 ${t.assignedTo}</div></div><div class="card-title mt-2">${t.title}</div></div>`;
    });
}

function renderFinance() {
    const fl = document.getElementById('financeList'); fl.innerHTML='';
    const isSuper = currentUser.roles.includes('admin') || currentUser.roles.includes('owner') || currentUser.roles.includes('management_control') || currentUser.roles.includes('admin_support') || currentUser.roles.includes('domain_approver');
    
    if(currentUser.roles.includes('technician') && !isSuper) {
        let h = `<h3>Le Mie Spese (Da Giustificare)</h3>`;
        const pend = liveExpenses.filter(e => e.paidBy === currentUser.id && e.status === 'pending_approval');
        if(pend.length === 0) h += `<p class="text-muted text-center">Nessuna spesa in sospeso.</p>`;
        pend.forEach(e => {
            h += `<div class="card" style="border-left: 4px solid var(--warning)">
                <div class="flex-between"><strong>€ ${e.amount.toFixed(2)}</strong> <span class="status-badge" style="background:var(--warning); color:white;">⏳ IN ATTESA</span></div>
                <div class="card-meta mt-2">${e.description}</div>
                ${!e.receiptUrl ? `<div class="mt-2"><span class="status-badge" style="background:#fee2e2; color:#b91c1c;">⚠️ MANCA SCONTRINO</span></div><button class="btn btn-secondary mt-2" onclick="window.attachReceipt('${e.id}')">📷 Fai Foto Scontrino</button>` : `<div class="mt-2"><span class="status-badge" style="background:#d1fae5; color:#059669;">🧾 SCONTRINO OK</span></div>`}
            </div>`;
        });

        h += `<h3 class="mt-4">Storico Cassa</h3><ul style="list-style:none; padding:10px 0;">`;
        liveCash.filter(c=>c.givenTo===currentUser.id).sort((a,b)=>b.createdAt-a.createdAt).forEach(c=> { const p=c.type==='advance'||c.type==='reimbursement'||c.type==='adjustment'; h+=`<li class="flex-between" style="padding:12px 0; border-bottom:1px solid var(--border);"><span>${c.reason||c.type}</span> <strong style="color:${p?'var(--success)':'var(--danger)'}">${p?'+':'-'}€${c.amount.toFixed(2)}</strong></li>`});
        fl.innerHTML = h+`</ul><button class="btn btn-primary mt-4 mb-4" onclick="window.openExpenseWizard()">➕ Aggiungi Spesa (Preleva da Cassa)</button>`;
    }
    if(isSuper) {
        let h = `<h3>Fondi Operatori</h3>`;
        Object.values(cache.people).filter(p=>p.roles.includes('technician') && p.id!=='worker_luca').forEach(w => {
            const cList = liveCash.filter(c=>c.givenTo===w.id).sort((a,b)=>b.createdAt-a.createdAt);
            const bal = cList.length > 0 ? cList[0].balanceAfter : 0;
            h += `<div class="card flex-between" style="align-items:center;"><div><strong>${w.fullName}</strong><div style="font-size:1.2rem; color:${bal<0?'var(--danger)':'var(--success)'}; font-weight:bold;">€ ${bal.toFixed(2)}</div></div> <button class="btn btn-info" style="width:auto; padding:8px 15px;" onclick="window.topUpWallet('${w.id}')">Ricarica Fondo</button></div>`;
        });
        h += `<h3 class="mt-4">Spese da Verificare & Allocare</h3>`;
        
        const isDomainAppr = currentUser.roles.includes('domain_approver');
        const myFam = [...(currentUser.familyIds||[]), ...(currentUser.familyIds||[]).map(f=>f.replace('famiglia_','fam_'))];
        const myOrgs = (currentUser.organizationRoles||[]).map(x=>x.organizationId);

        let unalloc = liveExpenses.filter(e => e.status === 'pending_approval' || !e.allocations || e.allocations.length === 0);
        
        if(isDomainAppr) {
            unalloc = unalloc.filter(e => {
                if(e.taskId) {
                    const t = liveTasks.find(x=>x.id===e.taskId);
                    if(t && ((t.familyIds||[]).some(b=>myFam.includes(b)) || (t.organizationIds||[]).some(b=>myOrgs.includes(b)))) return true;
                }
                if((e.allocations||[]).some(a=> myFam.includes(a.entityId) || myOrgs.includes(a.entityId))) return true;
                return false;
            });
        }
        
        if(unalloc.length === 0) h += `<p class="text-muted text-center">Tutto in regola.</p>`;
        unalloc.forEach(e => {
            h += `<div class="card" style="border-left: 4px solid var(--primary)">
                <div class="flex-between">
                    <strong>€ ${e.amount.toFixed(2)}</strong>
                    ${(e.status==='pending_approval') ? `<span class="status-badge" style="background:var(--warning); color:white;">⏳ DA APPROVARE</span>` : `<span class="status-badge status-new">DA ALLOCARE</span>`}
                </div>
                <div class="card-meta mt-2">Da: ${cache.people[e.paidBy]?.shortName || e.paidBy} | ${e.description}</div>
                ${!e.receiptUrl ? `<div class="mt-2"><span class="status-badge" style="background:#fee2e2; color:#b91c1c;">⚠️ NESSUN SCONTRINO</span></div>` : `<div class="mt-2"><span class="status-badge" style="background:#d1fae5; color:#059669;">🧾 SCONTRINO OK</span></div>`}
                <button class="btn btn-primary mt-2" onclick="window.openAllocationWizard('${e.id}', 'expenses')">Verifica & Ripartisci Costo</button>
            </div>`;
        });
        h += `<h3 class="mt-4">Giornate Manovali da Allocare</h3>`;
        const unallocW = liveWorkSessions.filter(w => !w.allocations || w.allocations.length === 0);
        if(unallocW.length === 0) h += `<p class="text-muted text-center">Tutti i manovali sono stati allocati.</p>`;
        unallocW.forEach(w => {
            const wName = cache.external_workers[w.workerId]?.fullName || w.workerId.toUpperCase();
            h += `<div class="card" style="border-left: 4px solid var(--primary)"><div class="flex-between"><strong>€ ${w.totalCost.toFixed(2)}</strong><span class="status-badge status-new">DA ALLOCARE</span></div><div class="card-meta mt-2">Manovale: <strong>${wName}</strong> | In Data: ${w.date}</div><button class="btn btn-primary mt-2" onclick="window.openAllocationWizard('${w.id}', 'work_sessions')">Verifica & Ripartisci Costo</button></div>`;
        });
        fl.innerHTML = h;
    }
}

function renderDirectory() {
    const d = document.getElementById('directoryList'); d.innerHTML='';
    ['organizations','families','locations'].forEach(k => Object.values(cache[k]).forEach(o => d.innerHTML += `<div class="card mb-2 flex-between"><strong>${o.name}</strong><span class="entity-tag">${k}</span></div>`));
}

function renderReport() {
    const rep = document.getElementById('reportContent'); if(!rep) return;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let paoloCompleted = 0, paoloOpen = 0, paoloOverdue = 0;
    let visitedLocations = new Set();
    liveTasks.forEach(t => {
        if(t.assignedTo === 'worker_paolo') {
            if(t.status === 'completed') paoloCompleted++;
            else { paoloOpen++; if(t.scheduledStart && t.scheduledStart.split('T')[0] < todayStr) paoloOverdue++; }
            if(t.locationId) visitedLocations.add(t.locationId);
        }
    });

    let expTotal = 0, expApproved = 0, expPending = 0;
    liveExpenses.forEach(e => { expTotal += e.amount; if(e.status === 'pending_approval') expPending += e.amount; if(e.status === 'approved') expApproved += e.amount; });
    
    let workerCostTotal = 0; const workerCostMap = {};
    liveWorkSessions.forEach(w => { workerCostTotal += w.totalCost; workerCostMap[w.workerId] = (workerCostMap[w.workerId]||0) + w.totalCost; });
    
    const sumsFam = {}, sumsOrg = {};
    liveExpenses.filter(e => e.status === 'approved').forEach(e => { (e.allocations||[]).forEach(a => { const t = a.type === 'family' ? sumsFam : sumsOrg; t[a.entityId] = (t[a.entityId]||0) + a.amount; }); });
    liveWorkSessions.filter(w => w.allocations && w.allocations.length > 0).forEach(w => { (w.allocations||[]).forEach(a => { const t = a.type === 'family' ? sumsFam : sumsOrg; t[a.entityId] = (t[a.entityId]||0) + a.amount; }); });

    const opsByLoc = {};
    liveTasks.forEach(t => { if(t.locationId) opsByLoc[t.locationId] = (opsByLoc[t.locationId] || 0) + 1; });

    rep.innerHTML = `
        <div class="card mb-4" style="background:#f8fafc; border:1px solid #e2e8f0;">
            <h3 style="color:var(--primary); margin-bottom:10px;">👤 Attività Paolo (Worker)</h3>
            <div class="flex-between" style="padding:8px 0; border-bottom:1px solid #eee;"><span>Task Completati</span> <strong><span class="status-badge status-completed">${paoloCompleted}</span></strong></div>
            <div class="flex-between" style="padding:8px 0; border-bottom:1px solid #eee;"><span>Task Aperti</span> <strong><span class="status-badge status-assigned">${paoloOpen}</span></strong></div>
            <div class="flex-between" style="padding:8px 0; border-bottom:1px solid #eee;"><span>Task in Ritardo</span> <strong><span class="status-badge" style="background:var(--danger); color:white;">${paoloOverdue}</span></strong></div>
            <div class="flex-between" style="padding:8px 0;"><span>Luoghi unici visitati</span> <strong>${visitedLocations.size}</strong></div>
        </div>

        <div class="card mb-4" style="background:#f8fafc; border:1px solid #e2e8f0;">
            <h3 style="color:var(--primary); margin-bottom:10px;">💸 Sintesi Finanziaria</h3>
            <div class="flex-between" style="padding:8px 0; border-bottom:1px solid #eee;"><span>Spese Materiali Tot.</span> <strong style="font-size:1.1rem;">€ ${expTotal.toFixed(2)}</strong></div>
            <div class="flex-between" style="padding:8px 0; border-bottom:1px solid #eee;"><span>Costi Manovalanza Tot.</span> <strong style="color:var(--danger);">€ ${workerCostTotal.toFixed(2)}</strong></div>
            <div style="padding:0 0 10px 10px; font-size:0.85rem; color:#666;">${Object.entries(workerCostMap).map(([k,v])=>`↳ ${cache.external_workers[k]?.fullName||k}: €${v.toFixed(2)}`).join('<br>')}</div>
            <div class="flex-between" style="padding:8px 0; border-bottom:1px solid #eee;"><span>Approvate/Ripartite</span> <strong style="color:var(--success);">€ ${expApproved.toFixed(2)}</strong></div>
            <div class="flex-between" style="padding:8px 0;"><span>Attesa Scontrino/Verifica</span> <strong style="color:var(--warning);">€ ${expPending.toFixed(2)}</strong></div>
        </div>

        <div class="card mb-4" style="background:#f8fafc; border:1px solid #e2e8f0;">
            <h3 style="color:var(--primary); margin-bottom:10px;">📊 Allocazione Costi</h3>
            <h4 style="margin-top:10px; font-size:0.9rem; color:#666;">Per Famiglia</h4>
            <div style="margin-bottom:10px;">
                ${Object.keys(sumsFam).length === 0 ? '<div class="text-muted" style="font-size:0.8rem;">Nessun costo ripartito.</div>' : ''}
                ${Object.entries(sumsFam).map(([k,v])=>`<div class="flex-between" style="padding:6px 0; border-bottom:1px dashed #eee;"><span style="font-size:0.85rem;">${cache.families[k]?.name}</span><strong>€ ${v.toFixed(2)}</strong></div>`).join('')}
            </div>
            <h4 style="margin-top:15px; font-size:0.9rem; color:#666;">Per Organizzazione</h4>
            <div>
                ${Object.keys(sumsOrg).length === 0 ? '<div class="text-muted" style="font-size:0.8rem;">Nessun costo ripartito.</div>' : ''}
                ${Object.entries(sumsOrg).map(([k,v])=>`<div class="flex-between" style="padding:6px 0; border-bottom:1px dashed #eee;"><span style="font-size:0.85rem;">${cache.organizations[k]?.name}</span><strong>€ ${v.toFixed(2)}</strong></div>`).join('')}
            </div>
        </div>

        <div class="card mb-4" style="background:#f8fafc; border:1px solid #e2e8f0;">
            <h3 style="color:var(--primary); margin-bottom:10px;">📍 Operatività per Luogo</h3>
            ${Object.keys(opsByLoc).length === 0 ? '<div class="text-muted" style="font-size:0.8rem;">Nessuna operazione registrata.</div>' : ''}
            ${Object.entries(opsByLoc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="flex-between" style="padding:6px 0; border-bottom:1px dashed #eee;"><span style="font-size:0.85rem;">${cache.locations[k]?.name||k}</span><span class="entity-tag location">${v} Interv.</span></div>`).join('')}
        </div>

        <button class="btn btn-outline" style="margin-bottom:20px;" onclick="alert('Export CSV / Struttura Dati pronta nel database Firebase!')">📥 Esporta Dati</button>
    `;
}

window.openTaskDetail = (taskId) => {
    const t = liveTasks.find(x=>x.id===taskId);
    const ev = liveExpenses.filter(e=>e.taskId===taskId);
    const expHtml = ev.length===0?'Nessuna spesa.':ev.map(e=>`<div class="flex-between"><span>${e.description}</span><strong>€${e.amount.toFixed(2)}</strong></div><div style="font-size:0.75rem; color:var(--text-muted)">${(e.allocations||[]).map(a=>`${a.entityId}(${a.percentage.toFixed(0)}%)`).join(', ')}</div>`).join('');
    let supW = ``; if(t.supportWorkers && t.supportWorkers.length > 0) { supW = `<div class="mt-2"><span style="font-size:0.8rem; color:#666;">👨‍🔧 Supporto:</span> ${t.supportWorkers.map(w=>`<span class="entity-tag" style="background:#e0f2fe; color:#1e40af;">${cache.external_workers[w]?.fullName||w}</span>`).join(' ')}</div>`; }
    
    let acts = '';
    const isSuper = currentUser.roles.includes('admin') || currentUser.roles.includes('owner') || currentUser.roles.includes('management_control') || currentUser.roles.includes('admin_support') || currentUser.roles.includes('domain_approver');
    
    if(currentUser.roles.includes('technician') && t.assignedTo===currentUser.id) {
        if(t.status==='assigned') acts = `<button class="btn btn-primary" onclick="window.execAction('START_TASK','${t.id}')">Inizia Lavoro</button>`;
        else if(t.status==='in_progress') acts = `<button class="btn btn-secondary mb-2" onclick="window.openExpenseWizard('${t.id}')">➕ Aggiungi Spesa</button><button class="btn btn-success" onclick="window.execAction('COMP_TASK','${t.id}')">✔️ Completato</button>`;
    }
    if(currentUser.roles.includes('admin') || currentUser.roles.includes('owner')) acts += `<button class="btn btn-danger btn-outline mt-4" onclick="window.execAction('DEL_TASK','${t.id}')">🗑️ Elimina</button>`;

    document.getElementById('taskDetailContent').innerHTML = `<span class="status-badge status-${t.status} mb-2">${t.status}</span><h2 class="mb-2">${t.title}</h2><div class="entity-tags">${getEntTags(t.familyIds,t.organizationIds)}</div>${supW}<p class="mt-2">${t.description}</p><h4 class="mt-4">Spese (Allocation Summary)</h4>${expHtml}`;
    const logH = liveLogs.filter(l=>l.entityId===taskId).sort((a,b)=>b.timestamp-a.timestamp).map(l=>`<div style="font-size:0.75rem; border-left:2px solid #ccc; padding-left:5px;"><strong>${l.userName}</strong>: ${l.action}</div>`).join('');
    document.getElementById('taskDetailContent').innerHTML += isSuper ? `<h4 class="mt-4">Audit Logs</h4>${logH}` : '';
    document.getElementById('taskDetailActions').innerHTML = acts;
    document.getElementById('taskDetailModal').classList.add('open');
};

window.execAction = async (act, id) => {
    const bd = document.getElementById('bsBackdrop'); if(bd) bd.classList.remove('open');
    if(act==='APPROVE_PROPOSED') { const t=liveTasks.find(x=>x.id===id); await updateDoc(doc(db,"tasks",id),{status:'assigned', scheduledStart: new Date().toISOString()}); await logActivity('APPROVE_PROPOSED','task',id); sendNotification(t.assignedTo, 'Proposta Approvata', `${currentUser.fullName} ha approvato: ${t.title}`); return; }
    else if(act==='START_TASK') { await updateDoc(doc(db,"tasks",id),{status:'in_progress'}); await logActivity('START_TASK','task',id); }
    else if(act==='COMP_TASK') { const t=liveTasks.find(x=>x.id===id); await updateDoc(doc(db,"tasks",id),{status:'completed'}); await logActivity('COMP_TASK','task',id); if(t.assignedTo) sendNotification('admin', 'Task Completato', `${currentUser.fullName} ha completato: ${t.title}`); }
    else if(act==='DEL_TASK') { 
        if(!currentUser.roles.includes('admin') && !currentUser.roles.includes('owner')) { alert('Non hai permessi per eliminare'); return; }
        if(confirm("Sicuro?")) { await logActivity('DEL_TASK','task',id); await deleteDoc(doc(db,"tasks",id)); } 
    }
    else if(act==='TOGGLE_MATERIAL') { const t=liveTasks.find(x=>x.id===id); await updateDoc(doc(db,"tasks",id),{needsMaterial:!t.needsMaterial}); await logActivity(t.needsMaterial?'FOUND_MATERIAL':'MISSING_MATERIAL','task',id); if(!t.needsMaterial) sendNotification('admin', 'Materiale Mancante', `${t.title} è senza materiali.`); }
    const m = document.getElementById('taskDetailModal'); if(m) m.classList.remove('open');
};

function openNewRequestWizard() {
    const b = document.getElementById('wizardBody');
    document.getElementById('wizardTitle').textContent="Nuova Richiesta";
    b.innerHTML = `<form id="wizF"><input type="text" id="rt" placeholder="Titolo" required><textarea id="rd" placeholder="Descrizione" rows="3" required></textarea><select id="rl" required><option value="">-- Luogo --</option>${Object.values(cache.locations).map(l=>`<option value="${l.id}">${l.name}</option>`).join('')}</select><label>Proprietari/Beneficiari</label><div style="max-height:200px;overflow-y:auto;border:1px solid #ccc;padding:10px;margin-bottom:10px;">${Object.values(cache.organizations).map(o=>`<label class="check-item"><input type="checkbox" value="org_${o.id}">${o.name}</label>`).join('')}${Object.values(cache.families).map(f=>`<label class="check-item"><input type="checkbox" value="fam_${f.id}">${f.name}</label>`).join('')}</div><button type="submit" class="btn btn-primary">Invia Richiesta</button></form>`;
    document.getElementById('wizF').addEventListener('submit', async (e) => {
        e.preventDefault();
        const checks = Array.from(b.querySelectorAll('input[type=checkbox]:checked')).map(x=>x.value);
        if(checks.length===0) return alert("Devi selezionare almeno un centro di costo!");
        const orgIds=checks.filter(x=>x.startsWith('org_')).map(x=>x.slice(4)), famIds=checks.filter(x=>x.startsWith('fam_')).map(x=>x.slice(4));
        if(currentUser.roles.includes('technician')) {
            const tk = await addDoc(collection(db,"tasks"),{title:b.querySelector('#rt').value, description:b.querySelector('#rd').value, locationId:b.querySelector('#rl').value, organizationIds:orgIds, familyIds:famIds, assignedTo:currentUser.id, status:'pending_approval', createdAt:serverTimestamp()});
            await logActivity('PROPOSE_TASK','task',tk.id);
            ['admin','partner_teresa','partner_caterina'].forEach(pid => sendNotification(pid, 'Task Proposto da Paolo', `${b.querySelector('#rt').value}`));
        } else {
            const req = await addDoc(collection(db,"requests"),{title:b.querySelector('#rt').value, description:b.querySelector('#rd').value, locationId:b.querySelector('#rl').value, organizationIds:orgIds, familyIds:famIds, requestedBy:currentUser.id, status:'new', createdAt:serverTimestamp()});
            await logActivity('CREATE_REQUEST','request',req.id);
            sendNotification('admin', 'Nuova Richiesta', `${currentUser.fullName} ha inviato una nuova richiesta.`);
        }
        document.getElementById('bsBackdrop').classList.remove('open'); document.getElementById('actionWizardModal').classList.remove('open');
    });
    document.getElementById('actionWizardModal').classList.add('open');
}

window.openApproveWizard = (reqId) => {
    const r = liveRequests.find(x=>x.id===reqId);
    const b = document.getElementById('wizardBody'); document.getElementById('wizardTitle').textContent="Assegna";
    const d=new Date(); d.setDate(d.getDate()+1); d.setHours(8,0,0,0); const iso=(new Date(d-d.getTimezoneOffset()*60000)).toISOString().slice(0,16);
    b.innerHTML = `<form id="waF"><select id="waw" required>${Object.values(cache.people).filter(p=>p.roles.includes('technician')).map(p=>`<option value="${p.id}">${p.fullName}</option>`).join('')}</select><input type="datetime-local" id="was" value="${iso}" required><button type="submit" class="btn btn-success mt-4">Assegna e Crea Task</button></form>`;
    b.querySelector('#waF').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateDoc(doc(db,"requests",reqId),{status:'assigned'});
        await addDoc(collection(db,"tasks"),{requestId:reqId, title:r.title,description:r.description,locationId:r.locationId,familyIds:r.familyIds,organizationIds:r.organizationIds,assignedTo:b.querySelector('#waw').value, scheduledStart:b.querySelector('#was').value, status:'assigned', createdAt:serverTimestamp()});
        document.getElementById('actionWizardModal').classList.remove('open');
    });
    document.getElementById('actionWizardModal').classList.add('open');
};

window.openExpenseWizard = (taskId=null) => {
    const b = document.getElementById('wizardBody'); document.getElementById('wizardTitle').textContent="Aggiungi Spesa";
    const opts = liveTasks.filter(t=>t.status!=='completed').map(t=>`<option value="${t.id}" ${t.id===taskId?'selected':''}>${t.title}</option>`).join('');
    const fams = Object.values(cache.families).map(f=>`<label class="check-item"><input type="checkbox" class="we-alloc" value="fam_${f.id}">${f.name}</label>`).join('');
    const orgs = Object.values(cache.organizations).map(o=>`<label class="check-item"><input type="checkbox" class="we-alloc" value="org_${o.id}">${o.name}</label>`).join('');
    b.innerHTML = `<form id="weF">
        <label>Categoria</label>
        <select id="weCat"><option value="materiali">Materiali / Generico</option><option value="carburante">Carburante Veicolo</option></select>
        <div id="weVeicDiv" style="display:none;"><label>Veicolo</label><select id="weVeic"><option value="furgone">Furgone Aziendale</option><option value="auto">Auto</option><option value="altro">Altro</option></select></div>
        <label>Importo (€)</label>
        <input type="number" id="wea" step="0.01" placeholder="0.00" required>
        <label>Descrizione / Causale</label>
        <input type="text" id="wed" placeholder="Es. Viti e tasselli" required>
        <label>Seleziona Task (Applica automaticamente i centri di costo)</label>
        <select id="wet"><option value="">Nessun Task</option>${opts}</select>
        <div id="weAllocDiv" style="margin-top:10px; padding:10px; border:1px solid #ddd; background:#fafafa;">
            <label style="font-size:0.85rem; color:var(--danger)">Seleziona esplicitamente almeno un centro di costo se non hai scelto un Task:</label>
            <div style="max-height:100px;overflow-y:auto;">${fams}${orgs}</div>
        </div>
        <label class="mt-2">Giustificativo</label>
        <input type="file" id="weFile" accept="image/*" capture="environment" style="margin-bottom:10px; width:100%;">
        <textarea id="weNote" placeholder="Nota giustificativa (se non hai lo scontrino)" rows="2" style="width:100%; border:1px solid #ccc; border-radius:8px; padding:8px;"></textarea>
        <button type="submit" class="btn btn-success mt-4">Registra Spesa e Scala Cassa</button>
    </form>`;

    b.querySelector('#weCat').addEventListener('change', (e) => {
        b.querySelector('#weVeicDiv').style.display = e.target.value==='carburante' ? 'block' : 'none';
    });

    const tSel = b.querySelector('#wet');
    const allocDiv = b.querySelector('#weAllocDiv');
    const updateAllocVis = () => { allocDiv.style.display = tSel.value ? 'none' : 'block'; };
    tSel.addEventListener('change', updateAllocVis);
    updateAllocVis();

    b.querySelector('#weF').addEventListener('submit', async(e)=>{
        e.preventDefault(); 
        const amt = parseFloat(b.querySelector('#wea').value);
        const tId = b.querySelector('#wet').value;
        const cat = b.querySelector('#weCat').value;
        const veic = b.querySelector('#weVeic').value;
        const desc = b.querySelector('#wed').value;
        const note = b.querySelector('#weNote').value;
        const fileInput = b.querySelector('#weFile');
        
        let allocs = [];
        let hasAlloc = !!tId;
        
        if(tId) {
            const t = liveTasks.find(x=>x.id===tId);
            if(t) {
                const checks = [...(t.familyIds||[]).map(x=>'fam_'+x), ...(t.organizationIds||[]).map(x=>'org_'+x)];
                if(checks.length > 0) {
                    const q = amt / checks.length, pc = 100 / checks.length;
                    allocs = checks.map(s => ({
                        type: s.startsWith('fam_') ? 'family' : 'organization', 
                        entityId: s.replace('fam_','').replace('org_',''), 
                        amount: q, percentage: pc
                    }));
                }
            }
        } else {
            const checks = Array.from(b.querySelectorAll('.we-alloc:checked')).map(x=>x.value);
            if(checks.length === 0) return alert("Devi selezionare un Task o almeno un Centro di Costo!");
            hasAlloc = true;
            const q = amt / checks.length, pc = 100 / checks.length;
            allocs = checks.map(s => ({
                type: s.startsWith('fam_') ? 'family' : 'organization', 
                entityId: s.replace('fam_','').replace('org_',''), 
                amount: q, percentage: pc
            }));
        }

        const hasReceipt = fileInput.files.length > 0;
        const hasJust = note.trim().length > 0;
        let finalStatus = 'pending_approval';

        if(currentUser.id === 'worker_paolo') {
            if(amt <= 50) {
                if(hasAlloc && desc.trim().length > 0 && (hasReceipt || hasJust)) {
                    finalStatus = 'self_approved_by_paolo';
                }
            } else {
                if(cat === 'carburante' && veic === 'furgone' && hasAlloc && hasReceipt) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const fuelCount = liveExpenses.filter(ex => 
                        ex.paidBy === currentUser.id && 
                        ex.category === 'carburante' && 
                        ex.status === 'self_approved_by_paolo' && 
                        ex.dateStr === todayStr
                    ).length;
                    
                    if(fuelCount < 2) {
                        finalStatus = 'self_approved_by_paolo';
                    }
                }
            }
        }

        const receiptMock = hasReceipt ? ('receipt_' + Date.now() + '_' + fileInput.files[0].name) : null;
        
        const exp=await addDoc(collection(db,"expenses"),{
            taskId: tId, amount: amt, description: desc, category: cat, veicolo: cat==='carburante'?veic:null, 
            paidBy: currentUser.id, allocations: allocs, status: finalStatus, receiptUrl: receiptMock, justification: note,
            dateStr: new Date().toISOString().split('T')[0], createdAt: serverTimestamp()
        });
        
        if(currentUser.roles.includes('technician')) { 
            await addDoc(collection(db,"cash_movements"),{type:'expense',givenBy:currentUser.id,givenTo:currentUser.id,amount:amt,reason:desc, relatedExpenseId:exp.id,balanceAfter:(currentUser.wallet||0)-amt,createdAt:serverTimestamp()}); 
        }
        
        await logActivity('ADD_EXPENSE','expense',exp.id);
        sendNotification('admin', 'Nuova Spesa', `${currentUser.fullName} ha inserito spesa di €${amt} (${finalStatus})`);
        
        document.getElementById('bsBackdrop').classList.remove('open'); document.getElementById('actionWizardModal').classList.remove('open'); 
        const tdm=document.getElementById('taskDetailModal'); if(tdm) tdm.classList.remove('open');
    });
    document.getElementById('bsBackdrop').classList.add('open'); document.getElementById('actionWizardModal').classList.add('open');
};

window.openAllocationWizard = (itemId, coll='expenses') => {
    const e = coll==='expenses' ? liveExpenses.find(x=>x.id===itemId) : liveWorkSessions.find(x=>x.id===itemId); if(!e) return;
    const b = document.getElementById('wizardBody'); document.getElementById('wizardTitle').textContent="Ripartizione";
    let autoS = []; 
    if(coll==='expenses' && e.taskId) { const t=liveTasks.find(x=>x.id===e.taskId); if(t) autoS=[...(t.familyIds||[]).map(x=>'fam_'+x), ...(t.organizationIds||[]).map(x=>'org_'+x)]; }
    if(coll==='work_sessions' && e.tasks) { e.tasks.forEach(tid=>{const t=liveTasks.find(x=>x.id===tid); if(t){ (t.familyIds||[]).forEach(x=>{if(!autoS.includes('fam_'+x))autoS.push('fam_'+x)}); (t.organizationIds||[]).forEach(x=>{if(!autoS.includes('org_'+x))autoS.push('org_'+x)}); }}); }
    
    b.innerHTML = `<h2 class="text-center" style="color:var(--danger);">€${(e.amount||e.totalCost).toFixed(2)}</h2><div class="mt-4">${Object.values(cache.families).map(f=>`<label class="check-item flex-between">Fam: ${f.name} <input type="checkbox" class="wa-sel" value="fam_${f.id}" ${autoS.includes('fam_'+f.id)?'checked':''}></label>`).join('')}${Object.values(cache.organizations).map(o=>`<label class="check-item flex-between">Az: ${o.name} <input type="checkbox" class="wa-sel" value="org_${o.id}" ${autoS.includes('org_'+o.id)?'checked':''}></label>`).join('')}</div><div id="waRes" class="text-center mt-4 font-bold text-primary"></div><button id="waBtn" class="btn btn-primary mt-4">Salva Divisione Equa</button>`;
    
    const upd = () => { const c = b.querySelectorAll('.wa-sel:checked').length; const baseCost=e.amount||e.totalCost; b.querySelector('#waRes').textContent = c>0 ? `Quota: €${(baseCost/c).toFixed(2)} (${(100/c).toFixed(1)}%)` : 'Seleziona!'; };
    b.querySelectorAll('.wa-sel').forEach(x=>x.addEventListener('change', upd)); upd();
    
    b.querySelector('#waBtn').addEventListener('click', async () => {
        const sels = Array.from(b.querySelectorAll('.wa-sel:checked')).map(x=>x.value);
        if(sels.length===0) return;
        const baseCost=e.amount||e.totalCost;
        const q = baseCost/sels.length, pc = 100/sels.length;
        await updateDoc(doc(db,coll,itemId),{status: 'approved', allocations: sels.map(s => ({type:s.startsWith('fam_')?'family':'organization', entityId:s.replace('fam_','').replace('org_',''), amount:q, percentage:pc}))});
        document.getElementById('actionWizardModal').classList.remove('open'); document.getElementById('bsBackdrop').classList.remove('open');
    });
    document.getElementById('bsBackdrop').classList.add('open'); document.getElementById('actionWizardModal').classList.add('open');
};

window.attachReceipt = async (expId) => {
    const input = document.getElementById('nativeCameraInput');
    if(!input) return;
    const onCapture = async (e) => {
        if(e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            await updateDoc(doc(db,"expenses",expId), {receiptUrl: 'receipt_' + Date.now() + '_' + file.name});
            await logActivity('ATTACH_RECEIPT','expense',expId, `Acquisito file: ${file.name}`);
        }
        input.removeEventListener('change', onCapture);
    };
    input.addEventListener('change', onCapture);
    input.click();
};

window.topUpWallet = async (workerId) => {
    const w = cache.people[workerId];
    if(confirm(`Versare Acconto Cassa di €500 a ${w.fullName}?`)) {
        const cList = liveCash.filter(z=>z.givenTo===workerId).sort((a,b)=>b.createdAt-a.createdAt);
        const oldBal = cList.length > 0 ? cList[0].balanceAfter : 0;
        const newBal = oldBal + 500;
        await addDoc(collection(db,"cash_movements"),{type:'advance',givenBy:currentUser.id,givenTo:workerId,amount:500,reason:'Ricarica Cassa Operativa',balanceAfter:newBal,createdAt:serverTimestamp()});
    }
};

window.openRescheduleWizard = (taskId) => {
    const t = liveTasks.find(x=>x.id===taskId); if(!t) return;
    const b = document.getElementById('wizardBody'); document.getElementById('wizardTitle').textContent="Riprogramma";
    b.innerHTML = `<form id="wresF"><h3 style="margin-bottom:15px; color:var(--text-muted); font-size:1rem;">${t.title}</h3><label>Nuovo Inizio Previsto:</label><input type="datetime-local" id="wresDate" value="${(t.scheduledStart||'').slice(0,16)}" required><button type="submit" class="btn btn-info mt-4" style="background:var(--info); color:white;">Sposta e Salva</button></form>`;
    b.querySelector('#wresF').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateDoc(doc(db,"tasks",taskId), { scheduledStart: b.querySelector('#wresDate').value });
        document.getElementById('actionWizardModal').classList.remove('open');
    });
    document.getElementById('actionWizardModal').classList.add('open');
};

window.openWorkerSessionWizard = () => {
    const b = document.getElementById('wizardBody'); document.getElementById('wizardTitle').textContent="Giornata Manovale";
    const myTodayTasks = liveTasks.filter(t=>t.assignedTo===currentUser.id && t.status!=='completed');
    const taskChecks = myTodayTasks.map(t=>`<label class="check-item"><input type="checkbox" value="${t.id}"> ${t.title}</label>`).join('');
    if(myTodayTasks.length===0) return alert("Non hai task attivi a cui associare il manovale!");
    const wOpts = Object.values(cache.external_workers).filter(w=>w.active).map(w=>`<option value="${w.id}" data-rate="${w.dailyRate}">${w.fullName}</option>`).join('');
    b.innerHTML = `<form id="wwF">
        <label>Seleziona Manovale</label>
        <select id="wwn" required><option value="">-- Scegliere Manovale --</option>${wOpts}</select>
        <label>Costo Giornaliero Concordato (€)</label><input type="number" id="wwc" step="1" placeholder="Es. 80" required>
        <label>Seleziona i Task in cui ha aiutato (obbligatorio):</label>
        <div style="max-height:150px; overflow-y:auto; border:1px solid #ccc; padding:10px;">${taskChecks}</div>
        <button type="submit" class="btn btn-success mt-4">Salva Sessione Lavoro</button>
    </form>`;
    b.querySelector('#wwn').addEventListener('change', (e) => {
        const o = e.target.options[e.target.selectedIndex];
        if(o && o.dataset.rate) b.querySelector('#wwc').value = o.dataset.rate;
    });
    b.querySelector('#wwF').addEventListener('submit', async(e)=>{
        e.preventDefault();
        const tks = Array.from(b.querySelectorAll('input[type=checkbox]:checked')).map(x=>x.value);
        if(tks.length===0) return alert("Devi associare il manovale ad almeno un task!");
        const amt = parseFloat(b.querySelector('#wwc').value);
        const wId = b.querySelector('#wwn').value;
        const wName = cache.external_workers[wId]?.fullName || wId;
        const nw = await addDoc(collection(db,"work_sessions"),{workerId:wId, date:new Date().toISOString().split('T')[0], assignedBy:currentUser.id, tasks:tks, dailyRate:amt, totalCost:amt, status:'worked', allocations:[], createdAt:serverTimestamp()});
        for(let tid of tks) {
            const tkObj = liveTasks.find(x=>x.id===tid);
            if(tkObj) {
                const arr = tkObj.supportWorkers || [];
                if(!arr.includes(wId)) { arr.push(wId); updateDoc(doc(db,"tasks",tid),{supportWorkers: arr}); }
            }
        }
        await logActivity('ADD_WORK_SESSION','work_sessions',nw.id, `Manovale ${wName} inserito per €${amt}`);
        sendNotification('admin', 'Nuovo Costo Manovalanza', `${currentUser.fullName} ha inserito giornata per ${wName} (${amt}€)`);
        document.getElementById('bsBackdrop').classList.remove('open'); document.getElementById('actionWizardModal').classList.remove('open');
    });
    document.getElementById('bsBackdrop').classList.add('open'); document.getElementById('actionWizardModal').classList.add('open');
};

/* ===============================================================
   AI ASSISTANCE LAYER (Aiuto AI)
   =============================================================== */

window.openAiModal = () => {
    document.getElementById('aiInput').value = '';
    document.getElementById('aiResponseContainer').style.display = 'none';
    document.getElementById('aiLoadingIndicator').style.display = 'none';
    document.getElementById('aiHistory').innerHTML = '<div class="text-muted" style="font-size:0.8rem">Caricamento dello storico... (Mocked)</div>';
    
    const banner = document.getElementById('aiContextBanner');
    let ctx = 'Generale';
    if(document.getElementById('view-home').classList.contains('active')) ctx = 'Dashboard / Home';
    if(document.getElementById('view-finance').classList.contains('active')) ctx = 'Finanza / Spese';
    if(document.getElementById('taskDetailModal').classList.contains('open')) ctx = 'Dettaglio Task';
    banner.innerText = `Contesto attuale: ${ctx}`;
    banner.dataset.ctx = ctx;

    document.getElementById('aiAssistModal').classList.add('open');
};

document.getElementById('btnCloseAiModal').addEventListener('click', () => document.getElementById('aiAssistModal').classList.remove('open'));

// Phase 1 Mock / Client-side proxy for Gemini 
window.sendAIRequest = async (promptText, context, role) => {
    // TODO: implement actual fetch to backend serverless function pointing to Google AI Studio
    return new Promise(resolve => {
        setTimeout(() => {
            if(promptText.toLowerCase().includes('problema') || promptText.toLowerCase().includes('segnala')) {
                resolve({ type: "ISSUE_MODE", shortAnswer: "Vuoi segnalare un problema o anomalia. Posso preparare un Ticket Strutturato per te.", suggestedAction: "Confermi la creazione del ticket di supporto?", structuredOutput: { title: "Problema Segnalato", category: "technical_issue", priority: "high", summary: promptText } });
            } else if(promptText.toLowerCase().includes('richiesta')) {
                resolve({ type: "STRUCTURE_MODE", shortAnswer: "Ho capito che vuoi istituire una nuova richiesta operativa per la squadra.", suggestedAction: "Generiamo il record strutturato nel sistema?", structuredOutput: { detectedType: "request", title: "Nuova Richiesta da AI", summary: promptText } });
            } else {
                resolve({ type: "HELP_MODE", shortAnswer: "La piattaforma gestisce flussi di manutenzione con logica di dominio. Assicurati di usare l'apposita scheda in base al tuo ruolo (Tecnico, Super o Normale).", suggestedAction: "Procedi navigando tramite i tab in basso.", structuredOutput: null });
            }
        }, 1200);
    });
};

window.logAIInteraction = async (interactionData) => {
    try { await addDoc(collection(db, "ai_interactions"), interactionData); } catch(e) { console.error("Logging AI err:", e); }
};

window.createSupportRequestFromAI = async (struct) => {
    try {
        await addDoc(collection(db, "support_requests"), {
            createdBy: currentUser.id,
            createdByName: currentUser.fullName,
            createdByRole: currentUser.roles[0] || 'user',
            title: struct.title || 'Nuovo Problema',
            description: struct.summary || '',
            category: struct.category || 'functional_doubt',
            priority: struct.priority || 'medium',
            status: 'new',
            aiGeneratedSummary: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        alert('Ticket di supporto strutturato creato con successo!');
        document.getElementById('aiAssistModal').classList.remove('open');
    } catch(e) { alert("Errore creazione ticket."); }
};

window.submitAiPrompt = async () => {
    const prompt = document.getElementById('aiInput').value.trim();
    if(!prompt) return;

    document.getElementById('btnSubmitAi').style.display = 'none';
    document.getElementById('aiLoadingIndicator').style.display = 'block';
    document.getElementById('aiResponseContainer').style.display = 'none';

    const ctx = document.getElementById('aiContextBanner').dataset.ctx;
    
    try {
        const response = await window.sendAIRequest(prompt, ctx, currentUser.roles[0]);
        document.getElementById('btnSubmitAi').style.display = 'flex';
        document.getElementById('aiLoadingIndicator').style.display = 'none';
        
        const acts = document.getElementById('aiSuggestedActions');
        document.getElementById('aiResponseText').innerHTML = `<strong>L'AI dice:</strong><br/>${response.shortAnswer}`;
        let htmlActs = `<p style="font-size:0.85rem; color:#666; margin-top:10px;"><em>Suggerimento: ${response.suggestedAction}</em></p>`;
        
        if(response.type === "ISSUE_MODE" || response.type === "STRUCTURE_MODE") {
            const safeObj = encodeURIComponent(JSON.stringify(response.structuredOutput));
            htmlActs += `<button class="btn btn-primary" style="margin-top:10px; background:#10b981; width:100%;" onclick="window.createSupportRequestFromAI(JSON.parse(decodeURIComponent('${safeObj}')))">✅ Salva e Procedi</button>`;
        }
        
        acts.innerHTML = htmlActs;
        document.getElementById('aiResponseContainer').style.display = 'block';

        window.logAIInteraction({
            userId: currentUser.id, userName: currentUser.fullName, userRoles: currentUser.roles,
            screen: ctx, messageType: response.type,
            userInput: prompt, aiResponse: response.shortAnswer, suggestedAction: response.suggestedAction,
            createdAt: serverTimestamp(), modelName: "gemini-2.5-flash-mock", success: true
        });

    } catch(e) {
        document.getElementById('btnSubmitAi').style.display = 'flex';
        document.getElementById('aiLoadingIndicator').style.display = 'none';
        alert('Errore di connessione con AI.');
    }
};

init();
