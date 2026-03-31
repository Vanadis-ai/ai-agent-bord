/* Vanadis Bord -- resizable panel handles */

bord.initResize = function() {
  const dragH = (handle, target, min, max, invert) => {
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX, startW = target.getBoundingClientRect().width;
      handle.classList.add("active");
      document.body.classList.add("resizing");
      const onMove = (e) => {
        const d = invert ? startX - e.clientX : e.clientX - startX;
        const w = Math.max(min, Math.min(max, startW + d));
        target.style.width = w + "px"; target.style.minWidth = w + "px";
      };
      const onUp = () => {
        handle.classList.remove("active"); document.body.classList.remove("resizing");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        bord.savePanelSizes();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  };
  const dragV = (handle, target, min, max) => {
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startY = e.clientY, startH = target.getBoundingClientRect().height;
      handle.classList.add("active");
      document.body.classList.add("resizing-v");
      const onMove = (e) => {
        const h = Math.max(min, Math.min(max, startH + (startY - e.clientY)));
        target.style.height = h + "px"; target.style.minHeight = h + "px"; target.style.maxHeight = h + "px";
      };
      const onUp = () => {
        handle.classList.remove("active"); document.body.classList.remove("resizing-v");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        bord.savePanelSizes();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  };
  const sb = document.getElementById("sidebar"), rs = document.getElementById("resize-sidebar");
  const tp = document.getElementById("tool-panel"), rt = document.getElementById("resize-tools");
  const ta = document.getElementById("msg-input"), ri = document.getElementById("resize-input");
  if (rs && sb) dragH(rs, sb, 150, 500, false);
  if (rt && tp) dragH(rt, tp, 200, 800, true);
  if (ri && ta) dragV(ri, ta, 50, 500);
};

bord.savePanelSizes = function() {
  const sb = document.getElementById("sidebar");
  const tp = document.getElementById("tool-panel");
  const ta = document.getElementById("msg-input");
  this.settings.panels = {
    sidebar: sb ? Math.round(sb.getBoundingClientRect().width) : 260,
    tools: tp ? Math.round(tp.getBoundingClientRect().width) : 380,
    textarea: ta ? Math.round(ta.getBoundingClientRect().height) : 80,
  };
  pywebview.api.save_settings(this.settings);
};

bord.applyPanelSizes = function() {
  const p = this.settings.panels;
  if (!p) return;
  const sb = document.getElementById("sidebar");
  const tp = document.getElementById("tool-panel");
  const ta = document.getElementById("msg-input");
  if (p.sidebar && sb) { sb.style.width = p.sidebar + "px"; sb.style.minWidth = p.sidebar + "px"; }
  if (p.tools && tp) { tp.style.width = p.tools + "px"; tp.style.minWidth = p.tools + "px"; }
  if (p.textarea && ta) { ta.style.height = p.textarea + "px"; ta.style.minHeight = p.textarea + "px"; ta.style.maxHeight = p.textarea + "px"; }
};
