const input = document.getElementById("input");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("list");
const empty = document.getElementById("empty");
const count = document.getElementById("count");

let memos = [];
let dragIndex = -1;

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
  input.style.height = "auto";                  // 先复位，才能量到真实内容高度
  const needed = input.scrollHeight + m.border; // scrollHeight 不含 border
  const h = Math.min(Math.max(needed, m.oneLine), m.twoLines);
  input.style.height = h + "px";
  input.style.overflowY = needed > m.twoLines ? "auto" : "hidden";
}

input.addEventListener("input", autoResize);

window.addEventListener("resize", () => {
  metrics = null;   // 布局变化时重新测量
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

function load() {
  chrome.storage.local.get(["memos"], (res) => {
    memos = res.memos || [];
    render();
  });
}

function save() {
  chrome.storage.local.set({ memos });
}

function render(newIndex = -1) {
  list.innerHTML = "";

  memos.forEach((text, i) => {
    const li = document.createElement("li");
    li.className = "item";
    li.draggable = true;
    li.dataset.index = i;

    // 新增的那条加上入场动画：末尾用从下往上，其余用从上往下
    if (i === newIndex) {
      li.classList.add(newIndex === memos.length - 1 ? "enter-end" : "enter");
    }

    li.innerHTML = `
      <span class="handle" title="拖动排序">⠿</span>
      <span class="content"></span>
      <button class="delete" title="删除">×</button>
    `;

    li.querySelector(".content").textContent = text;

    // ===== 删除：先播放离场动画，再删数据 =====
    li.querySelector(".delete").addEventListener("click", (e) => {
      e.stopPropagation();
      if (li.classList.contains("leave")) return;

      li.classList.add("leave");

      let done = false;
      const removeNow = () => {
        if (done) return;
        done = true;
        const idx = Number(li.dataset.index);
        memos.splice(idx, 1);
        save();
        render();
      };

      li.addEventListener("animationend", removeNow, { once: true });
      setTimeout(removeNow, 400);   // 动画未触发时的兜底
    });

    // ===== 拖拽 =====
    li.addEventListener("dragstart", () => {
      dragIndex = i;
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
      if (dragIndex === i) return;
      li.classList.add("drag-over");
    });

    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));

    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("drag-over");
      if (dragIndex === -1 || dragIndex === i) return;

      const target = i;
      const moved = memos.splice(dragIndex, 1)[0];
      memos.splice(target, 0, moved);
      dragIndex = -1;
      save();

      // 重绘并让被移动的条目有个落位动画
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

function addMemo() {
  const text = input.value.replace(/\s*\r?\n\s*/g, " ").trim();
  if (!text) return;

  memos.push(text);           // 追加到队列末尾
  input.value = "";
  input.focus();
  autoResize();
  save();

  // 新条目索引为最后一个，播放入场动画
  render(memos.length - 1);
}

addBtn.addEventListener("click", addMemo);

load();
requestAnimationFrame(autoResize);