const STORAGE_KEY = "scentMapping.entries.v1";

/** @typedef {{id:string, scent:string, color:string, description:string, createdAt:string, updatedAt?:string}} Entry */

const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));

const form = /** @type {HTMLFormElement} */ ($("#mappingForm"));
const scentInput = /** @type {HTMLInputElement} */ ($("#scentInput"));
const colorInput = /** @type {HTMLInputElement} */ ($("#colorInput")); // hidden canonical hex
const colorText = /** @type {HTMLInputElement} */ ($("#colorText"));
const colorPreview = $("#colorPreview");
const hexOut = /** @type {HTMLOutputElement} */ ($("#hexOut"));
const svCanvas = /** @type {HTMLCanvasElement} */ ($("#svCanvas"));
const hueCanvas = /** @type {HTMLCanvasElement} */ ($("#hueCanvas"));
const svCursor = $("#svCursor");
const hueCursor = $("#hueCursor");
const descInput = /** @type {HTMLTextAreaElement} */ ($("#descInput"));
const descCount = $("#descCount");
const list = $("#list");
const emptyState = $("#emptyState");
const countOut = $("#countOut");
const formStatus = $("#formStatus");
const saveBtn = $("#saveBtn");
const cancelEditBtn = /** @type {HTMLButtonElement} */ ($("#cancelEditBtn"));
const clearAllBtn = /** @type {HTMLButtonElement} */ ($("#clearAllBtn"));
const downloadJsonBtn = /** @type {HTMLButtonElement} */ ($("#downloadJsonBtn"));
const downloadCsvBtn = /** @type {HTMLButtonElement} */ ($("#downloadCsvBtn"));
const exportNote = $("#exportNote");
const searchInput = /** @type {HTMLInputElement} */ ($("#searchInput"));
const sortSelect = /** @type {HTMLSelectElement} */ ($("#sortSelect"));

/** @type {Entry[]} */
let entries = [];
/** @type {string|null} */
let editingId = null;

/** @type {{h:number,s:number,v:number}} */
let hsv = { h: 260, s: 0.58, v: 1 };
let isDraggingSv = false;
let isDraggingHue = false;

function uid() {
  return crypto.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeHex(value) {
  const v = String(value ?? "").trim();
  const m = v.match(/^#([0-9a-fA-F]{6})$/);
  if (m) return `#${m[1].toUpperCase()}`;
  return null;
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function hsvToRgb({ h, s, v }) {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 60) [r1, g1, b1] = [c, x, 0];
  else if (hh < 120) [r1, g1, b1] = [x, c, 0];
  else if (hh < 180) [r1, g1, b1] = [0, c, x];
  else if (hh < 240) [r1, g1, b1] = [0, x, c];
  else if (hh < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function rgbToHex({ r, g, b }) {
  const to2 = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsv({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = 60 * (((gg - bb) / d) % 6);
    else if (max === gg) h = 60 * ((bb - rr) / d + 2);
    else h = 60 * ((rr - gg) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function setStatus(msg, tone = "neutral") {
  formStatus.textContent = msg;
  formStatus.classList.remove("good", "bad");
  if (tone === "good") formStatus.classList.add("good");
  if (tone === "bad") formStatus.classList.add("bad");
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => ({
        id: String(x.id ?? uid()),
        scent: String(x.scent ?? "").trim(),
        color: normalizeHex(x.color) ?? "#7A6CFF",
        description: String(x.description ?? ""),
        createdAt: String(x.createdAt ?? new Date().toISOString()),
        updatedAt: x.updatedAt ? String(x.updatedAt) : undefined,
      }))
      .filter((x) => x.scent.length > 0);
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries, null, 2));
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function applyColor(hex) {
  const h = normalizeHex(hex) ?? "#7A6CFF";
  colorInput.value = h;
  colorText.value = h;
  hexOut.value = h;
  hexOut.textContent = h;
  colorPreview.style.background = `radial-gradient(circle at 45% 40%, rgba(255,255,255,.22), transparent 56%),
    radial-gradient(circle at 55% 60%, rgba(0,0,0,.35), transparent 60%),
    ${h}`;

  const rgb = hexToRgb(h);
  if (rgb) {
    hsv = rgbToHsv(rgb);
    redrawPicker();
  }
}

function redrawHue() {
  const ctx = hueCanvas.getContext("2d");
  if (!ctx) return;
  const w = hueCanvas.width;
  const h = hueCanvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (let i = 0; i <= 360; i += 60) {
    const c = rgbToHex(hsvToRgb({ h: i, s: 1, v: 1 }));
    g.addColorStop(i / 360, c);
  }
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function redrawSv() {
  const ctx = svCanvas.getContext("2d");
  if (!ctx) return;
  const w = svCanvas.width;
  const h = svCanvas.height;
  ctx.clearRect(0, 0, w, h);

  // base hue
  ctx.fillStyle = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  ctx.fillRect(0, 0, w, h);

  // saturation overlay (white -> transparent)
  const sat = ctx.createLinearGradient(0, 0, w, 0);
  sat.addColorStop(0, "rgba(255,255,255,1)");
  sat.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sat;
  ctx.fillRect(0, 0, w, h);

  // value overlay (transparent -> black)
  const val = ctx.createLinearGradient(0, 0, 0, h);
  val.addColorStop(0, "rgba(0,0,0,0)");
  val.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = val;
  ctx.fillRect(0, 0, w, h);
}

function positionCursors() {
  const svRect = svCanvas.getBoundingClientRect();
  const hueRect = hueCanvas.getBoundingClientRect();

  const x = hsv.s * svRect.width;
  const y = (1 - hsv.v) * svRect.height;
  svCursor.style.left = `${x}px`;
  svCursor.style.top = `${y}px`;

  const hy = (hsv.h / 360) * hueRect.height;
  hueCursor.style.top = `${hy}px`;
}

function redrawPicker() {
  redrawHue();
  redrawSv();
  positionCursors();
}

function setFromHsv(next) {
  hsv = { h: ((next.h % 360) + 360) % 360, s: clamp01(next.s), v: clamp01(next.v) };
  const hex = rgbToHex(hsvToRgb(hsv));
  // keep canonical
  colorInput.value = hex;
  colorText.value = hex;
  hexOut.value = hex;
  hexOut.textContent = hex;
  colorPreview.style.background = `radial-gradient(circle at 45% 40%, rgba(255,255,255,.22), transparent 56%),
    radial-gradient(circle at 55% 60%, rgba(0,0,0,.35), transparent 60%),
    ${hex}`;
  redrawPicker();
}

function getPointerPos(e, el) {
  const r = el.getBoundingClientRect();
  const x = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
  const y = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
  return { x: x - r.left, y: y - r.top, w: r.width, h: r.height };
}

function setEditing(entry) {
  editingId = entry?.id ?? null;
  if (editingId) {
    saveBtn.textContent = "Update mapping";
    cancelEditBtn.hidden = false;
    setStatus("Editing existing mapping.", "neutral");
  } else {
    saveBtn.textContent = "Save mapping";
    cancelEditBtn.hidden = true;
    setStatus("");
  }
}

function resetForm(keepStatus = false) {
  form.reset();
  scentInput.value = "";
  descInput.value = "";
  descCount.textContent = "0";
  applyColor("#7A6CFF");
  setEditing(null);
  if (!keepStatus) setStatus("");
}

function matchQuery(entry, q) {
  if (!q) return true;
  const hay = `${entry.scent}\n${entry.description}`.toLowerCase();
  return hay.includes(q);
}

function compareEntries(a, b, mode) {
  if (mode === "oldest") return a.createdAt.localeCompare(b.createdAt);
  if (mode === "scent-az") return a.scent.localeCompare(b.scent, undefined, { sensitivity: "base" });
  if (mode === "scent-za") return b.scent.localeCompare(a.scent, undefined, { sensitivity: "base" });
  return b.createdAt.localeCompare(a.createdAt);
}

function render() {
  const q = (searchInput.value ?? "").trim().toLowerCase();
  const mode = sortSelect.value;

  const filtered = entries.filter((e) => matchQuery(e, q)).sort((a, b) => compareEntries(a, b, mode));

  countOut.textContent = String(entries.length);
  exportNote.textContent = entries.length ? `Last saved: ${formatDate(entries[0]?.updatedAt ?? entries[0]?.createdAt)}` : "";

  list.innerHTML = "";
  emptyState.hidden = entries.length !== 0;

  for (const entry of filtered) {
    const li = document.createElement("li");
    li.className = "row";

    const left = document.createElement("div");
    left.className = "row-left";

    const dot = document.createElement("div");
    dot.className = "dot";
    dot.style.background = entry.color;
    dot.title = entry.color;

    const main = document.createElement("div");
    main.className = "row-main";

    const title = document.createElement("div");
    title.className = "row-title";

    const scent = document.createElement("div");
    scent.className = "scent";
    scent.textContent = entry.scent;

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = entry.color;

    title.append(scent, chip);

    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = entry.description || "—";

    const meta = document.createElement("div");
    meta.className = "row-meta";
    meta.textContent = `${formatDate(entry.createdAt)}${entry.updatedAt ? ` · edited ${formatDate(entry.updatedAt)}` : ""}`;

    main.append(title, desc, meta);
    left.append(dot, main);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      scentInput.value = entry.scent;
      descInput.value = entry.description;
      descCount.textContent = String(entry.description.length);
      applyColor(entry.color);
      setEditing(entry);
      scentInput.focus();
      scentInput.setSelectionRange(0, scentInput.value.length);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      const ok = confirm(`Delete mapping for “${entry.scent}”?`);
      if (!ok) return;
      entries = entries.filter((e) => e.id !== entry.id);
      persist();
      if (editingId === entry.id) resetForm(true);
      setStatus("Deleted mapping.", "good");
      render();
    });

    actions.append(editBtn, delBtn);

    li.append(left, actions);
    list.append(li);
  }
}

function toCsv(rows) {
  const headers = ["id", "scent", "color", "description", "createdAt", "updatedAt"];
  const esc = (v) => {
    const s = String(v ?? "");
    const needs = /[",\n]/.test(s);
    const t = s.replace(/"/g, '""');
    return needs ? `"${t}"` : t;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => esc(r[h]))
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// --- events ---
applyColor(colorInput.value);

entries = load();
render();

colorText.addEventListener("input", () => {
  const h = normalizeHex(colorText.value);
  if (h) applyColor(h);
});
colorText.addEventListener("blur", () => {
  applyColor(colorText.value);
});

// picker interactions (SV square)
svCanvas.addEventListener("pointerdown", (e) => {
  isDraggingSv = true;
  svCanvas.setPointerCapture(e.pointerId);
  const p = getPointerPos(e, svCanvas);
  setFromHsv({ h: hsv.h, s: clamp01(p.x / p.w), v: clamp01(1 - p.y / p.h) });
});
svCanvas.addEventListener("pointermove", (e) => {
  if (!isDraggingSv) return;
  const p = getPointerPos(e, svCanvas);
  setFromHsv({ h: hsv.h, s: clamp01(p.x / p.w), v: clamp01(1 - p.y / p.h) });
});
svCanvas.addEventListener("pointerup", () => {
  isDraggingSv = false;
});
svCanvas.addEventListener("pointercancel", () => {
  isDraggingSv = false;
});

// hue slider
hueCanvas.addEventListener("pointerdown", (e) => {
  isDraggingHue = true;
  hueCanvas.setPointerCapture(e.pointerId);
  const p = getPointerPos(e, hueCanvas);
  setFromHsv({ h: clamp01(p.y / p.h) * 360, s: hsv.s, v: hsv.v });
});
hueCanvas.addEventListener("pointermove", (e) => {
  if (!isDraggingHue) return;
  const p = getPointerPos(e, hueCanvas);
  setFromHsv({ h: clamp01(p.y / p.h) * 360, s: hsv.s, v: hsv.v });
});
hueCanvas.addEventListener("pointerup", () => {
  isDraggingHue = false;
});
hueCanvas.addEventListener("pointercancel", () => {
  isDraggingHue = false;
});

window.addEventListener("resize", () => positionCursors());

descInput.addEventListener("input", () => {
  descCount.textContent = String(descInput.value.length);
});

cancelEditBtn.addEventListener("click", () => {
  resetForm();
});

searchInput.addEventListener("input", () => render());
sortSelect.addEventListener("change", () => render());

clearAllBtn.addEventListener("click", () => {
  if (!entries.length) {
    setStatus("Nothing to clear.", "neutral");
    return;
  }
  const ok = confirm("Clear ALL saved scent mappings? This cannot be undone.");
  if (!ok) return;
  entries = [];
  persist();
  resetForm(true);
  setStatus("Cleared all mappings.", "good");
  render();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const scent = String(scentInput.value ?? "").trim();
  const color = normalizeHex(colorInput.value) ?? normalizeHex(colorText.value) ?? "#7A6CFF";
  const description = String(descInput.value ?? "");

  if (!scent) {
    setStatus("Please enter a scent name.", "bad");
    scentInput.focus();
    return;
  }

  const now = new Date().toISOString();
  if (editingId) {
    const idx = entries.findIndex((x) => x.id === editingId);
    if (idx === -1) {
      setStatus("That mapping no longer exists. Saving as new.", "neutral");
      editingId = null;
    } else {
      entries[idx] = {
        ...entries[idx],
        scent,
        color,
        description,
        updatedAt: now,
      };
      persist();
      setStatus("Updated mapping.", "good");
      setEditing(null);
      resetForm(true);
      render();
      return;
    }
  }

  /** @type {Entry} */
  const entry = {
    id: uid(),
    scent,
    color,
    description,
    createdAt: now,
  };
  entries.unshift(entry);
  persist();
  setStatus("Saved mapping.", "good");
  resetForm(true);
  render();
});

downloadJsonBtn.addEventListener("click", () => {
  if (!entries.length) {
    setStatus("No data to download yet.", "bad");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`scent-mapping_${stamp}.json`, JSON.stringify(entries, null, 2), "application/json");
  setStatus("Downloaded JSON.", "good");
});

downloadCsvBtn.addEventListener("click", () => {
  if (!entries.length) {
    setStatus("No data to download yet.", "bad");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`scent-mapping_${stamp}.csv`, toCsv(entries), "text/csv;charset=utf-8");
  setStatus("Downloaded CSV.", "good");
});

