const STORAGE_KEY = "scentMapping.entries.v1";
const SUPABASE_URL = "https://wvtvsbcjlqfxxgtgwwtl.supabase.co"; // e.g. https://YOUR_PROJECT.supabase.co
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4v4SVP9PImK5y4-RSlIurg_Oq7eYkZM"; // Use "Publishable key" from Supabase API settings
const SUPABASE_TABLE = "scent_entries";

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
const vizGrid = $("#vizGrid");
const vizEmpty = $("#vizEmpty");
const vizPager = $("#vizPager");
const vizPrevBtn = /** @type {HTMLButtonElement} */ ($("#vizPrevBtn"));
const vizNextBtn = /** @type {HTMLButtonElement} */ ($("#vizNextBtn"));
const vizPageOut = $("#vizPageOut");
const vizPageTotalOut = $("#vizPageTotalOut");
const colorWheel = $("#colorWheel");
const wheelStage = $("#wheelStage");
const spectrumCanvas = /** @type {HTMLCanvasElement} */ ($("#spectrumCanvas"));
const wheelDots = $("#wheelDots");
const wheelEmpty = $("#wheelEmpty");
const wheelTooltip = $("#wheelTooltip");
const pager = $("#pager");
const prevPageBtn = /** @type {HTMLButtonElement} */ ($("#prevPageBtn"));
const nextPageBtn = /** @type {HTMLButtonElement} */ ($("#nextPageBtn"));
const pageOut = $("#pageOut");
const pageTotalOut = $("#pageTotalOut");

/** @type {Entry[]} */
let entries = [];
/** @type {string|null} */
let editingId = null;
let page = 1;
const PAGE_SIZE = 5;
let vizPage = 1;
const VIZ_PAGE_SIZE = 9;
let wheelView = { scale: 1, x: 0, y: 0 };
let wheelDragging = false;
let wheelDragStart = { x: 0, y: 0, baseX: 0, baseY: 0 };
let supabaseClient = null;
let remoteEnabled = false;

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

function rgbToHsl({ r, g, b }) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rr) h = 60 * (((gg - bb) / d) % 6);
    else if (max === gg) h = 60 * ((bb - rr) / d + 2);
    else h = 60 * ((rr - gg) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp01(s / 100);
  const ll = clamp01(l / 100);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
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

function drawSpectrumCanvas() {
  if (!spectrumCanvas || !colorWheel) return;
  const rect = colorWheel.getBoundingClientRect();
  const w = Math.max(2, Math.round(rect.width));
  const h = Math.max(2, Math.round(rect.height));
  if (spectrumCanvas.width !== w || spectrumCanvas.height !== h) {
    spectrumCanvas.width = w;
    spectrumCanvas.height = h;
  }
  const ctx = spectrumCanvas.getContext("2d");
  if (!ctx) return;

  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    // top pastel -> middle vivid -> bottom dark
    const sat = t < 0.5 ? 30 + (t / 0.5) * 70 : 100;
    const light = t < 0.5 ? 92 - (t / 0.5) * 42 : 50 - ((t - 0.5) / 0.5) * 42;
    for (let x = 0; x < w; x++) {
      const hue = (x / (w - 1)) * 360;
      const { r, g, b } = hslToRgb(hue, sat, light);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
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

function mapDbRowToEntry(row) {
  return {
    id: String(row.id ?? uid()),
    scent: String(row.scent ?? "").trim(),
    color: normalizeHex(row.color_hex ?? row.color) ?? "#7A6CFF",
    description: String(row.description ?? ""),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mapEntryToDbRow(entry) {
  return {
    id: entry.id,
    scent: entry.scent,
    color_hex: entry.color,
    description: entry.description,
    created_at: entry.createdAt,
  };
}

function canUseSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && window.supabase?.createClient);
}

function initSupabase() {
  if (!canUseSupabase()) return null;
  if (supabaseClient) return supabaseClient;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return supabaseClient;
}

async function fetchRemoteEntries() {
  const client = initSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from(SUPABASE_TABLE)
    .select("id,scent,color_hex,description,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDbRowToEntry);
}

async function upsertRemoteEntry(entry) {
  const client = initSupabase();
  if (!client) return;
  const payload = mapEntryToDbRow(entry);
  const { error } = await client.from(SUPABASE_TABLE).upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

async function insertRemoteEntry(entry) {
  const client = initSupabase();
  if (!client) return;
  const payload = mapEntryToDbRow(entry);
  const { error } = await client.from(SUPABASE_TABLE).insert(payload);
  if (error) throw error;
}

async function updateRemoteEntry(entry) {
  const client = initSupabase();
  if (!client) return;
  const payload = mapEntryToDbRow(entry);
  const { error } = await client
    .from(SUPABASE_TABLE)
    .update({
      scent: payload.scent,
      color_hex: payload.color_hex,
      description: payload.description,
    })
    .eq("id", payload.id);
  if (error) throw error;
}

async function deleteRemoteEntry(id) {
  const client = initSupabase();
  if (!client) return;
  const { error } = await client.from(SUPABASE_TABLE).delete().eq("id", id);
  if (error) throw error;
}

async function loadInitialEntries() {
  // local cache first for fast paint, then remote sync if configured
  entries = load();
  if (!entries.length) await seedFromLocalCsvIfEmpty();

  try {
    const remote = await fetchRemoteEntries();
    if (remote) {
      remoteEnabled = true;
      entries = remote;
      persist();
      return;
    }
  } catch {
    remoteEnabled = false;
  }
}

function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((x) => String(x).length));
}

function entriesFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h).trim());
  /** @type {Entry[]} */
  const out = [];
  for (const r of rows.slice(1)) {
    /** @type {any} */
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i] ?? "";
    const scent = String(obj.scent ?? "").trim();
    const color = normalizeHex(obj.color) ?? "#7A6CFF";
    if (!scent) continue;
    out.push({
      id: String(obj.id ?? uid()),
      scent,
      color,
      description: String(obj.description ?? ""),
      createdAt: String(obj.createdAt ?? new Date().toISOString()),
      updatedAt: obj.updatedAt ? String(obj.updatedAt) : undefined,
    });
  }
  return out;
}

async function seedFromLocalCsvIfEmpty() {
  if (entries.length) return;
  try {
    const res = await fetch("./localData.csv", { cache: "no-store" });
    if (!res.ok) return;
    const text = await res.text();
    const seeded = entriesFromCsv(text);
    if (!seeded.length) return;
    entries = seeded.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    persist();
  } catch {
    // ignore
  }
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

  const filteredAll = entries.filter((e) => matchQuery(e, q)).sort((a, b) => compareEntries(a, b, mode));
  const totalPages = Math.max(1, Math.ceil(filteredAll.length / PAGE_SIZE));
  page = Math.min(Math.max(1, page), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const filtered = filteredAll.slice(start, start + PAGE_SIZE);

  countOut.textContent = String(entries.length);
  exportNote.textContent = entries.length ? `Last saved: ${formatDate(entries[0]?.updatedAt ?? entries[0]?.createdAt)}` : "";

  list.innerHTML = "";
  emptyState.hidden = entries.length !== 0;
  if (pageOut) pageOut.textContent = String(page);
  if (pageTotalOut) pageTotalOut.textContent = String(totalPages);
  if (pager) pager.hidden = filteredAll.length <= PAGE_SIZE;
  if (prevPageBtn) prevPageBtn.disabled = page <= 1;
  if (nextPageBtn) nextPageBtn.disabled = page >= totalPages;

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
    delBtn.addEventListener("click", async () => {
      const ok = confirm(`Delete mapping for “${entry.scent}”?`);
      if (!ok) return;
      const previous = entries;
      entries = entries.filter((e) => e.id !== entry.id);
      persist();
      try {
        await deleteRemoteEntry(entry.id);
      } catch {
        // restore local state if remote delete failed to avoid divergence
        entries = previous;
        persist();
        setStatus("Delete failed on remote. Kept local data unchanged.", "bad");
        render();
        return;
      }
      if (editingId === entry.id) resetForm(true);
      setStatus("Deleted mapping.", "good");
      render();
    });

    actions.append(editBtn, delBtn);

    li.append(left, actions);
    list.append(li);
  }

  renderViz();
  renderColorWheel();
}

function renderViz() {
  if (!vizGrid) return;
  vizGrid.innerHTML = "";
  const q = (searchInput?.value ?? "").trim().toLowerCase();
  const source = q ? entries.filter((e) => matchQuery(e, q)) : entries;

  if (!source.length) {
    if (vizEmpty) vizEmpty.hidden = false;
    if (vizPager) vizPager.hidden = true;
    return;
  }
  if (vizEmpty) vizEmpty.hidden = true;

  /** @type {Map<string, Map<string, number>>} */
  const byScent = new Map();
  for (const e of source) {
    const scent = String(e.scent ?? "").trim();
    const color = normalizeHex(e.color) ?? "#7A6CFF";
    if (!scent) continue;
    if (!byScent.has(scent)) byScent.set(scent, new Map());
    const m = byScent.get(scent);
    m.set(color, (m.get(color) ?? 0) + 1);
  }

  const scentsAll = Array.from(byScent.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const totalPages = Math.max(1, Math.ceil(scentsAll.length / VIZ_PAGE_SIZE));
  vizPage = Math.min(Math.max(1, vizPage), totalPages);
  const start = (vizPage - 1) * VIZ_PAGE_SIZE;
  const scents = scentsAll.slice(start, start + VIZ_PAGE_SIZE);

  if (vizPageOut) vizPageOut.textContent = String(vizPage);
  if (vizPageTotalOut) vizPageTotalOut.textContent = String(totalPages);
  if (vizPager) vizPager.hidden = scentsAll.length <= VIZ_PAGE_SIZE;
  if (vizPrevBtn) vizPrevBtn.disabled = vizPage <= 1;
  if (vizNextBtn) vizNextBtn.disabled = vizPage >= totalPages;

  for (const scent of scents) {
    const counts = byScent.get(scent);
    const pairs = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const total = Array.from(counts.values()).reduce((acc, n) => acc + n, 0);

    const card = document.createElement("div");
    card.className = "viz-card";

    const top = document.createElement("div");
    top.className = "viz-top";

    const title = document.createElement("div");
    title.className = "viz-scent";
    title.textContent = scent;

    const ct = document.createElement("div");
    ct.className = "viz-count";
    ct.textContent = `${total}×`;

    top.append(title, ct);

    const orb = document.createElement("div");
    orb.className = "orb";
    orb.setAttribute("role", "img");
    orb.setAttribute("aria-label", `Colors for ${scent}`);

    const positions = [
      "35% 35%",
      "65% 40%",
      "45% 68%",
      "72% 70%",
      "28% 78%",
    ];

    const rgba = (hex, a) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return `rgba(122,108,255,${a})`;
      return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
    };

    const layers = pairs.flatMap(([hex], idx) => {
      const posA = positions[idx] ?? "50% 50%";
      // a second, slightly offset cloud for that “ink in water” blur
      const posB =
        idx % 2 === 0
          ? `${Math.min(92, 35 + idx * 9)}% ${Math.min(90, 30 + idx * 11)}%`
          : `${Math.max(8, 70 - idx * 10)}% ${Math.min(92, 55 + idx * 7)}%`;

      return [
        `radial-gradient(circle at ${posA}, ${rgba(hex, 0.92)} 0%, ${rgba(hex, 0.55)} 18%, ${rgba(hex, 0)} 68%)`,
        `radial-gradient(circle at ${posB}, ${rgba(hex, 0.55)} 0%, ${rgba(hex, 0.22)} 28%, ${rgba(hex, 0)} 78%)`,
      ];
    });

    // base soft wash + layered blurs (reference-style)
    const bg = [
      "radial-gradient(circle at 50% 55%, rgba(255,255,255,.05) 0%, rgba(0,0,0,0) 62%)",
      ...layers,
    ].join(", ");
    orb.style.setProperty("--orb-bg", bg);

    const chips = document.createElement("div");
    chips.className = "viz-chips";
    for (const [hex, n] of pairs) {
      const chip = document.createElement("div");
      chip.className = "viz-chip";
      chip.textContent = n > 1 ? `${hex} · ${n}×` : hex;
      chips.appendChild(chip);
    }

    card.append(top, orb, chips);
    vizGrid.appendChild(card);
  }
}

function renderColorWheel() {
  if (!colorWheel || !wheelDots) return;
  wheelDots.innerHTML = "";

  const q = (searchInput?.value ?? "").trim().toLowerCase();
  const source = q ? entries.filter((e) => matchQuery(e, q)) : entries;
  if (!source.length) {
    if (wheelEmpty) wheelEmpty.hidden = false;
    colorWheel.hidden = true;
    if (wheelTooltip) wheelTooltip.hidden = true;
    return;
  }

  /** @type {Map<string, {count:number, scents:Set<string>} >} */
  const byColor = new Map();
  for (const e of source) {
    const hex = normalizeHex(e.color);
    if (!hex) continue;
    if (!byColor.has(hex)) byColor.set(hex, { count: 0, scents: new Set() });
    const item = byColor.get(hex);
    item.count += 1;
    item.scents.add(String(e.scent ?? "").trim());
  }

  const colors = Array.from(byColor.entries()).sort((a, b) => b[1].count - a[1].count);
  if (!colors.length) {
    if (wheelEmpty) wheelEmpty.hidden = false;
    colorWheel.hidden = true;
    if (wheelTooltip) wheelTooltip.hidden = true;
    return;
  }

  colorWheel.hidden = false;
  if (wheelEmpty) wheelEmpty.hidden = true;

  for (const [hex, meta] of colors) {
    const rgb = hexToRgb(hex);
    if (!rgb) continue;
    const hslDot = rgbToHsl(rgb);
    // Plot in rectangular spectrum space:
    // x = hue, y follows the same lightness curve used by drawSpectrumCanvas().
    const cx = clamp01(hslDot.h / 360) * 100;
    const tFromL = clamp01((92 - hslDot.l) / 84);
    const tFromS = clamp01((hslDot.s - 30) / 140);
    const t = tFromL < 0.55 ? clamp01(tFromL * 0.78 + tFromS * 0.22) : tFromL;
    const cy = t * 100;

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "wheel-dot";
    dot.style.left = `${cx}%`;
    dot.style.top = `${cy}%`;
    dot.style.background = hex;
    dot.setAttribute("aria-label", `${hex}, ${meta.scents.size} scent${meta.scents.size === 1 ? "" : "s"}`);

    const scentList = Array.from(meta.scents).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const scentText = scentList.join(", ");
    const showTip = () => {
      const dotRect = dot.getBoundingClientRect();
      const tx = dotRect.left + dotRect.width / 2;
      const ty = dotRect.top;
      wheelTooltip.hidden = false;
      wheelTooltip.style.left = `${tx}px`;
      wheelTooltip.style.top = `${ty}px`;
      wheelTooltip.innerHTML = `<div class="mono">${hex} · ${meta.count} mention${meta.count === 1 ? "" : "s"}</div><div>${scentText || "No scents"}</div>`;
    };
    const hideTip = () => {
      if (!wheelTooltip) return;
      wheelTooltip.hidden = true;
    };

    dot.addEventListener("mouseenter", showTip);
    dot.addEventListener("focus", showTip);
    dot.addEventListener("mouseleave", hideTip);
    dot.addEventListener("blur", hideTip);

    wheelDots.appendChild(dot);
  }
}

function clampWheelView() {
  if (!colorWheel) return;
  if (wheelView.scale <= 1) {
    wheelView.x = 0;
    wheelView.y = 0;
    return;
  }
  const rect = colorWheel.getBoundingClientRect();
  const minX = rect.width - rect.width * wheelView.scale;
  const minY = rect.height - rect.height * wheelView.scale;
  wheelView.x = Math.min(0, Math.max(minX, wheelView.x));
  wheelView.y = Math.min(0, Math.max(minY, wheelView.y));
}

function applyWheelTransform() {
  if (!wheelStage) return;
  clampWheelView();
  wheelStage.style.transform = `translate(${wheelView.x}px, ${wheelView.y}px) scale(${wheelView.scale})`;
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

await loadInitialEntries();
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
window.addEventListener("resize", () => {
  applyWheelTransform();
  drawSpectrumCanvas();
});

descInput.addEventListener("input", () => {
  descCount.textContent = String(descInput.value.length);
});

cancelEditBtn.addEventListener("click", () => {
  resetForm();
});

searchInput.addEventListener("input", () => {
  page = 1;
  vizPage = 1;
  render();
});
sortSelect.addEventListener("change", () => {
  page = 1;
  render();
});

prevPageBtn?.addEventListener("click", () => {
  page = Math.max(1, page - 1);
  render();
});
nextPageBtn?.addEventListener("click", () => {
  page = page + 1;
  render();
});

vizPrevBtn?.addEventListener("click", () => {
  vizPage = Math.max(1, vizPage - 1);
  renderViz();
});
vizNextBtn?.addEventListener("click", () => {
  vizPage = vizPage + 1;
  renderViz();
});

colorWheel?.addEventListener("wheel", (e) => {
  if (!colorWheel) return;
  e.preventDefault();
  const rect = colorWheel.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const nextScale = Math.min(6, Math.max(1, wheelView.scale * factor));
  if (nextScale === wheelView.scale) return;

  const wx = (cx - wheelView.x) / wheelView.scale;
  const wy = (cy - wheelView.y) / wheelView.scale;
  wheelView.scale = nextScale;
  wheelView.x = cx - wx * wheelView.scale;
  wheelView.y = cy - wy * wheelView.scale;
  applyWheelTransform();
  if (wheelTooltip) wheelTooltip.hidden = true;
}, { passive: false });

colorWheel?.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  wheelDragging = true;
  wheelDragStart = { x: e.clientX, y: e.clientY, baseX: wheelView.x, baseY: wheelView.y };
  colorWheel.classList.add("is-dragging");
  if (wheelTooltip) wheelTooltip.hidden = true;
});

window.addEventListener("mousemove", (e) => {
  if (!wheelDragging) return;
  wheelView.x = wheelDragStart.baseX + (e.clientX - wheelDragStart.x);
  wheelView.y = wheelDragStart.baseY + (e.clientY - wheelDragStart.y);
  applyWheelTransform();
});

window.addEventListener("mouseup", () => {
  wheelDragging = false;
  colorWheel?.classList.remove("is-dragging");
});

colorWheel?.addEventListener("dblclick", () => {
  wheelView = { scale: 1, x: 0, y: 0 };
  applyWheelTransform();
  if (wheelTooltip) wheelTooltip.hidden = true;
});

clearAllBtn.addEventListener("click", () => {
  if (!entries.length) {
    setStatus("Nothing to clear.", "neutral");
    return;
  }
  const ok = confirm(
    remoteEnabled
      ? "Clear local cache and reload shared database entries?"
      : "Clear ALL saved scent mappings? This cannot be undone."
  );
  if (!ok) return;
  if (remoteEnabled) {
    localStorage.removeItem(STORAGE_KEY);
    setStatus("Local cache cleared. Reloading shared entries…", "good");
    loadInitialEntries().then(() => {
      page = 1;
      vizPage = 1;
      resetForm(true);
      render();
    });
    return;
  }
  entries = [];
  persist();
  page = 1;
  vizPage = 1;
  resetForm(true);
  setStatus("Cleared all mappings.", "good");
  render();
});

applyWheelTransform();
drawSpectrumCanvas();

form.addEventListener("submit", async (e) => {
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
      try {
        await updateRemoteEntry(entries[idx]);
        if (remoteEnabled) setStatus("Updated mapping (synced).", "good");
        else setStatus("Updated mapping.", "good");
      } catch (err) {
        const msg = String(err?.message ?? "");
        if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
          setStatus("Updated locally. Supabase rejected update (check RLS policies / publishable key).", "bad");
        } else {
          setStatus("Updated locally. Remote sync failed.", "bad");
        }
      }
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
  try {
    await insertRemoteEntry(entry);
    if (remoteEnabled) setStatus("Saved mapping (synced).", "good");
    else setStatus("Saved mapping.", "good");
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
      setStatus("Saved locally. Supabase rejected insert (check RLS insert policy / publishable key).", "bad");
    } else {
      setStatus("Saved locally. Remote sync failed.", "bad");
    }
  }
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

