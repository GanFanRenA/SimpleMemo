const input = document.getElementById("input");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("list");
const empty = document.getElementById("empty");
const count = document.getElementById("count");

const recurringToggle = document.getElementById("recurringToggle");
const schedOptions = document.getElementById("schedOptions");
const schedFreq = document.getElementById("schedFreq");
const weekdayPicker = document.getElementById("weekdayPicker");

let memos = [];
let dragIndex = -1;
let idCounter = 1;

function genId() {
  return Date.now().toString(36) + "-" + (idCounter++).toString(36);
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

// 粘贴内容里的换行统一替换为空格，避免出现多行
input.addEventListener("paste", (e) => {
  const text = (e.clipboardData || window.clipboardData).getData("text");
  if (!/\r?\n/.test(text)) return;
  e.preventDefault();
  const cleaned = text.replace(/\s*\r?\n\s*/g, " ");
  input.setRangeText(cleaned, input.selectionStart, input.selectionEnd, "end");
  autoResize();
});

// Enter 添加备忘；不支持多行输入
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

schedFreq.addEventListener("change", () => {
  weekdayPicker.hidden = schedFreq.value !== "weekly";
});

function getScheduleFromUI() {
  if (schedFreq.value === "daily") return { freq: "daily" };
  const days = Array.from(weekdayPicker.querySelectorAll("input:checked"))
    .map((el) => Number(el.value));
  if (!days.length) days.push(1); // 没选就默认周一
  return { freq: "weekly", days: days.sort((a, b) => a - b) };
}

function resetScheduleUI() {
  recurringToggle.checked = false;
  schedOptions.hidden = true;
  weekdayPicker.hidden = true;
  schedFreq.value = "daily";
  weekdayPicker.querySelectorAll("input").forEach((el) => (el.checked = false));
}

// ===== 下次恢复时间 =====
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
  const cur = now.getDay() || 7; // 周日 → 7
  for (let off = 1; off <= 7; off++) {
    const cand = ((cur - 1 + off) % 7) + 1;
    if (days.includes(cand)) {
      const next = new Date(now);
      next.setHours(0, 0, 0, 0);
      next.setDate(next.getDate() + off);
      return next.getTime();
    }
  }
  return now.getTime() + 7 * 24 * 3600 * 1000;
}

function formatSchedule(schedule) {
  if (!schedule) return "";
  if (schedule.freq === "daily") return "每天";
  const names = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "日" };
  const days = (schedule.days || []).slice().sort((a, b) => a - b);
  if (!days.length) return "每周";
  return "每周" + days.map((d) => names[d]).join("");
}

// ===== 定时备忘恢复颜色 =====
function refreshRecurring() {
  const now = Date.now();
  let changed = false;
  for (const m of memos) {
    if (m.type === "recurring" && m.grayed && now >= m.nextAppear) {
      m.grayed = false;
      m.nextAppear = 0;
      changed = true;
    }
  }
  if (changed) {
    save();
    render();
  }
}

// ===== 数据读写 =====
function load() {
  chrome.storage.local.get(["memos"], (res) => {
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
        // 兼容上一版的 deleteCount / appeared 字段
        m.grayed = !!(m.deleteCount && !m.appeared);
        m.nextAppear = m.nextAppear || 0;
        delete m.deleteCount;
        delete m.appeared;
        migrated = true;
      }
      return m;
    });

    // 打开时检查是否有到时间的定时备忘
    const now = Date.now();
    let refreshed = false;
    for (const m of memos) {
      if (m.type === "recurring" && m.grayed && now >= m.nextAppear) {
        m.grayed = false;
        m.nextAppear = 0;
        refreshed = true;
      }
    }

    render();
    if (migrated || refreshed) save();
  });
}

function save() {
  chrome.storage.local.set({ memos });
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
      <span class="handle" title="拖动排序">⠿</span>
      <span class="content"></span>
      <button class="delete" title="删除">×</button>
    `;

    const contentEl = li.querySelector(".content");
    if (m.type === "recurring") {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = formatSchedule(m.schedule);
      contentEl.appendChild(badge);
    }
    contentEl.appendChild(document.createTextNode(m.text));

    // ===== 删除 =====
    li.querySelector(".delete").addEventListener("click", (e) => {
      e.stopPropagation();
      if (li.classList.contains("leave")) return;

      const idx = Number(li.dataset.index);
      const memo = memos[idx];

      // 定时备忘、且尚未变灰：变灰 + 移到末尾（保留内容）
      if (memo.type === "recurring" && !memo.grayed) {
        memo.grayed = true;
        memo.nextAppear = computeNextAppear(memo.schedule);
        save();

        li.classList.add("grayed");   // 触发 CSS transition 变灰
        li.style.pointerEvents = "none";

        setTimeout(() => {
          const cur = memos.findIndex((x) => x.id === memo.id);
          if (cur === -1) return;
          const [m] = memos.splice(cur, 1);
          memos.push(m);
          save();
          render();
        }, 300);
        return;
      }

      // 普通备忘，或灰色定时备忘再删：彻底删除
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
      setTimeout(removeNow, 400);   // 动画未触发时的兜底
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
  count.textContent = memos.length ? `${memos.length} 条` : "";
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
    memo.nextAppear = 0;
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

// 每 30 秒检查一次是否有定时备忘应恢复颜色
setInterval(refreshRecurring, 30000);