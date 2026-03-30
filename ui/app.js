/* Vanadis Bord -- frontend logic */
/* global pywebview */

const bord = {
  sessions: [],
  openTabs: [],
  activeTabIdx: -1,
  isStreaming: false,
  currentStreamText: "",
  model: "sonnet",
  fontSize: 14,

  async init() {
    this.loadPreferences();
    await this.loadSessions();
    this.restoreOpenTabs();
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
      div.appendChild(document.createTextNode(title));
      if (s.cwd) {
        const span = document.createElement("span");
        span.className = "time";
        span.textContent = s.cwd;
        div.appendChild(span);
      }
      div.addEventListener("click", () => this.openSession(s.id, title, s.cwd));
      el.appendChild(div);
    });
  },

  openSession(id, title, cwd) {
    let idx = this.openTabs.findIndex(t => t.id === id);
    if (idx === -1) {
      this.openTabs.push({id, title, messages: null, toolEntries: [], bypass: false, cwd: cwd || null});
      idx = this.openTabs.length - 1;
    }
    this.switchTab(idx);
    if (this.openTabs[idx].messages === null) this.loadMessages(id, idx);
  },

  switchTab(idx) {
    // Save current tab's input
    const input = document.getElementById("msg-input");
    if (this.activeTabIdx >= 0 && this.openTabs[this.activeTabIdx] && input) {
      this.openTabs[this.activeTabIdx].draft = input.value;
    }
    this.activeTabIdx = idx;
    this.renderTabs();
    this.renderChatHeader();
    this.renderChat();
    this.renderToolPanel();
    this.renderSessions();
    this.updateBypassUI();
    this.saveOpenTabs();
    // Restore new tab's input
    if (input && this.openTabs[idx]) {
      input.value = this.openTabs[idx].draft || "";
      this.autoResize(input);
    }
  },

  refreshTabTitle() {
    this.openTabs.forEach(tab => {
      const s = this.sessions.find(s => s.id === tab.id);
      if (s && s.title) {
        tab.title = s.title;
        tab.cwd = s.cwd || tab.cwd;
      }
    });
    this.renderTabs();
    this.renderChatHeader();
  },

  renderChatHeader() {
    const titleEl = document.getElementById("chat-title");
    const pathEl = document.getElementById("chat-path");
    if (this.activeTabIdx < 0 || !this.openTabs[this.activeTabIdx]) {
      titleEl.textContent = "";
      pathEl.textContent = "";
      return;
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
    this.renderTabs();
    this.renderChat();
    this.renderToolPanel();
  },

  renderTabs() {
    const el = document.getElementById("tab-list");
    el.textContent = "";
    this.openTabs.forEach((t, i) => {
      const div = document.createElement("div");
      div.className = "tab" + (i === this.activeTabIdx ? " active" : "");
      div.addEventListener("click", () => this.switchTab(i));
      const badge = document.createElement("span");
      badge.className = "badge";
      div.appendChild(badge);
      div.appendChild(document.createTextNode(t.title.substring(0, 25)));
      const close = document.createElement("span");
      close.className = "close";
      close.textContent = "\u2715";
      close.addEventListener("click", (ev) => this.closeTab(i, ev));
      div.appendChild(close);
      el.appendChild(div);
    });
  },

  async loadMessages(sessionId, tabIdx) {
    const result = await pywebview.api.get_messages(sessionId);
    if (result.error) { console.error(result.error); return; }
    const tab = this.openTabs[tabIdx];
    tab.messages = result;
    tab.toolEntries = [];
    result.forEach(m => {
      m.blocks.forEach(b => {
        if (b.type === "tool_use") tab.toolEntries.push({type: "use", name: b.name, input: b.input, id: b.id});
        else if (b.type === "tool_result") tab.toolEntries.push({type: "result", content: b.content, is_error: b.is_error, tool_use_id: b.tool_use_id});
      });
    });
    if (tabIdx === this.activeTabIdx) { this.renderChat(); this.renderToolPanel(); }
  },

  renderChat() {
    const el = document.getElementById("messages");
    el.textContent = "";
    if (this.activeTabIdx < 0 || !this.openTabs[this.activeTabIdx]) {
      const w = document.createElement("div"); w.className = "welcome-screen";
      const h = document.createElement("h2"); h.textContent = "Vanadis Bord";
      const p = document.createElement("p"); p.textContent = "Select a session or create a new one";
      w.appendChild(h); w.appendChild(p); el.appendChild(w); return;
    }
    const tab = this.openTabs[this.activeTabIdx];
    if (!tab.messages) {
      const w = document.createElement("div"); w.className = "welcome-screen";
      const p = document.createElement("p"); p.textContent = "Loading...";
      w.appendChild(p); el.appendChild(w); return;
    }
    tab.messages.forEach(m => {
      const div = document.createElement("div");
      div.className = "msg " + m.role;
      m.blocks.forEach(b => {
        if (b.type === "text") div.appendChild(this._renderMarkdown(b.text));
        else if (b.type === "tool_use") {
          const ind = document.createElement("div"); ind.className = "tool-indicator";
          const icon = document.createElement("span"); icon.className = "icon"; icon.textContent = "\u2699";
          ind.appendChild(icon);
          ind.appendChild(document.createTextNode(" " + this._toolLabel(b.name, b.input)));
          ind.addEventListener("click", () => this.scrollToTool(b.id));
          div.appendChild(ind);
        }
      });
      if (div.childNodes.length > 0) el.appendChild(div);
    });
    if (this.isStreaming && this.currentStreamText) {
      const div = document.createElement("div"); div.className = "msg assistant";
      div.appendChild(this._renderMarkdown(this.currentStreamText));
      el.appendChild(div);
    }
    el.scrollTop = el.scrollHeight;
  },

  _toolLabel(name, input) {
    if (!input || typeof input !== "object") return name;
    if (["Read","Edit","Write"].includes(name) && input.file_path) return name + " " + input.file_path.split("/").pop();
    if (name === "Bash" && input.command) return "$ " + input.command.substring(0, 50);
    if (name === "Grep" && input.pattern) return "Grep " + input.pattern.substring(0, 30);
    if (name === "Glob" && input.pattern) return "Glob " + input.pattern.substring(0, 30);
    return name;
  },

  _renderMarkdown(text) {
    const container = document.createElement("div");
    text.split(/(```[\s\S]*?```)/g).forEach(part => {
      if (part.startsWith("```")) {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = part.replace(/^```\w*\n?/, "").replace(/```$/, "");
        pre.appendChild(code); container.appendChild(pre);
      } else {
        part.split("\n\n").forEach(block => {
          if (!block.trim()) return;
          const p = document.createElement("p");
          p.appendChild(this._parseInline(block));
          container.appendChild(p);
        });
      }
    });
    return container;
  },

  _parseInline(text) {
    const frag = document.createDocumentFragment();
    const re = /(`[^`]+`|\*\*[^*]+\*\*|\n)/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const tok = m[0];
      if (tok === "\n") frag.appendChild(document.createElement("br"));
      else if (tok.startsWith("`")) { const c = document.createElement("code"); c.textContent = tok.slice(1,-1); frag.appendChild(c); }
      else if (tok.startsWith("**")) { const s = document.createElement("strong"); s.textContent = tok.slice(2,-2); frag.appendChild(s); }
      last = m.index + tok.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  },

  renderToolPanel() {
    const el = document.getElementById("tool-entries");
    el.textContent = "";
    if (this.activeTabIdx < 0 || !this.openTabs[this.activeTabIdx]) return;
    this.openTabs[this.activeTabIdx].toolEntries.forEach(e => {
      const entry = document.createElement("div"); entry.className = "tool-entry";
      if (e.id) entry.id = "tool-" + e.id;
      const header = document.createElement("div"); header.className = "tool-entry-header";
      const body = document.createElement("div"); body.className = "tool-entry-body";
      header.addEventListener("click", () => { header.classList.toggle("expanded"); body.classList.toggle("visible"); });
      const arrow = document.createElement("span"); arrow.className = "arrow"; arrow.textContent = "\u25B6";
      header.appendChild(arrow);
      if (e.type === "use") {
        const ns = document.createElement("span"); ns.className = "name"; ns.textContent = " " + e.name + " ";
        header.appendChild(ns);
        header.appendChild(document.createTextNode(this._toolLabel(e.name, e.input)));
        const pre = document.createElement("pre");
        pre.textContent = typeof e.input === "object" ? JSON.stringify(e.input, null, 2) : String(e.input || "");
        body.appendChild(pre);
      } else {
        header.appendChild(document.createTextNode(e.is_error ? " Error" : " Result"));
        const pre = document.createElement("pre");
        if (e.is_error) pre.className = "error";
        pre.textContent = e.content || "";
        body.appendChild(pre);
      }
      entry.appendChild(header); entry.appendChild(body); el.appendChild(entry);
    });
    el.scrollTop = el.scrollHeight;
  },

  scrollToTool(id) {
    const panel = document.getElementById("tool-panel");
    if (panel.classList.contains("collapsed")) panel.classList.remove("collapsed");
    const el = document.getElementById("tool-" + id);
    if (!el) return;
    el.scrollIntoView({behavior: "smooth"});
    const h = el.querySelector(".tool-entry-header"), b = el.querySelector(".tool-entry-body");
    if (h && b) { h.classList.add("expanded"); b.classList.add("visible"); }
  },

  togglePanel() { document.getElementById("tool-panel").classList.toggle("collapsed"); },

  setModel(m) { this.model = m; localStorage.setItem("bord-model", m); },

  setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("bord-theme", theme);
  },

  changeFontSize(delta) {
    this.fontSize = Math.max(10, Math.min(22, this.fontSize + delta));
    document.documentElement.style.setProperty("--font-size", this.fontSize + "px");
    localStorage.setItem("bord-font-size", this.fontSize);
  },

  loadPreferences() {
    const theme = localStorage.getItem("bord-theme");
    if (theme) {
      document.documentElement.setAttribute("data-theme", theme);
      const sel = document.getElementById("theme-select");
      if (sel) sel.value = theme;
    }
    const fs = localStorage.getItem("bord-font-size");
    if (fs) {
      this.fontSize = parseInt(fs, 10);
      document.documentElement.style.setProperty("--font-size", this.fontSize + "px");
    }
    const model = localStorage.getItem("bord-model");
    if (model) {
      this.model = model;
      const sel = document.getElementById("model-select");
      if (sel) sel.value = model;
    }
  },

  saveOpenTabs() {
    const tabs = this.openTabs.map(t => ({id: t.id, title: t.title, cwd: t.cwd, bypass: t.bypass}));
    localStorage.setItem("bord-open-tabs", JSON.stringify(tabs));
    localStorage.setItem("bord-active-tab", String(this.activeTabIdx));
  },

  restoreOpenTabs() {
    try {
      const raw = localStorage.getItem("bord-open-tabs");
      if (!raw) return;
      const tabs = JSON.parse(raw);
      if (!Array.isArray(tabs) || tabs.length === 0) return;
      tabs.forEach(t => {
        if (t.id && !t.id.startsWith("new-")) {
          this.openTabs.push({id: t.id, title: t.title || "Untitled", messages: null, toolEntries: [], bypass: t.bypass || false, cwd: t.cwd || null});
        }
      });
      const idx = parseInt(localStorage.getItem("bord-active-tab") || "0", 10);
      if (idx >= 0 && idx < this.openTabs.length) {
        this.switchTab(idx);
        this.openTabs.forEach((tab, i) => {
          if (tab.messages === null) this.loadMessages(tab.id, i);
        });
      }
    } catch (e) { console.error("Failed to restore tabs", e); }
  },

  toggleSidebar() {
    const sb = document.getElementById("sidebar");
    sb.classList.toggle("collapsed");
    const btn = document.getElementById("show-sidebar-btn");
    btn.style.display = sb.classList.contains("collapsed") ? "" : "none";
  },

  handleKey(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMessage(); } },

  autoResize(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; },

  toggleBypass() {
    if (this.activeTabIdx < 0) return;
    this.openTabs[this.activeTabIdx].bypass = !this.openTabs[this.activeTabIdx].bypass;
    this.updateBypassUI();
  },

  updateBypassUI() {
    const el = document.getElementById("bp-btn");
    const tab = this.openTabs[this.activeTabIdx];
    if (el && tab) el.classList.toggle("active", tab.bypass);
  },

  async sendMessage() {
    const input = document.getElementById("msg-input");
    const text = input.value.trim();
    if (!text || this.isStreaming || this.activeTabIdx < 0) return;
    const tab = this.openTabs[this.activeTabIdx];

    // Handle local slash commands
    if (text.startsWith("/rename ")) {
      const newName = text.slice(8).trim();
      if (newName && !tab.id.startsWith("new-")) {
        input.value = "";
        const result = await pywebview.api.rename(tab.id, newName);
        if (result.ok) {
          tab.title = newName;
          this.renderTabs();
          this.renderChatHeader();
          this.saveOpenTabs();
          await this.loadSessions();
        }
      }
      return;
    }

    if (!tab.messages) tab.messages = [];
    tab.messages.push({role: "user", blocks: [{type: "text", text}]});
    input.value = ""; this.autoResize(input);
    this.isStreaming = true; this.currentStreamText = "";
    document.getElementById("send-btn").disabled = true;
    this.renderChat();
    await pywebview.api.send_message(text, tab.id.startsWith("new-") ? null : tab.id, tab.cwd, tab.bypass, this.model);
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

// Permission dialog
bord._permissionResolve = null;

window.onBordPermission = function(data) {
  const overlay = document.getElementById("permission-overlay");
  document.getElementById("permission-tool").textContent = data.tool_name;
  const inputStr = typeof data.tool_input === "object" ? JSON.stringify(data.tool_input, null, 2) : String(data.tool_input || "");
  document.getElementById("permission-input").textContent = inputStr;
  overlay.style.display = "flex";
};

bord.respondPermission = function(action) {
  document.getElementById("permission-overlay").style.display = "none";
  if (action === "allow_all") {
    const tab = this.openTabs[this.activeTabIdx];
    if (tab) { tab.bypass = true; this.updateBypassUI(); }
  }
  pywebview.api.respond_permission(action === "deny" ? "deny" : "allow", action === "allow_all");
};

window.onBordEvent = function(evt) {
  if (bord.activeTabIdx < 0) return;
  const tab = bord.openTabs[bord.activeTabIdx];
  switch (evt.type) {
    case "assistant_text":
      bord.currentStreamText += evt.data.text;
      if (evt.data.session_id && tab.id.startsWith("new-")) tab.id = evt.data.session_id;
      bord.renderChat(); break;
    case "tool_use":
      tab.toolEntries.push({type: "use", name: evt.data.name, input: evt.data.input, id: evt.data.id});
      bord.renderChat(); bord.renderToolPanel(); break;
    case "tool_result":
      tab.toolEntries.push({type: "result", content: evt.data.content, is_error: evt.data.is_error, tool_use_id: evt.data.tool_use_id});
      bord.renderToolPanel(); break;
    case "result":
      bord.isStreaming = false;
      if (bord.currentStreamText) { tab.messages.push({role: "assistant", blocks: [{type: "text", text: bord.currentStreamText}]}); bord.currentStreamText = ""; }
      if (evt.data.session_id && tab.id.startsWith("new-")) tab.id = evt.data.session_id;
      document.getElementById("send-btn").disabled = false;
      bord.renderChat();
      bord.loadSessions().then(() => bord.refreshTabTitle());
      break;
    case "error":
      bord.isStreaming = false; bord.currentStreamText = "";
      document.getElementById("send-btn").disabled = false;
      tab.messages.push({role: "assistant", blocks: [{type: "text", text: "Error: " + evt.data.message}]});
      bord.renderChat(); break;
  }
};

window.addEventListener("pywebviewready", () => bord.init());
