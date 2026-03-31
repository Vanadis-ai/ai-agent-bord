/* Vanadis Bord -- rendering, markdown, tool panel, event handlers */
/* global bord, pywebview */

bord.loadMessages = async function(sessionId, tabIdx) {
  let result;
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000));
    result = await Promise.race([pywebview.api.get_messages(sessionId), timeout]);
  } catch (e) {
    console.error("loadMessages failed:", e);
    const tab = this.openTabs[tabIdx];
    if (tab) { tab.messages = []; if (tabIdx === this.activeTabIdx) this.renderChat(); }
    return;
  }
  const tab = this.openTabs[tabIdx];
  if (!tab) return;
  if (result.error) { console.error(result.error); tab.messages = []; if (tabIdx === this.activeTabIdx) this.renderChat(); return; }
  tab.messages = result.messages || result;
  tab.tokens = result.tokens || 0;
  tab.toolEntries = [];
  tab.messages.forEach(m => {
    m.blocks.forEach(b => {
      if (b.type === "tool_use") tab.toolEntries.push({type: "use", name: b.name, input: b.input, id: b.id});
      else if (b.type === "tool_result") tab.toolEntries.push({type: "result", content: b.content, is_error: b.is_error, tool_use_id: b.tool_use_id});
    });
  });
  if (tabIdx === this.activeTabIdx) { this.renderChat(); this.renderToolPanel(); this.renderTokens(); }
};

bord.renderTokens = function() {
  const el = document.getElementById("token-count");
  if (!el) return;
  if (this.activeTabIdx < 0 || !this.openTabs[this.activeTabIdx]) { el.textContent = ""; return; }
  const tokens = this.openTabs[this.activeTabIdx].tokens || 0;
  el.textContent = tokens > 0 ? tokens.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " tokens" : "";
};

bord.showPermissionDialog = function(permId, toolName, toolInput) {
  const msgs = document.getElementById("messages");
  if (!msgs) return;
  const card = document.createElement("div");
  card.className = "perm-card";
  const title = document.createElement("div");
  title.className = "perm-card-title";
  title.textContent = "Permission: " + toolName;
  card.appendChild(title);
  const input = document.createElement("div");
  input.className = "perm-card-input";
  input.textContent = typeof toolInput === "object" ? JSON.stringify(toolInput, null, 2) : String(toolInput || "");
  card.appendChild(input);
  const btns = document.createElement("div");
  btns.className = "perm-card-buttons";
  const labels = {allow: "Allow", allow_tool: "Allow all " + toolName, bypass: "Bypass", deny: "Deny"};
  for (const [action, label] of Object.entries(labels)) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      btns.remove();
      const result = document.createElement("div");
      result.className = "perm-card-result";
      result.textContent = label;
      card.appendChild(result);
      if (action === "bypass") {
        document.getElementById("perm-mode").value = "bypassPermissions";
        bord.permMode = "bypassPermissions"; bord.persistSettings();
      }
      pywebview.api.respond_permission(permId, action);
    });
    btns.appendChild(btn);
  }
  card.appendChild(btns);
  msgs.appendChild(card);
  msgs.scrollTop = msgs.scrollHeight;
};

bord.renderChat = function() {
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
};

bord._toolLabel = function(name, input) {
  if (!input || typeof input !== "object") return name;
  if (["Read","Edit","Write"].includes(name) && input.file_path) return name + " " + input.file_path.split("/").pop();
  if (name === "Bash" && input.command) return "$ " + input.command.substring(0, 50);
  if (name === "Grep" && input.pattern) return "Grep " + input.pattern.substring(0, 30);
  if (name === "Glob" && input.pattern) return "Glob " + input.pattern.substring(0, 30);
  return name;
};

bord._renderMarkdown = function(text) {
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
};

bord._parseInline = function(text) {
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
};

bord.renderToolPanel = function() {
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
};

bord.scrollToTool = function(id) {
  const panel = document.getElementById("tool-panel");
  if (panel.classList.contains("collapsed")) panel.classList.remove("collapsed");
  const el = document.getElementById("tool-" + id);
  if (!el) return;
  el.scrollIntoView({behavior: "smooth"});
  const h = el.querySelector(".tool-entry-header"), b = el.querySelector(".tool-entry-body");
  if (h && b) { h.classList.add("expanded"); b.classList.add("visible"); }
};

bord._findStreamingTab = function(evt) {
  const sid = evt.data.session_id;
  if (sid) {
    const idx = this.openTabs.findIndex(t => t.id === sid);
    if (idx >= 0) return this.openTabs[idx];
    const newIdx = this.openTabs.findIndex(t => t.id.startsWith("new-") && t._streaming);
    if (newIdx >= 0) { this.openTabs[newIdx].id = sid; return this.openTabs[newIdx]; }
  }
  if (this.activeTabIdx >= 0) return this.openTabs[this.activeTabIdx];
  return null;
};

bord._isActiveTab = function(tab) {
  return this.activeTabIdx >= 0 && this.openTabs[this.activeTabIdx] === tab;
};

window.onBordEvent = function(evt) {
  const tab = bord._findStreamingTab(evt);
  if (!tab) return;
  const isActive = bord._isActiveTab(tab);
  switch (evt.type) {
    case "assistant_text":
      if (!tab._streamText) tab._streamText = "";
      tab._streamText += evt.data.text;
      if (isActive) { bord.currentStreamText = tab._streamText; bord.renderChat(); }
      break;
    case "tool_use":
      tab.toolEntries.push({type: "use", name: evt.data.name, input: evt.data.input, id: evt.data.id});
      if (isActive) { bord.renderChat(); bord.renderToolPanel(); }
      break;
    case "tool_result":
      tab.toolEntries.push({type: "result", content: evt.data.content, is_error: evt.data.is_error, tool_use_id: evt.data.tool_use_id});
      if (isActive) bord.renderToolPanel();
      break;
    case "result":
      tab._streaming = false;
      if (tab._streamText) {
        tab.messages.push({role: "assistant", blocks: [{type: "text", text: tab._streamText}]});
        tab._streamText = "";
      }
      if (evt.data.tokens) tab.tokens = evt.data.tokens;
      if (isActive) {
        bord.isStreaming = false; bord.currentStreamText = "";
        document.getElementById("send-btn").disabled = false;
        bord.renderChat(); bord.renderTokens();
      }
      bord.loadSessions().then(() => bord.refreshTabTitle());
      break;
    case "permission_request":
      bord.showPermissionDialog(evt.data.id, evt.data.tool_name, evt.data.tool_input);
      break;
    case "error":
      tab._streaming = false; tab._streamText = "";
      if (!tab.messages) tab.messages = [];
      tab.messages.push({role: "assistant", blocks: [{type: "text", text: "Error: " + evt.data.message}]});
      if (isActive) {
        bord.isStreaming = false; bord.currentStreamText = "";
        document.getElementById("send-btn").disabled = false;
        bord.renderChat();
      }
      break;
  }
};

bord._handleKey = function(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMessage(); return; }
  const input = e.target, tab = this.openTabs[this.activeTabIdx];
  if (!tab || !tab.messages) return;
  if (e.key === "ArrowUp" && input.selectionStart === 0) {
    e.preventDefault();
    if (!tab._history) tab._history = tab.messages.filter(m => m.role === "user" && m.blocks.some(b => b.type === "text" && b.text)).map(m => m.blocks.find(b => b.type === "text").text);
    if (tab._histIdx === undefined) tab._histIdx = tab._history.length;
    if (tab._histIdx > 0) { tab._histIdx--; input.value = tab._history[tab._histIdx]; }
  } else if (e.key === "ArrowDown" && input.selectionStart === input.value.length) {
    e.preventDefault();
    if (tab._history && tab._histIdx !== undefined && tab._histIdx < tab._history.length - 1) {
      tab._histIdx++; input.value = tab._history[tab._histIdx];
    } else { tab._histIdx = tab._history ? tab._history.length : 0; input.value = ""; }
  }
};

window.addEventListener("pywebviewready", () => bord.init());
