const KEY = '3dprint_collection';
let state = {
  sets: [], view: 'collection', displayMode: 'grid',
  search: '', filterStatus: '', filterCreator: '', filterTags: [],
  sortBy: 'name', sortAsc: true, editingId: null, pendingImage: '', filtersOpen: false,
};

function load() { try { const r = localStorage.getItem(KEY); if (r) state.sets = JSON.parse(r); } catch(e) { state.sets = []; } }
function save() { localStorage.setItem(KEY, JSON.stringify(state.sets)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

const STATUS_LABEL = { owned:'Possédé', printing:'En impression', wishlist:'Wishlist', painted:'Peint' };
const STATUS_CLASS = { owned:'badge-owned', printing:'badge-printing', wishlist:'badge-wishlist', painted:'badge-painted' };
function statusLabel(s) { return STATUS_LABEL[s] || s; }
function statusClass(s) { return STATUS_CLASS[s] || ''; }
function parseTags(str) { return (str||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean); }
function fmtDate(d) { if (!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:dt.toLocaleDateString('fr-FR'); }
function allCreators() { return [...new Set(state.sets.map(s=>s.creator).filter(Boolean))].sort(); }
function allTags() { const t=new Set(); state.sets.forEach(s=>(s.tags||[]).forEach(g=>t.add(g))); return [...t].sort(); }
function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function filteredSets() {
  let sets = [...state.sets];
  const q = state.search.toLowerCase();
  if (q) sets = sets.filter(s =>
    s.name.toLowerCase().includes(q) ||
    (s.creator||'').toLowerCase().includes(q) ||
    (s.tags||[]).some(t=>t.includes(q)) ||
    (s.notes||'').toLowerCase().includes(q) ||
    (s.platform||'').toLowerCase().includes(q)
  );
  if (state.filterStatus) sets = sets.filter(s => s.status === state.filterStatus);
  if (state.filterCreator) sets = sets.filter(s => s.creator === state.filterCreator);
  if (state.filterTags.length) sets = sets.filter(s => state.filterTags.every(t=>(s.tags||[]).includes(t)));
  sets.sort((a,b) => {
    const k = state.sortBy;
    const va = k==='name'?a.name : k==='creator'?(a.creator||'') : k==='date'?(a.addedAt||'') : (a.status||'');
    const vb = k==='name'?b.name : k==='creator'?(b.creator||'') : k==='date'?(b.addedAt||'') : (b.status||'');
    const c = va.localeCompare(vb,'fr',{sensitivity:'base'});
    return state.sortAsc ? c : -c;
  });
  return sets;
}

function render() { renderCollection(); renderCreators(); renderStats(); renderFilterCreators(); renderFilterTags(); updateDatalist(); }

function renderCollection() {
  const sets = filteredSets();
  const cont = $('cards-container'), empty = $('empty-state');
  $('count-label').textContent = `${sets.length} set${sets.length!==1?'s':''}`;
  if (!sets.length) { cont.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display = 'none';
  cont.classList.toggle('list-view', state.displayMode==='list');
  cont.innerHTML = sets.map(cardHTML).join('');
  cont.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', e => { if (!e.target.closest('.card-action-btn')) openDetail(el.dataset.id); });
  });
  cont.querySelectorAll('.edit-btn').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); openEdit(el.dataset.id); }));
  cont.querySelectorAll('.delete-btn').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); deleteSet(el.dataset.id); }));
}

function cardHTML(s) {
  const img = s.image
    ? `<img class="card-image" src="${s.image}" alt="${esc(s.name)}" loading="lazy" />`
    : `<div class="card-image-placeholder">📦</div>`;
  const tags = (s.tags||[]).slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('');
  const more = (s.tags||[]).length>3 ? `<span class="tag">+${(s.tags||[]).length-3}</span>` : '';
  const meta = [s.price?`${s.price}€`:'', s.filesCount?`${s.filesCount} fichiers`:''].filter(Boolean).join(' · ');
  return `<div class="card" data-id="${s.id}">
    ${img}
    <span class="card-badge ${statusClass(s.status)}">${statusLabel(s.status)}</span>
    <div class="card-actions">
      <button class="card-action-btn edit-btn" data-id="${s.id}" title="Modifier">✏</button>
      <button class="card-action-btn delete delete-btn" data-id="${s.id}" title="Supprimer">🗑</button>
    </div>
    <div class="card-body">
      <div class="card-name" title="${esc(s.name)}">${esc(s.name)}</div>
      <div class="card-creator">${esc(s.creator||'—')}</div>
      <div class="card-tags">${tags}${more}</div>
      ${meta?`<div class="card-meta">${meta}</div>`:''}
    </div>
  </div>`;
}

function renderCreators() {
  const byC = {};
  state.sets.forEach(s => { const c=s.creator||'Inconnu'; (byC[c]=byC[c]||[]).push(s); });
  $('creators-container').innerHTML = Object.entries(byC).sort(([a],[b])=>a.localeCompare(b,'fr')).map(([creator, sets]) => {
    const thumbs = sets.slice(0,6).map(s => s.image
      ? `<img class="creator-thumb" src="${s.image}" alt="" />`
      : `<div class="creator-thumb">3D</div>`).join('');
    return `<div class="creator-card" onclick="filterByCreator('${esc(creator)}')">
      <div class="creator-name">${esc(creator)}</div>
      <div class="creator-count">${sets.length} set${sets.length!==1?'s':''}</div>
      <div class="creator-thumbs">${thumbs}</div>
    </div>`;
  }).join('');
}

function renderStats() {
  const byS={}, total=state.sets.length; let price=0, files=0;
  state.sets.forEach(s=>{ byS[s.status]=(byS[s.status]||0)+1; if(s.price) price+=parseFloat(s.price)||0; if(s.filesCount) files+=parseInt(s.filesCount)||0; });
  const data = [
    {v:total,l:'Sets total'},{v:allCreators().length,l:'Créateurs'},
    {v:byS.owned||0,l:'Possédés'},{v:byS.printing||0,l:'En impression'},
    {v:byS.wishlist||0,l:'Wishlist'},{v:byS.painted||0,l:'Peints'},
    {v:price>0?price.toFixed(2)+'€':'—',l:'Total dépensé'},{v:files||'—',l:'Fichiers total'},
  ];
  $('stats-container').innerHTML = data.map(({v,l})=>`<div class="stat-card"><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div>`).join('');
}

function renderFilterCreators() {
  const sel=$('filter-creator'), cur=sel.value;
  sel.innerHTML = '<option value="">Tous</option>' + allCreators().map(c=>`<option value="${esc(c)}" ${c===cur?'selected':''}>${esc(c)}</option>`).join('');
}

function renderFilterTags() {
  const cont=$('filter-tags');
  cont.innerHTML = allTags().map(t=>`<button class="chip ${state.filterTags.includes(t)?'active':''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  cont.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    const tag=chip.dataset.tag;
    state.filterTags = state.filterTags.includes(tag) ? state.filterTags.filter(t=>t!==tag) : [...state.filterTags, tag];
    renderCollection(); renderFilterTags();
  }));
}

function updateDatalist() {
  $('creators-list').innerHTML = allCreators().map(c=>`<option value="${esc(c)}">`).join('');
}

// DETAIL
function openDetail(id) {
  const s = state.sets.find(x=>x.id===id); if (!s) return;
  const img = s.image ? `<img class="detail-image" src="${s.image}" alt="${esc(s.name)}" />` : '';
  const meta = [
    {l:'Statut',v:statusLabel(s.status)},{l:'Créateur',v:s.creator||'—'},{l:'Plateforme',v:s.platform||'—'},
    {l:'Prix',v:s.price?`${s.price}€`:'—'},{l:'Acquisition',v:fmtDate(s.acquisitionDate)},
    {l:'Fichiers',v:s.filesCount||'—'},{l:'Ajouté',v:fmtDate(s.addedAt)},
  ].map(({l,v})=>`<div class="meta-item"><span class="meta-label">${l}</span><span class="meta-value">${esc(String(v))}</span></div>`).join('');
  const tags = (s.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('');
  const notes = s.notes ? `<div class="detail-notes">${esc(s.notes)}</div>` : '';
  const link = s.url ? `<a class="detail-link" href="${esc(s.url)}" target="_blank" rel="noopener">↗ Voir le set</a>` : '';
  $('detail-content').innerHTML = `${img}<div class="detail-body">
    <div class="detail-header">
      <div><div class="detail-title">${esc(s.name)}</div><div class="detail-creator">${esc(s.creator||'')}</div></div>
      <div class="detail-actions">
        <button class="btn-secondary" onclick="openEdit('${s.id}')">Modifier</button>
        <button class="btn-secondary" onclick="deleteSet('${s.id}');closeDetail()">🗑</button>
      </div>
    </div>
    <div class="detail-meta">${meta}</div>
    ${tags?`<div class="detail-tags">${tags}</div>`:''}
    ${notes}${link}
  </div>`;
  $('detail-overlay').classList.add('open');
}
function closeDetail() { $('detail-overlay').classList.remove('open'); }

// ADD / EDIT
function openAdd() {
  state.editingId=null; state.pendingImage='';
  $('modal-title').textContent='Ajouter un set';
  $('modal-form').reset();
  $('image-preview-wrap').style.display='none';
  $('f-date').value=new Date().toISOString().slice(0,10);
  $('tags-preview').innerHTML='';
  $('modal-overlay').classList.add('open');
}
function openEdit(id) {
  const s=state.sets.find(x=>x.id===id); if(!s) return;
  closeDetail();
  state.editingId=id; state.pendingImage=s.image||'';
  $('modal-title').textContent='Modifier le set';
  $('f-name').value=s.name||''; $('f-creator').value=s.creator||''; $('f-platform').value=s.platform||'';
  $('f-status').value=s.status||'owned'; $('f-price').value=s.price||''; $('f-date').value=s.acquisitionDate||'';
  $('f-tags').value=(s.tags||[]).join(', '); $('f-notes').value=s.notes||'';
  $('f-url').value=s.url||''; $('f-files').value=s.filesCount||''; $('f-image-url').value='';
  updateTagsPreview();
  if (s.image) { $('image-preview').src=s.image; $('image-preview-wrap').style.display='block'; }
  else $('image-preview-wrap').style.display='none';
  $('modal-overlay').classList.add('open');
}
function closeModal() { $('modal-overlay').classList.remove('open'); state.editingId=null; state.pendingImage=''; }
function updateTagsPreview() {
  $('tags-preview').innerHTML = parseTags($('f-tags').value).map(t=>`<span class="tag">${esc(t)}</span>`).join('');
}

$('modal-form').addEventListener('submit', e => {
  e.preventDefault();
  const imageUrl=$('f-image-url').value.trim();
  const data = {
    name:$('f-name').value.trim(), creator:$('f-creator').value.trim(), platform:$('f-platform').value.trim(),
    status:$('f-status').value, price:$('f-price').value, acquisitionDate:$('f-date').value,
    tags:parseTags($('f-tags').value), notes:$('f-notes').value.trim(),
    url:$('f-url').value.trim(), filesCount:$('f-files').value, image:imageUrl||state.pendingImage,
  };
  if (state.editingId) {
    const i=state.sets.findIndex(s=>s.id===state.editingId);
    if (i!==-1) state.sets[i]={...state.sets[i],...data};
  } else {
    state.sets.push({id:uid(), addedAt:new Date().toISOString(), ...data});
  }
  save(); closeModal(); render();
});

function deleteSet(id) {
  if (!confirm('Supprimer ce set ?')) return;
  state.sets=state.sets.filter(s=>s.id!==id); save(); render();
}

window.filterByCreator = function(creator) {
  state.filterCreator=creator; switchView('collection');
  $('filter-creator').value=creator; renderCollection();
};

function switchView(v) {
  state.view=v;
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  $(`view-${v}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===v));
}

// IMAGE
$('f-image-file').addEventListener('change', e => {
  const file=e.target.files[0]; if (!file) return;
  const r=new FileReader();
  r.onload=ev=>{ state.pendingImage=ev.target.result; $('image-preview').src=ev.target.result; $('image-preview-wrap').style.display='block'; $('f-image-url').value=''; };
  r.readAsDataURL(file);
});
$('f-image-url').addEventListener('input', e => {
  const url=e.target.value.trim();
  if (url) { $('image-preview').src=url; $('image-preview-wrap').style.display='block'; state.pendingImage=url; }
  else { $('image-preview-wrap').style.display='none'; state.pendingImage=''; }
});
$('remove-img').addEventListener('click', () => {
  state.pendingImage=''; $('image-preview-wrap').style.display='none'; $('f-image-url').value=''; $('f-image-file').value='';
});
$('f-tags').addEventListener('input', updateTagsPreview);

// PDF EXPORT
$('btn-export-pdf').addEventListener('click', async () => {
  const sets=filteredSets(); if (!sets.length) { alert('Aucun set à exporter.'); return; }
  const { jsPDF }=window.jspdf;
  const doc=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
  const W=210, M=14, colW=(W-M*2-8)/2; let y=M, col=0;
  const rowH=60, imgH=32;
  doc.setFontSize(18); doc.setFont(undefined,'bold'); doc.text('3D Print Collection',M,y+6);
  doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.setTextColor(120,120,140);
  doc.text(`${sets.length} sets — ${new Date().toLocaleDateString('fr-FR')}`,M,y+13);
  y+=22;
  for (const s of sets) {
    if (y+rowH>285) { doc.addPage(); y=M; }
    const cx=M+col*(colW+8), cy=y;
    doc.setFillColor(30,33,48); doc.roundedRect(cx,cy,colW,rowH-2,3,3,'F');
    if (s.image&&s.image.startsWith('data:image')) { try { doc.addImage(s.image,cx+2,cy+2,colW-4,imgH); } catch(_) {} }
    const sc={owned:[34,197,94],printing:[249,115,22],wishlist:[59,130,246],painted:[168,85,247]}[s.status]||[100,100,100];
    doc.setFillColor(...sc); doc.roundedRect(cx+3,cy+3,22,5,1,1,'F');
    doc.setFontSize(6); doc.setTextColor(255,255,255); doc.text(statusLabel(s.status).substring(0,14),cx+5,cy+7);
    doc.setTextColor(232,234,240); doc.setFontSize(8.5); doc.setFont(undefined,'bold');
    doc.text(doc.splitTextToSize(s.name,colW-4)[0],cx+2,cy+imgH+8);
    doc.setFontSize(7.5); doc.setFont(undefined,'normal'); doc.setTextColor(147,153,178);
    doc.text(s.creator||'',cx+2,cy+imgH+14);
    if (s.tags?.length) { doc.setFontSize(6.5); doc.text(s.tags.slice(0,4).join(', '),cx+2,cy+imgH+20); }
    col++; if (col>=2) { col=0; y+=rowH; }
  }
  doc.save(`3dprint-collection-${Date.now()}.pdf`);
});

// JSON
$('btn-export-json').addEventListener('click', () => {
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(state.sets,null,2)],{type:'application/json'}));
  a.download=`3dprint-collection-${Date.now()}.json`; a.click();
});
$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', e => {
  const file=e.target.files[0]; if (!file) return;
  const r=new FileReader();
  r.onload=ev=>{
    try {
      const data=JSON.parse(ev.target.result);
      if (!Array.isArray(data)) { alert('Format JSON invalide.'); return; }
      if (confirm(`Importer ${data.length} sets ?`)) {
        const ids=new Set(state.sets.map(s=>s.id));
        data.forEach(s=>{ if(!ids.has(s.id)) state.sets.push(s); else state.sets[state.sets.findIndex(x=>x.id===s.id)]=s; });
        save(); render();
      }
    } catch(_) { alert('Erreur de lecture.'); }
  };
  r.readAsText(file); e.target.value='';
});

// UI EVENTS
$('btn-add').addEventListener('click', openAdd);
$('btn-add-empty').addEventListener('click', openAdd);
$('modal-close').addEventListener('click', closeModal);
$('btn-cancel').addEventListener('click', closeModal);
$('detail-close').addEventListener('click', closeDetail);
$('modal-overlay').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeModal(); });
$('detail-overlay').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeDetail(); });
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
$('search-input').addEventListener('input', e=>{ state.search=e.target.value; renderCollection(); });
$('filter-creator').addEventListener('change', e=>{ state.filterCreator=e.target.value; renderCollection(); });
document.querySelectorAll('#filter-status .chip').forEach(chip=>chip.addEventListener('click',()=>{
  document.querySelectorAll('#filter-status .chip').forEach(c=>c.classList.remove('active'));
  chip.classList.add('active'); state.filterStatus=chip.dataset.value; renderCollection();
}));
$('filters-toggle').addEventListener('click',()=>{
  state.filtersOpen=!state.filtersOpen;
  $('filters-panel').classList.toggle('open',state.filtersOpen);
});
$('view-grid').addEventListener('click',()=>{ state.displayMode='grid'; $('view-grid').classList.add('active'); $('view-list').classList.remove('active'); renderCollection(); });
$('view-list').addEventListener('click',()=>{ state.displayMode='list'; $('view-list').classList.add('active'); $('view-grid').classList.remove('active'); renderCollection(); });
$('sort-select').addEventListener('change',e=>{ state.sortBy=e.target.value; renderCollection(); });
$('sort-dir').addEventListener('click',()=>{ state.sortAsc=!state.sortAsc; $('sort-dir').textContent=state.sortAsc?'↓':'↑'; renderCollection(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){closeModal();closeDetail();} if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();openAdd();} });

function $(id) { return document.getElementById(id); }

load(); render();
