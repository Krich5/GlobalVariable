<script>
/**
 * WxCC Desktop widget: AdvisoryMessage
 * - Reads a CAD/Global Variable by ID and displays its defaultValue.
 * - Expects runtime properties (from Desktop layout):
 *    - bearerToken: $STORE.auth.accessToken
 *    - organizationId: $STORE.agent.orgId
 *    - dataCenter: $STORE.app.datacenter (e.g., "us1")
 *    - cadVarId: the CAD/Global Variable ID to read
 *
 * Notes:
 * - This calls the WxCC public API directly using the provided bearer token.
 * - If your tenant’s CORS blocks direct calls from the Desktop origin,
 *   place a tiny proxy in front, or keep using the server you already have.
 */
(function () {
  const TPL = document.createElement('template');
  TPL.innerHTML = `
    <style>
      :host { display:block; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#0f172a; }
      .card { border:1px solid #e5e7eb; border-radius:12px; padding:16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); background:#fff; }
      .row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .muted { color:#64748b; font-size:12px; }
      .msg { font-size:16px; line-height:1.5; padding:12px; background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1; word-break:break-word; }
      button { border:1px solid #e5e7eb; background:#0ea5e9; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:600; }
      button[disabled] { opacity:.6; cursor:not-allowed; }
      .error { color:#dc2626; font-size:12px; margin-top:8px; }
      .kvs { display:grid; grid-template-columns: 120px 1fr; gap:6px 12px; margin-top:8px; }
      .kv-key { color:#64748b; font-size:12px; }
      .kv-val { font-size:12px; color:#0f172a; }
    </style>
    <div class="card">
      <div class="row">
        <div>
          <div style="font-weight:700;">Desktop Advisory Message</div>
          <div class="muted" id="status">Idle</div>
        </div>
        <div>
          <button id="refreshBtn">Refresh</button>
        </div>
      </div>

      <div style="margin-top:12px">
        <div class="muted">Current message (defaultValue)</div>
        <div class="msg" id="messageBox">—</div>
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
    if (!ms && ms !== 0) return '—';
    try { return new Date(Number(ms)).toLocaleString(); } catch { return String(ms); }
  }

  class AdvisoryMessage extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).appendChild(TPL.content.cloneNode(true));
      this._els = {
        status: this.shadowRoot.getElementById('status'),
        refreshBtn: this.shadowRoot.getElementById('refreshBtn'),
        messageBox: this.shadowRoot.getElementById('messageBox'),
        errorBox: this.shadowRoot.getElementById('errorBox'),
        kvId: this.shadowRoot.getElementById('kvId'),
        kvName: this.shadowRoot.getElementById('kvName'),
        kvActive: this.shadowRoot.getElementById('kvActive'),
        kvUpdated: this.shadowRoot.getElementById('kvUpdated'),
      };
      this._poll = null;
      this._onRefresh = this._onRefresh.bind(this);
    }

    /** Desktop loader may set values as *properties*. Fallback to attributes. */
    get bearerToken() { return this._getPropOrAttr('bearerToken'); }
    get organizationId() { return this._getPropOrAttr('organizationId'); }
    get dataCenter() { return this._getPropOrAttr('dataCenter') || 'us1'; }
    get cadVarId() { return this._getPropOrAttr('cadVarId') || 'ed98c1dc-00c0-4db0-9926-c88422405e0a'; }

    _getPropOrAttr(k) {
      return (this[k] !== undefined && this[k] !== null) ? this[k] : this.getAttribute(k);
    }

    connectedCallback() {
      this._els.refreshBtn.addEventListener('click', this._onRefresh);
      // initial fetch
      this._fetchOnce();
      // auto-refresh every 30s (adjust as needed)
      this._poll = setInterval(() => this._fetchOnce(), 30000);
    }

    disconnectedCallback() {
      this._els.refreshBtn.removeEventListener('click', this._onRefresh);
      if (this._poll) clearInterval(this._poll);
    }

    async _onRefresh() {
      await this._fetchOnce(true);
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
          mode: 'cors',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`${res.status} ${res.statusText} — ${text || 'Request failed'}`);
        }

        const data = await res.json();
        // Update UI
        messageBox.textContent = data?.defaultValue ?? '—';
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
  }

  // Register the custom element so Desktop can instantiate it via "comp": "AdvisoryMessage"
  if (!customElements.get('advisory-message-el')) {
    customElements.define('advisory-message-el', AdvisoryMessage);
  }

  // For frameworks that expect a constructor in window scope named exactly like "comp"
  // we expose the class. The loader will do `new window[comp]()` and attach props.
  window.AdvisoryMessage = AdvisoryMessage;
})();
</script>
