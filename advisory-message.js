/* WxCC Desktop widget: <advisory-message> (auto-register + auto-upgrade) */
(function () {
  console.log("[AdvisoryMessage] script loaded");

  const TPL = document.createElement('template');
  TPL.innerHTML = `
    <style>
      :host { display:block; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#0f172a; }
      .card { border:1px solid #e5e7eb; border-radius:12px; padding:16px; box-shadow:0 1px 2px rgba(0,0,0,.04); background:#fff; }
      .row { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .muted { color:#64748b; font-size:12px; }
      .msg { font-size:16px; line-height:1.5; padding:12px; background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1; word-break:break-word; }
      button { border:1px solid #e5e7eb; background:#0ea5e9; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:600; }
      button[disabled] { opacity:.6; cursor:not-allowed; }
      .error { color:#dc2626; font-size:12px; margin-top:8px; white-space:pre-wrap }
      .kvs { display:grid; grid-template-columns: 120px 1fr; gap:6px 12px; margin-top:8px; }
      .kv-key { color:#64748b; font-size:12px; }
      .kv-val { font-size:12px; color:#0f172a; }
      textarea { width:100%; min-height:96px; padding:10px; border:1px solid #e5e7eb; border-radius:8px; resize:vertical; }
      .edit { margin-top:12px; display:none; }
      .btns { display:flex; gap:8px; margin-top:8px; }
    </style>
    <div class="card">
      <div class="row">
        <div>
          <div style="font-weight:700;">Desktop Advisory Message</div>
          <div class="muted" id="status">Idle</div>
        </div>
        <div>
          <button id="refreshBtn">Refresh</button>
          <button id="editToggle" style="display:none;background:#10b981;">Edit</button>
        </div>
      </div>
      <div style="margin-top:12px">
        <div class="muted">Current message (defaultValue)</div>
        <div class="msg" id="messageBox">—</div>
      </div>
      <div class="edit" id="editPanel">
        <div class="muted">New message</div>
        <textarea id="editText" placeholder="Type the advisory message…"></textarea>
        <div class="btns">
          <button id="saveBtn">Save</button>
          <button id="cancelBtn" style="background:#6b7280;">Cancel</button>
        </div>
      </div>
      <div class="kvs">
        <div class="kv-key">Variable ID</div><div class="kv-val" id="kvId">—</div>
        <div class="kv-key">Name</div><div class="kv-val" id="kvName">—</div>
        <div class="kv-key">Active</div><div class="kv-val" id="kvActive">—</div>
        <div class="kv-key">Last Updated</div><div class="kv-val" id="kvUpdated">—</div>
      </div>
      <div class="error" id="errorBox" hidden></div>
    </div>
  `;

  function dcToBaseUrl(dc){const s=(dc||'us1').toLowerCase();return `https://api.wxcc-${s}.cisco.com`;}
  function fmtTime(ms){if(ms==null)return'—';try{return new Date(Number(ms)).toLocaleString();}catch{return String(ms);} }

  class AdvisoryMessageEl extends HTMLElement {
    constructor(){
      super();
      this.attachShadow({mode:'open'}).appendChild(TPL.content.cloneNode(true));
      this._els={
        status:this.shadowRoot.getElementById('status'),
        refreshBtn:this.shadowRoot.getElementById('refreshBtn'),
        editToggle:this.shadowRoot.getElementById('editToggle'),
        editPanel:this.shadowRoot.getElementById('editPanel'),
        editText:this.shadowRoot.getElementById('editText'),
        saveBtn:this.shadowRoot.getElementById('saveBtn'),
        cancelBtn:this.shadowRoot.getElementById('cancelBtn'),
        messageBox:this.shadowRoot.getElementById('messageBox'),
        errorBox:this.shadowRoot.getElementById('errorBox'),
        kvId:this.shadowRoot.getElementById('kvId'),
        kvName:this.shadowRoot.getElementById('kvName'),
        kvActive:this.shadowRoot.getElementById('kvActive'),
        kvUpdated:this.shadowRoot.getElementById('kvUpdated'),
      };
      this._lastValue='';
      this._poll=null;
    }
    get bearerToken(){return this._get('bearerToken');}
    get organizationId(){return this._get('organizationId');}
    get dataCenter(){return this._get('dataCenter')||'us1';}
    get cadVarId(){return this._get('cadVarId')||'ed98c1dc-00c0-4db0-9926-c88422405e0a';}
    get canEdit(){return String(this._get('canEdit')).toLowerCase()==='true';}
    _get(k){return (this[k]!==undefined&&this[k]!==null)?this[k]:this.getAttribute(k);}
    connectedCallback(){
      const e=this._els;
      e.refreshBtn.onclick=()=>this._fetch();
      e.editToggle.onclick=()=>this._toggleEdit();
      e.cancelBtn.onclick=()=>e.editPanel.style.display='none';
      e.saveBtn.onclick=()=>this._save();
      if(this.canEdit)e.editToggle.style.display='inline-block';
      this._fetch();
      this._poll=setInterval(()=>this._fetch(),30000);
    }
    disconnectedCallback(){if(this._poll)clearInterval(this._poll);}
    async _fetch(){
      const e=this._els,base=dcToBaseUrl(this.dataCenter);
      if(!this.bearerToken||!this.organizationId||!this.cadVarId){
        e.errorBox.hidden=false;e.errorBox.textContent='Missing token/org/varId';return;
      }
      e.errorBox.hidden=true;e.status.textContent='Loading…';
      try{
        const r=await fetch(`${base}/organization/${this.organizationId}/cad-variable/${this.cadVarId}`,{
          headers:{Authorization:`Bearer ${this.bearerToken}`}
        });
        if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);
        const d=await r.json();
        this._lastValue=d.defaultValue||'—';
        e.messageBox.textContent=this._lastValue;
        e.kvId.textContent=d.id||this.cadVarId;
        e.kvName.textContent=d.name||'—';
        e.kvActive.textContent=String(d.active);
        e.kvUpdated.textContent=fmtTime(d.lastUpdatedTime);
        e.status.textContent='Up to date';
      }catch(err){
        e.errorBox.hidden=false;e.errorBox.textContent='Error: '+err.message;
        e.status.textContent='Error';
      }
    }
    _toggleEdit(){
      const e=this._els;
      e.editPanel.style.display=e.editPanel.style.display==='block'?'none':'block';
      e.editText.value=this._lastValue;
    }
    async _save(){
      const e=this._els,newVal=e.editText.value.trim();
      if(!newVal){e.errorBox.hidden=false;e.errorBox.textContent='Cannot be empty';return;}
      const base=dcToBaseUrl(this.dataCenter);
      e.errorBox.hidden=true;e.status.textContent='Saving…';
      try{
        const r=await fetch(`${base}/organization/${this.organizationId}/cad-variable/${this.cadVarId}`,{
          method:'PUT',
          headers:{Authorization:`Bearer ${this.bearerToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({defaultValue:newVal})
        });
        if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);
        e.status.textContent='Saved';
        e.editPanel.style.display='none';
        this._fetch();
      }catch(err){
        e.errorBox.hidden=false;e.errorBox.textContent='Save failed: '+err.message;
        e.status.textContent='Error';
      }
    }
  }

  // Register + expose
  if(!customElements.get('advisory-message')) customElements.define('advisory-message',AdvisoryMessageEl);
  window.AdvisoryMessageEl = AdvisoryMessageEl;
  window['advisory-message'] = ()=>document.createElement('advisory-message');

  // Auto-upgrade any existing <advisory-message> tags
  document.querySelectorAll('advisory-message').forEach(el=>{
    if(!(el instanceof AdvisoryMessageEl)){
      const newEl=document.createElement('advisory-message');
      for(const attr of el.getAttributeNames()) newEl.setAttribute(attr,el.getAttribute(attr));
      el.replaceWith(newEl);
    }
  });

  console.log("[AdvisoryMessage] registered & ready");
})();
