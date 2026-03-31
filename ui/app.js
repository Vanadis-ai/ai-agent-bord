/* Vanadis Bord -- core logic (state, settings, sessions, tabs, input) */
const bord = {
  sessions: [],
  openTabs: [],
  activeTabIdx: -1,
  isStreaming: false,
  currentStreamText: "",
  model: "sonnet",
  fontSize: 14,
  permMode: "bypassPermissions",
  settings: {},
  async init() {
    await this.loadSettingsFromFile();
    this.applySettings();
    this.applyPanelSizes();
    this.initResize();
    await this.loadSessions();
    this.restoreOpenTabs();
    this.refreshTabTitle();
  },
  async loadSettingsFromFile() {
    this.settings = await pywebview.api.load_settings() || {};
  },
  applySettings() {
    if (this.settings.theme) {
      document.documentElement.setAttribute("data-theme", this.settings.theme);
      const sel = document.getElementById("theme-select");
      if (sel) sel.value = this.settings.theme;
    }
    if (this.settings.fontSize) {
      this.fontSize = this.settings.fontSize;
      document.documentElement.style.setProperty("--font-size", this.fontSize + "px");
    }
    if (this.settings.model) {
      this.model = this.settings.model;
      const sel = document.getElementById("model-select");
      if (sel) sel.value = this.model;
    }
    if (this.settings.permMode) {
      const sel = document.getElementById("perm-mode");
      if (sel) {
        const valid = Array.from(sel.options).some(o => o.value === this.settings.permMode);
        this.permMode = valid ? this.settings.permMode : "bypassPermissions";
        sel.value = this.permMode;
        sel.className = this.permMode === "bypassPermissions" ? "mode-bypass" : this.permMode === "plan" ? "mode-plan" : "";
      }
    }
  },
  persistSettings() {
    this.settings = {
      theme: document.documentElement.getAttribute("data-theme") || "dark",
      fontSize: this.fontSize,
      model: this.model,
      permMode: this.permMode,
      openTabs: this.openTabs.map(t => ({id: t.id, title: t.title, cwd: t.cwd, bypass: t.bypass})),
      activeTab: this.activeTabIdx,
    };
    pywebview.api.save_settings(this.settings);
  },
  async loadSessions() {
    const result = await pywebview.api.get_sessions();
    if (result.error) { console.error(result.error); return; }
    this.sessions = result;
    this.renderSessions();
  },
  renderSessions() {
    const el = document.getElementById("sessions-list");
    const activeId = this.openTabs[this.activeTabIdx]?.id;
    el.textContent = "";
    this.sessions.forEach(s => {
      const div = document.createElement("div");
      div.className = "session-item" + (s.id === activeId ? " active" : "");
      const title = (s.title || "Untitled").substring(0, 40);
      const content = document.createElement("div");
      content.className = "session-content";
      content.appendChild(document.createTextNode(title));
      if (s.cwd) {
        const span = document.createElement("span");
        span.className = "time";
        span.textContent = s.cwd;
        content.appendChild(span);
      }
      div.appendChild(content);
      const del = document.createElement("span");
      del.className = "session-delete";
      del.textContent = "\u2715";
      del.addEventListener("click", (e) => { e.stopPropagation(); this.deleteSession(s.id); });
      del.addEventListener("dblclick", (e) => e.stopPropagation());
      div.appendChild(del);
      div.addEventListener("click", () => this.openSession(s.id, title, s.cwd, s.model));
      content.addEventListener("dblclick", (e) => { e.stopPropagation(); this.startRename(s.id, s.title || "Untitled", content); });
      el.appendChild(div);
    });
  },

  startRename(sessionId, currentTitle, contentEl) {
    contentEl.textContent = "";
    const input = document.createElement("input");
    input.className = "session-rename-input";
    input.type = "text";
    input.value = currentTitle;
    contentEl.appendChild(input);
    input.focus();
    input.select();
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("mousedown", (e) => e.stopPropagation());

    let finished = false;
    const finish = async (save) => {
      if (finished) return;
      finished = true;
      if (save) {
        const newName = input.value.trim();
        if (newName && newName !== currentTitle) {
          const result = await pywebview.api.rename(sessionId, newName);
          if (result.ok) {
            const tab = this.openTabs.find(t => t.id === sessionId);
            if (tab) { tab.title = newName; this.renderTabs(); this.renderChatHeader(); this.saveOpenTabs(); }
          }
        }
      }
      await this.loadSessions();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  },
  async deleteSession(sessionId) {
    if (!confirm("Delete this session?")) return;
    const result = await pywebview.api.delete(sessionId);
    if (result.error) { console.error(result.error); return; }
    const tabIdx = this.openTabs.findIndex(t => t.id === sessionId);
    if (tabIdx !== -1) {
      this.openTabs.splice(tabIdx, 1);
      if (this.activeTabIdx >= this.openTabs.length) this.activeTabIdx = this.openTabs.length - 1;
      if (this.activeTabIdx < 0) this.activeTabIdx = -1;
      this.renderTabs(); this.renderChat(); this.renderToolPanel(); this.saveOpenTabs();
    }
    await this.loadSessions();
  },

  openSession(id, title, cwd, model) {
    let idx = this.openTabs.findIndex(t => t.id === id);
    if (idx === -1) {
      this.openTabs.push({id, title, messages: null, toolEntries: [], bypass: false, cwd: cwd || null, model: model || this.model});
      idx = this.openTabs.length - 1;
    }
    if (model) {
      this.model = model;
      const sel = document.getElementById("model-select");
      if (sel) sel.value = model;
    }
    this.switchTab(idx);
    if (this.openTabs[idx].messages === null) this.loadMessages(id, idx);
  },

  switchTab(idx) {
    const input = document.getElementById("msg-input");
    if (this.activeTabIdx >= 0 && this.openTabs[this.activeTabIdx] && input) {
      this.openTabs[this.activeTabIdx].draft = input.value;
    }
    this.activeTabIdx = idx;
    const newTab = this.openTabs[idx];
    this.isStreaming = newTab ? !!newTab._streaming : false;
    this.currentStreamText = newTab ? (newTab._streamText || "") : "";
    document.getElementById("send-btn").disabled = this.isStreaming;
    this.renderTabs(); this.renderChatHeader(); this.renderChat();
    this.renderToolPanel(); this.renderSessions(); this.renderTokens();
    this.saveOpenTabs();
    if (input && this.openTabs[idx]) {
      input.value = this.openTabs[idx].draft || "";
      this.autoResize(input);
    }
  },

  refreshTabTitle() {
    this.openTabs.forEach(tab => {
      const s = this.sessions.find(s => s.id === tab.id);
      if (s && s.title) { tab.title = s.title; tab.cwd = s.cwd || tab.cwd; }
    });
    this.renderTabs(); this.renderChatHeader();
  },
  renderChatHeader() {
    const titleEl = document.getElementById("chat-title");
    const pathEl = document.getElementById("chat-path");
    if (this.activeTabIdx < 0 || !this.openTabs[this.activeTabIdx]) {
      titleEl.textContent = ""; pathEl.textContent = ""; return;
    }
    const tab = this.openTabs[this.activeTabIdx];
    titleEl.textContent = tab.title || "";
    pathEl.textContent = tab.cwd || "";
  },

  closeTab(idx, e) {
    if (e) e.stopPropagation();
    this.openTabs.splice(idx, 1);
    if (this.activeTabIdx >= this.openTabs.length) this.activeTabIdx = this.openTabs.length - 1;
    if (this.activeTabIdx < 0) this.activeTabIdx = -1;
    this.renderTabs(); this.renderChat(); this.renderToolPanel();
  },

  renderTabs() {
    const el = document.getElementById("tab-list");
    el.textContent = "";
    this.openTabs.forEach((t, i) => {
      const div = document.createElement("div");
      div.className = "tab" + (i === this.activeTabIdx ? " active" : "");
      div.addEventListener("click", () => this.switchTab(i));
      const badge = document.createElement("span"); badge.className = "badge";
      div.appendChild(badge);
      div.appendChild(document.createTextNode(t.title.substring(0, 25)));
      const close = document.createElement("span"); close.className = "close"; close.textContent = "\u2715";
      close.addEventListener("click", (ev) => this.closeTab(i, ev));
      div.appendChild(close);
      el.appendChild(div);
    });
  },

  setModel(m) { this.model = m; this.persistSettings(); },
  setPermMode(m) {
    this.permMode = m;
    const sel = document.getElementById("perm-mode");
    if (sel) { sel.className = m === "bypassPermissions" ? "mode-bypass" : m === "plan" ? "mode-plan" : ""; }
    this.persistSettings();
  },
  setTheme(theme) { document.documentElement.setAttribute("data-theme", theme); this.persistSettings(); },

  changeFontSize(delta) {
    this.fontSize = Math.max(10, Math.min(22, this.fontSize + delta));
    document.documentElement.style.setProperty("--font-size", this.fontSize + "px");
    this.persistSettings();
  },

  saveOpenTabs() { this.persistSettings(); },
  restoreOpenTabs() {
    try {
      const tabs = this.settings.openTabs;
      if (!Array.isArray(tabs) || tabs.length === 0) return;
      tabs.forEach(t => {
        if (t.id && !t.id.startsWith("new-")) {
          this.openTabs.push({id: t.id, title: t.title || "Untitled", messages: null, toolEntries: [], bypass: t.bypass || false, cwd: t.cwd || null});
        }
      });
      const idx = typeof this.settings.activeTab === "number" ? this.settings.activeTab : 0;
      if (idx >= 0 && idx < this.openTabs.length) {
        this.switchTab(idx);
        this.openTabs.forEach((tab, i) => { if (tab.messages === null) this.loadMessages(tab.id, i); });
      }
    } catch (e) { console.error("Failed to restore tabs", e); }
  },

  toggleSidebar() {
    const sb = document.getElementById("sidebar");
    sb.classList.toggle("collapsed");
    document.getElementById("show-sidebar-btn").style.display = sb.classList.contains("collapsed") ? "" : "none";
  },
  handleKey(e) { this._handleKey(e); },
  autoResize(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; },

  togglePanel() { document.getElementById("tool-panel").classList.toggle("collapsed"); },
  async sendMessage() {
    const input = document.getElementById("msg-input");
    const text = input.value.trim();
    if (!text || this.isStreaming || this.activeTabIdx < 0) return;
    const tab = this.openTabs[this.activeTabIdx];

    if (text.startsWith("/rename ")) {
      const newName = text.slice(8).trim();
      if (newName && !tab.id.startsWith("new-")) {
        input.value = "";
        const result = await pywebview.api.rename(tab.id, newName);
        if (result.ok) { tab.title = newName; this.renderTabs(); this.renderChatHeader(); this.saveOpenTabs(); await this.loadSessions(); }
      }
      return;
    }

    if (!tab.messages) tab.messages = [];
    tab.messages.push({role: "user", blocks: [{type: "text", text}]});
    if (!tab._history) tab._history = [];
    tab._history.push(text); tab._histIdx = tab._history.length;
    input.value = ""; this.autoResize(input);
    tab._streaming = true; tab._streamText = "";
    this.isStreaming = true; this.currentStreamText = "";
    document.getElementById("send-btn").disabled = true;
    this.renderChat();
    await pywebview.api.send_message(text, tab.id.startsWith("new-") ? null : tab.id, tab.cwd, this.permMode, this.model);
  },

  async newSession() {
    const cwd = await pywebview.api.pick_directory();
    if (!cwd) return;
    const dirName = cwd.split("/").pop() || cwd;
    this.openTabs.push({id: "new-" + Date.now(), title: dirName, messages: [], toolEntries: [], bypass: false, cwd: cwd});
    this.switchTab(this.openTabs.length - 1);
    document.getElementById("msg-input").focus();
  },

};
