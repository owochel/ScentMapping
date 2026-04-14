const STORAGE_KEY = "scentMapping.entries.v1";

/** @typedef {{id:string, scent:string, color:string, description:string, createdAt:string, updatedAt?:string}} Entry */

const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));

const form = /** @type {HTMLFormElement} */ ($("#mappingForm"));
const scentInput = /** @type {HTMLInputElement} */ ($("#scentInput"));
const colorInput = /** @type {HTMLInputElement} */ ($("#colorInput"));
const colorText = /** @type {HTMLInputElement} */ ($("#colorText"));
const colorPreview = $("#colorPreview");
const hexOut = /** @type {HTMLOutputElement} */ ($("#hexOut"));
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

function uid() {
  return crypto.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeHex(value) {
  const v = String(value ?? "").trim();
  const m = v.match(/^#([0-9a-fA-F]{6})$/);
  if (m) return `#${m[1].toUpperCase()}`;
  return null;
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

colorInput.addEventListener("input", () => applyColor(colorInput.value));
colorText.addEventListener("input", () => {
  const h = normalizeHex(colorText.value);
  if (h) applyColor(h);
});
colorText.addEventListener("blur", () => {
  applyColor(colorText.value);
});

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
  const color = normalizeHex(colorText.value) ?? normalizeHex(colorInput.value) ?? "#7A6CFF";
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

