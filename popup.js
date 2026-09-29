const input = document.getElementById("input");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("list");
const empty = document.getElementById("empty");
const count = document.getElementById("count");

const recurringToggle = document.getElementById("recurringToggle");
const schedOptions = document.getElementById("schedOptions");
const schedFreq = document.getElementById("schedFreq");
const weekdayPicker = document.getElementById("weekdayPicker");
const intervalPicker = document.getElementById("intervalPicker");
const intervalDays = document.getElementById("intervalDays");
const quotaPicker = document.getElementById("quotaPicker");
const quotaTimes = document.getElementById("quotaTimes");

const DAY_MS = 24 * 3600 * 1000;

let memos = [];
let dragId = null;          // 改动：用 id 代替 index
let idCounter = 1;
let editingId = null;

function genId() {
  return Date.now().toString(36) + "-" + (idCounter++).toString(36);
}

function getDayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getWeekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  return d.getTime();
}

// ===== 完成状态 / 分组 =====
function isDoneMemo(m) {
  if (m.type === "recurring") return !!m.grayed;
  return !!m.done;
}

// 稳定分组：未完成在前、已完成在后，组内保持原顺序
function regroupMemos() {
  const undone = [];
  const done = [];
  for (const m of memos) {
    (isDoneMemo(m) ? done : undone).push(m);
  }
  memos = undone.concat(done);
}

// ===== 就地编辑 =====
function startEdit(id, li) {
  if (editingId) return;
  editingId = id;
  li.classList.add("editing");
  li.draggable = false;

  const contentEl = li.querySelector(".content");
  const badge = contentEl.querySelector(".badge");
  if (badge) badge.remove();

  const m = memos.find((x) => x.id === id);
  li.dataset.original = m ? m.text : "";

  contentEl.contentEditable = "plaintext-only";
  contentEl.spellcheck = false;
  contentEl.focus();

  const range = document.createRange();
  range.selectNodeContents(contentEl);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  contentEl.addEventListener("keydown", handleEditKey);
  contentEl.addEventListener("blur", handleEditBlur, { once: true });
}

function handleEditKey(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.target.dataset.cancelled = "1";
    e.target.textContent = e.target.closest(".item").dataset.original || "";
    e.target.blur();
  }
}

function handleEditBlur(e) {
  const el = e.target;
  const cancelled = el.dataset.cancelled === "1";
  const text = el.textContent.replace(/\s+/g, " ").trim();
  const id = editingId;
  editingId = null;

  const m = memos.find((x) => x.id === id);
  if (m && !cancelled && text && text !== m.text) {
    m.text = text;
    save();
  }
  render();
}

// ===== textarea 高度 =====
let metrics = null;

function getMetrics() {
  if (metrics) return metrics;
  const s = getComputedStyle(input);
  const lh = parseFloat(s.lineHeight) || 18;
  const pt = parseFloat(s.paddingTop) || 0;
  const pb = parseFloat(s.paddingBottom) || 0;
  const bt = parseFloat(s.borderTopWidth) || 0;
  const bb = parseFloat(s.borderBottomWidth) || 0;
  const frame = pt + pb + bt + bb;
  metrics = {
    border: bt + bb,
    oneLine: lh + frame,
    twoLines: lh * 2 + frame
  };
  return metrics;
}

function autoResize() {
  const m = getMetrics();
  input.style.height = "auto";
  const needed = input.scrollHeight + m.border;
  const h = Math.min(Math.max(needed, m.oneLine), m.twoLines);
  input.style.height = h + "px";
  input.style.overflowY = needed > m.twoLines ? "auto" : "hidden";
}

input.addEventListener("input", autoResize);

window.addEventListener("resize", () => {
  metrics = null;
  autoResize();
});

input.addEventListener("paste", (e) => {
  const text = (e.clipboardData || window.clipboardData).getData("text");
  if (!/\r?\n/.test(text)) return;
  e.preventDefault();
  const cleaned = text.replace(/\s*\r?\n\s*/g, " ");
  input.setRangeText(cleaned, input.selectionStart, input.selectionEnd, "end");
  autoResize();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addMemo();
  }
});

// ===== 定时提醒 UI =====
recurringToggle.addEventListener("change", () => {
  schedOptions.hidden = !recurringToggle.checked;
});

function updateFreqPickers() {
  const v = schedFreq.value;
  weekdayPicker.hidden = v !== "weekly";
  intervalPicker.hidden = v !== "interval";
  quotaPicker.hidden = v !== "quota";
}
schedFreq.addEventListener("change", updateFreqPickers);
updateFreqPickers();

function getScheduleFromUI() {
  const freq = schedFreq.value;

  if (freq === "daily") return { freq: "daily" };

  if (freq === "weekly") {
    const days = Array.from(weekdayPicker.querySelectorAll("input:checked"))
      .map((el) => Number(el.value));
    if (!days.length) days.push(1);
    return { freq: "weekly", days: days.sort((a, b) => a - b) };
  }

  if (freq === "interval") {
    const n = Math.max(1, Math.min(365, Number(intervalDays.value) || 3));
    return { freq: "interval", interval: n, startDate: getDayStart(Date.now()) };
  }

  if (freq === "quota") {
    const n = Math.max(1, Math.min(7, Number(quotaTimes.value) || 3));
    return { freq: "quota", times: n };
  }

  return { freq: "daily" };
}

function resetScheduleUI() {
  recurringToggle.checked = false;
  schedOptions.hidden = true;
  schedFreq.value = "daily";
  weekdayPicker.querySelectorAll("input").forEach((el) => (el.checked = false));
  intervalDays.value = "3";
  quotaTimes.value = "3";
  updateFreqPickers();
}

function computeNextAppear(schedule) {
  const now = new Date();
  if (!schedule || schedule.freq === "daily") {
    const next = new Date(now);
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + 1);
    return next.getTime();
  }
  let days = (schedule.days || []).slice().sort((a, b) => a - b);
  if (!days.length) days = [1];
  const cur = now.getDay() || 7;
  for (let off = 1; off <= 7; off++) {
    const cand = ((cur - 1 + off) % 7) + 1;
    if (days.includes(cand)) {
      const next = new Date(now);
      next.setHours(0, 0, 0, 0);
      next.setDate(next.getDate() + off);
      return next.getTime();
    }
  }
  return now.getTime() + 7 * DAY_MS;
}

function formatSchedule(schedule) {
  if (!schedule) return "";
  if (schedule.freq === "daily") return "Every day";
  const names = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };
  const days = (schedule.days || []).slice().sort((a, b) => a - b);
  if (!days.length) return "Every week";
  return "Every week on " + days.map((d) => names[d]).join(", ");
}

function formatBadge(m) {
  const s = m.schedule;
  if (!s) return "";
  if (s.freq === "daily") return "Every day";
  if (s.freq === "interval") return `Every ${s.interval || 1} days`;
  if (s.freq === "quota") {
    const n = s.times || 1;
    const done = m.doneCount || 0;
    return done > 0 ? `Every week ${n} times ${done}/${n}` : `Every week ${n} times`;
  }
  return formatSchedule(s);
}

function normalizeRecurring(m, now) {
  if (m.type !== "recurring" || !m.schedule) return false;
  const s = m.schedule;
  let changed = false;

  if (s.freq === "interval") {
    const step = (s.interval || 1) * DAY_MS;

    if (!s.startDate) {
      s.startDate = getDayStart(now);
      changed = true;
    }
    if (!m.nextAppear) {
      m.nextAppear = getDayStart(s.startDate) + step;
      changed = true;
    }
    while (now >= m.nextAppear) {
      if (m.grayed) { m.grayed = false; }
      m.nextAppear += step;
      changed = true;
    }
    return changed;
  }

  if (s.freq === "quota") {
    const times = s.times || 1;
    const curWeek = getWeekStart(now);
    const today = getDayStart(now);

    if (m.weekStart !== curWeek) {
      m.weekStart = curWeek;
      m.doneCount = 0;
      m.lastDoneDate = 0;
      changed = true;
    }

    const shouldGray =
      (m.doneCount || 0) >= times ||
      (m.lastDoneDate === today && (m.doneCount || 0) > 0);

    if (m.grayed !== shouldGray) {
      m.grayed = shouldGray;
      changed = true;
    }
    return changed;
  }

  if (m.grayed && m.nextAppear && now >= m.nextAppear) {
    m.grayed = false;
    m.nextAppear = 0;
    changed = true;
  }
  return changed;
}

function refreshRecurring() {
  const now = Date.now();
  let changed = false;
  for (const m of memos) {
    if (normalizeRecurring(m, now)) changed = true;
  }
  if (changed) {
    regroupMemos();              // 恢复的备忘回到未完成组
    save();
    if (!editingId) render();
  }
}

function load() {
  chrome.storage.sync.get(["memos"], (res) => {
    const raw = res.memos || [];
    let migrated = false;

    memos = raw.map((m) => {
      if (typeof m === "string") {
        migrated = true;
        return { id: genId(), text: m, type: "once", done: false };
      }
      if (!m.id) { m.id = genId(); migrated = true; }
      if (!m.type) { m.type = "once"; migrated = true; }

      if (m.type === "recurring" && typeof m.grayed !== "boolean") {
        m.grayed = !!(m.deleteCount && !m.appeared);
        m.nextAppear = m.nextAppear || 0;
        delete m.deleteCount;
        delete m.appeared;
        migrated = true;
      }
      return m;
    });

    const now = Date.now();
    let refreshed = false;
    for (const m of memos) {
      if (normalizeRecurring(m, now)) refreshed = true;
    }

    regroupMemos();              // 首次加载就按规则整理
    render();
    if (migrated || refreshed) save();
  });
}

function save() {
  chrome.storage.sync.set({ memos }, () => {
    if (chrome.runtime.lastError) {
      console.warn("[SimpleMemo] Failed to save:", chrome.runtime.lastError.message);
    }
  });
}

// ===== 渲染 =====
function render(newId = null) {
  list.innerHTML = "";

  memos.forEach((m, i) => {
    const li = document.createElement("li");
    li.className = "item";
    li.draggable = true;
    li.dataset.index = i;
    li.dataset.id = m.id;

    if (m.id === newId) {
      li.classList.add(i === memos.length - 1 ? "enter-end" : "enter");
    }
    if ((m.type === "recurring" && m.grayed) || (m.type === "once" && m.done)) {
      li.classList.add("grayed");
    }

    li.innerHTML = `
      <span class="handle" title="Drag to reorder">⠿</span>
      <span class="content"></span>
      <button class="complete" title="Complete">✓</button>
      <button class="delete" title="Delete">×</button>
    `;

    const contentEl = li.querySelector(".content");
    if (m.type === "recurring") {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = formatBadge(m);
      contentEl.appendChild(badge);
    }
    contentEl.appendChild(document.createTextNode(m.text));

    contentEl.title = "Double-click to edit";
    contentEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startEdit(m.id, li);
    });

    // ===== 完成 =====
    const completeBtn = li.querySelector(".complete");
    if (m.type === "recurring" && m.grayed) {
      completeBtn.disabled = true;
      completeBtn.title = "Will reset when the schedule renews";
    }
    if (m.type === "once" && m.done) {
      completeBtn.title = "Mark as not done";
    }

    completeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const memo = memos.find((x) => x.id === li.dataset.id);
      if (!memo) return;

      if (memo.type === "recurring") {
        if (memo.grayed) return;

        const s = memo.schedule || {};
        const now = Date.now();

        if (s.freq === "quota") {
          memo.doneCount = (memo.doneCount || 0) + 1;
          memo.lastDoneDate = getDayStart(now);
          memo.grayed = true;
        } else if (s.freq === "interval") {
          memo.grayed = true;
        } else {
          memo.grayed = true;
          memo.nextAppear = computeNextAppear(s);
        }
      } else {
        memo.done = !memo.done;
      }

      regroupMemos();            // 完成后自动沉底 / 取消后回到前面
      save();
      render();
    });

    // ===== 删除 =====
    li.querySelector(".delete").addEventListener("click", (e) => {
      e.stopPropagation();
      if (li.classList.contains("leave")) return;

      li.classList.add("leave");
      let done = false;
      const removeNow = () => {
        if (done) return;
        done = true;
        const id = li.dataset.id;
        const idx = memos.findIndex((x) => x.id === id);
        if (idx !== -1) memos.splice(idx, 1);
        save();
        render();
      };
      li.addEventListener("animationend", removeNow, { once: true });
      setTimeout(removeNow, 400);
    });

    // ===== 拖拽（基于 id） =====
    li.addEventListener("dragstart", () => {
      dragId = li.dataset.id;
      li.classList.add("dragging");
      list.classList.add("reordering");
    });

    li.addEventListener("dragend", () => {
      dragId = null;
      li.classList.remove("dragging");
      list.classList.remove("reordering");
      list.querySelectorAll(".item").forEach((el) => el.classList.remove("drag-over"));
    });

    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (dragId === li.dataset.id) return;
      li.classList.add("drag-over");
    });

    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));

    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("drag-over");

      const targetId = li.dataset.id;
      if (!dragId || dragId === targetId) return;

      const from = memos.findIndex((x) => x.id === dragId);
      const to = memos.findIndex((x) => x.id === targetId);
      if (from === -1 || to === -1) { dragId = null; return; }

      const [moved] = memos.splice(from, 1);
      memos.splice(to, 0, moved);
      dragId = null;

      save();
      render();
      const newEl = list.querySelector(`.item[data-id="${moved.id}"]`);
      if (newEl) {
        newEl.style.transition = "none";
        newEl.style.transform = "scale(.96)";
        requestAnimationFrame(() => {
          newEl.style.transition = "";
          newEl.style.transform = "";
        });
      }
    });

    list.appendChild(li);
  });

  empty.hidden = memos.length > 0;
  count.textContent = memos.length ? `${memos.length} memos` : "";
}

// ===== 添加 =====
function addMemo() {
  const text = input.value.replace(/\s*\r?\n\s*/g, " ").trim();
  if (!text) return;

  const memo = {
    id: genId(),
    text,
    type: recurringToggle.checked ? "recurring" : "once"
  };

  if (memo.type === "recurring") {
    memo.schedule = getScheduleFromUI();
    memo.grayed = false;
    const s = memo.schedule;

    if (s.freq === "quota") {
      memo.doneCount = 0;
      memo.weekStart = getWeekStart(Date.now());
      memo.lastDoneDate = 0;
      memo.nextAppear = 0;
    } else if (s.freq === "interval") {
      memo.nextAppear = getDayStart(s.startDate) + s.interval * DAY_MS;
    } else {
      memo.nextAppear = 0;
    }
  } else {
    memo.done = false;
  }

  memos.push(memo);
  regroupMemos();              // 新备忘肯定在未完成组，无需沉底，但归组一次让后续行为一致
  input.value = "";
  input.focus();
  autoResize();
  resetScheduleUI();
  save();
  render(memo.id);
}

addBtn.addEventListener("click", addMemo);

load();
requestAnimationFrame(autoResize);

setInterval(refreshRecurring, 30000);