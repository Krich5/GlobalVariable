/* WxCC Desktop widget: AdvisoryMessage (GET + PUT) */
(function () {
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
      .banner { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; border-radius:8px; padding:8px 10px; margin-bottom:10px; display:none }
      textarea { width:100%; min-height:96px; padding:10px; border:1px solid #e5e7eb; border-radius:8px; resize:vertical; }
      .edit { margin-top:12px; display:none; }
      .btns { display:flex; gap:8px; margin-top:8px; }
    </style>
    <div class="banner" id="errBanner"></div>
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

  function dcToBaseUrl(dc) {
    const safe = (dc || 'us1').toLowerCase();
    return `https://api.wxcc-${safe}.cisco.com`;
  }
  function fmtTime(ms) {
    if (ms == null) return '—';
    try { return new Date(Number(ms)).toLocaleString(); } catch { return String(ms); }
  }

  class AdvisoryMessage extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).appendChild(TPL.content.cloneNode(true));
      this._els = {
        errBanner: this.shadowRoot.getElementById('errBanner'),
        status: this.shadowRoot.getElementById('status'),
        refreshBtn: this.shadowRoot.getElementById('refreshBtn'),
        editToggle: this.shadowRoot.getElementById('editToggle'),
        editPanel: this.shadowRoot.getElementById('editPanel'),
        editText: this.shadowRoot.getElementById('editText'),
        saveBtn: this.shadowRoot.getElementById('saveBtn'),
        cancelBtn: this.shadowRoot.getElementById('cancelBtn'),
        messageBox: this.shadowRoot.getElementById('messageBox'),
        errorBox: this.shadowRoot.getElementById('errorBox'),
        kvId: this.shadowRoot.getElementById('kvId'),
        kvName: this.shadowRoot.getElementById('kvName'),
        kvActive: this.shadowRoot.getElementById('kvActive'),
        kvUpdated: this.shadowRoot.getElementById('kvUpdated'),
      };
      this._poll = null;
      this._onRefresh = this._onRefresh.bind(this);
      this._onEditToggle = this._onEditToggle.bind(this);
      this._onCancel = this._onCancel.bind(this);
      this._onSave = this._onSave.bind(this);
      this._lastValue = '';
    }

    /* props from Desktop */
    get bearerToken()   { return this._getPropOrAttr('bearerToken'); }
    get organizationId(){ return this._getPropOrAttr('organizationId'); }
    get dataCenter()    { return this._getPropOrAttr('dataCenter') || 'us1'; }
    get cadVarId()      { return this._getPropOrAttr('cadVarId') || 'ed98c1dc-00c0-4db0-9926-c88422405e0a'; }
    get canEdit()       { const v = this._getPropOrAttr('canEdit'); return String(v).toLowerCase() === 'true'; }

    _getPropOrAttr(k) {
      return (this[k] !== undefined && this[k] !== null) ? this[k] : this.getAttribute(k);
    }

    connectedCallback() {
      this._els.refreshBtn.addEventListener('click', this._onRefresh);
      this._els.editToggle.addEventListener('click', this._onEditToggle);
      this._els.cancelBtn.addEventListener('click', this._onCancel);
      this._els.saveBtn.addEventListener('click', this._onSave);

      // show runtime errors inside the widget
      this._unsubscribeErr = (ev) => {
        this._els.errBanner.style.display = 'block';
        this._els.errBanner.textContent = `Script error: ${ev.message || ev.error || ev}`;
      };
      window.addEventListener('error', this._unsubscribeErr);

      if (this.canEdit) this._els.editToggle.style.display = 'inline-block';

      this._fetchOnce();
      this._poll = setInterval(() => this._fetchOnce(), 30000);
    }

    disconnectedCallback() {
      this._els.refreshBtn.removeEventListener('click', this._onRefresh);
      this._els.editToggle.removeEventListener('click', this._onEditToggle);
      this._els.cancelBtn.removeEventListener('click', this._onCancel);
      this._els.saveBtn.removeEventListener('click', this._onSave);
      if (this._poll) clearInterval(this._poll);
      if (this._unsubscribeErr) window.removeEventListener('error', this._unsubscribeErr);
    }

    async _onRefresh() { await this._fetchOnce(true); }
    _onEditToggle() {
      const { editPanel, editText } = this._els;
      editPanel.style.display = editPanel.style.display === 'block' ? 'none' : 'block';
      editText.value = this._lastValue || '';
      editText.focus();
    }
    _onCancel() {
      this._els.editPanel.style.display = 'none';
    }

    async _onSave() {
      const { editText, status, errorBox, saveBtn } = this._els;
      const newVal = (editText.value || '').trim();

      if (!newVal) {
        errorBox.hidden = false;
        errorBox.textContent = 'Message cannot be empty.';
        return;
      }

      errorBox.hidden = true;
      try {
        saveBtn.disabled = true;
        status.textContent = 'Saving…';
        await this._putValue(newVal);
        status.textContent = 'Saved';
        this._els.editPanel.style.display = 'none';
        await this._fetchOnce(true); // re-read to show updated timestamp/value
      } catch (e) {
        errorBox.hidden = false;
        errorBox.textContent = `Save failed: ${e.message}`;
        status.textContent = 'Error';
      } finally {
        saveBtn.disabled = false;
      }
    }

    async _fetchOnce(isManual = false) {
      const { status, messageBox, errorBox, kvId, kvName, kvActive, kvUpdated, refreshBtn } = this._els;
      errorBox.hidden = true; errorBox.textContent = '';
      const token = this.bearerToken;
      const orgId = this.organizationId;
      const varId = this.cadVarId;
      const base = dcToBaseUrl(this.dataCenter);

      if (!token || !orgId || !varId) {
        errorBox.hidden = false;
        errorBox.textContent = 'Missing bearerToken, organizationId, or cadVarId.';
        return;
      }

      const url = `${base}/organization/${encodeURIComponent(orgId)}/cad-variable/${encodeURIComponent(varId)}`;
      try {
        status.textContent = (isManual ? 'Refreshing…' : 'Syncing…');
        refreshBtn.disabled = true;

        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });

        if (!res.ok) {
          const text = await res.text().catch(()=>'');
          throw new Error(`${res.status} ${res.statusText}${text ? ' — ' + text : ''}`);
        }

        const data = await res.json();
        const val = data?.defaultValue ?? '—';
        this._lastValue = (typeof val === 'string') ? val : String(val);

        messageBox.textContent = this._lastValue || '—';
        kvId.textContent = data?.id ?? varId;
        kvName.textContent = data?.name ?? '—';
        kvActive.textContent = String(data?.active ?? '—');
        kvUpdated.textContent = fmtTime(data?.lastUpdatedTime);

        status.textContent = 'Up to date';
      } catch (err) {
        errorBox.hidden = false;
        errorBox.textContent = `Error loading advisory message: ${err.message}`;
        status.textContent = 'Error';
      } finally {
        refreshBtn.disabled = false;
      }
    }

    async _putValue(newValue) {
      const token = this.bearerToken;
      const orgId = this.organizationId;
      const varId = this.cadVarId;
      const base = dcToBaseUrl(this.dataCenter);
      const url = `${base}/organization/${encodeURIComponent(orgId)}/cad-variable/${encodeURIComponent(varId)}`;

      // Minimal body: update defaultValue. If your tenant requires full body, extend here.
      const body = JSON.stringify({ defaultValue: newValue });

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body
      });

      if (!res.ok) {
        const text = await res.text().catch(()=> '');
        throw new Error(`${res.status} ${res.statusText}${text ? ' — ' + text : ''}`);
      }
      return true;
    }
  }

  if (!customElements.get('advisory-message-el')) {
    customElements.define('advisory-message-el', AdvisoryMessage);
  }
  window.AdvisoryMessage = AdvisoryMessage;
})();
