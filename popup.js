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
let dragIndex = -1;
let idCounter = 1;

function genId() {
  return Date.now().toString(36) + "-" + (idCounter++).toString(36);
}

// 当天 00:00
function getDayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 当周周一 00:00（周日算作上一周的末尾）
function getWeekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;        // 周日 → 7
  d.setDate(d.getDate() - (day - 1)); // 回退到周一
  return d.getTime();
}

// ===== textarea 高度：默认一行，最多两行 =====
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

// ===== 下次恢复时间（仅 daily / weekly 需要） =====
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

// ===== 归一化：计算灰化状态、推进下次恢复时间 =====
// 返回 true 表示数据被修改，需要持久化
function normalizeRecurring(m, now) {
  if (m.type !== "recurring" || !m.schedule) return false;
  const s = m.schedule;
  let changed = false;

  // ---- 每 N 天 ----
  if (s.freq === "interval") {
    const step = (s.interval || 1) * DAY_MS;

    if (!s.startDate) {
      s.startDate = getDayStart(now);
      changed = true;
    }
    if (!m.nextAppear) {
      // 第一次恢复 = 开始日 + N 天
      m.nextAppear = getDayStart(s.startDate) + step;
      changed = true;
    }
    // 跨过多个周期也能正确恢复
    while (now >= m.nextAppear) {
      if (m.grayed) { m.grayed = false; }
      m.nextAppear += step;
      changed = true;
    }
    return changed;
  }

  // ---- 每周 N 次 ----
  if (s.freq === "quota") {
    const times = s.times || 1;
    const curWeek = getWeekStart(now);
    const today = getDayStart(now);

    // 新的一周：重置次数
    if (m.weekStart !== curWeek) {
      m.weekStart = curWeek;
      m.doneCount = 0;
      m.lastDoneDate = 0;
      changed = true;
    }

    // 灰化条件：达到周上限  或  今天已完成
    const shouldGray =
      (m.doneCount || 0) >= times ||
      (m.lastDoneDate === today && (m.doneCount || 0) > 0);

    if (m.grayed !== shouldGray) {
      m.grayed = shouldGray;
      changed = true;
    }
    return changed;
  }

  // ---- 每天 / 每周固定日 ----
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
    save();
    render();
  }
}

// ===== 数据读写 =====
function load() {
  chrome.storage.sync.get(["memos"], (res) => {
    const raw = res.memos || [];
    let migrated = false;

    memos = raw.map((m) => {
      if (typeof m === "string") {
        migrated = true;
        return { id: genId(), text: m, type: "once" };
      }
      if (!m.id) { m.id = genId(); migrated = true; }
      if (!m.type) { m.type = "once"; migrated = true; }

      if (m.type === "recurring" && typeof m.grayed !== "boolean") {
        // 兼容更早版本的 deleteCount / appeared 字段
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
    if (m.type === "recurring" && m.grayed) {
      li.classList.add("grayed");
    }

    li.innerHTML = `
      <span class="handle" title="Drag to reorder">⠿</span>
      <span class="content"></span>
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

    // ===== 删除 / 完成 =====
    li.querySelector(".delete").addEventListener("click", (e) => {
      e.stopPropagation();
      if (li.classList.contains("leave")) return;

      const idx = Number(li.dataset.index);
      const memo = memos[idx];

      // 定时备忘、未灰化：完成（消耗次数 / 标记灰化）
      if (memo.type === "recurring" && !memo.grayed) {
        const s = memo.schedule || {};
        const now = Date.now();

        if (s.freq === "quota") {
          memo.doneCount = (memo.doneCount || 0) + 1;
          memo.lastDoneDate = getDayStart(now);
          memo.grayed = true;           // 今天已完成
        } else if (s.freq === "interval") {
          memo.grayed = true;           // 仅视觉标记，nextAppear 不变
        } else {
          memo.grayed = true;
          memo.nextAppear = computeNextAppear(s);
        }
        save();

        li.classList.add("grayed");
        li.style.pointerEvents = "none";

        setTimeout(() => {
          const cur = memos.findIndex((x) => x.id === memo.id);
          if (cur === -1) return;
          const [mm] = memos.splice(cur, 1);
          memos.push(mm);
          save();
          render();
        }, 300);
        return;
      }

      // 普通备忘 / 已灰化的定时备忘：彻底删除
      li.classList.add("leave");
      let done = false;
      const removeNow = () => {
        if (done) return;
        done = true;
        const i2 = Number(li.dataset.index);
        memos.splice(i2, 1);
        save();
        render();
      };
      li.addEventListener("animationend", removeNow, { once: true });
      setTimeout(removeNow, 400);
    });

    // ===== 拖拽 =====
    li.addEventListener("dragstart", () => {
      dragIndex = Number(li.dataset.index);
      li.classList.add("dragging");
      list.classList.add("reordering");
    });

    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      list.classList.remove("reordering");
      list.querySelectorAll(".item").forEach((el) => el.classList.remove("drag-over"));
    });

    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      const idx = Number(li.dataset.index);
      if (dragIndex === idx) return;
      li.classList.add("drag-over");
    });

    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));

    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("drag-over");
      const target = Number(li.dataset.index);
      if (dragIndex === -1 || dragIndex === target) return;

      const moved = memos.splice(dragIndex, 1)[0];
      memos.splice(target, 0, moved);
      dragIndex = -1;
      save();

      render();
      const newEl = list.querySelector(`.item[data-index="${target}"]`);
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
      // 第一次恢复 = 开始日 + N 天
      memo.nextAppear = getDayStart(s.startDate) + s.interval * DAY_MS;
    } else {
      memo.nextAppear = 0;
    }
  }

  memos.push(memo);
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

// 每 30 秒检查一次
setInterval(refreshRecurring, 30000);