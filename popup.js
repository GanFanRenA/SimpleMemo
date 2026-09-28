const input = document.getElementById("input");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("list");
const empty = document.getElementById("empty");
const count = document.getElementById("count");

let memos = [];
let dragIndex = -1;

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

    // 新增的那条加上入场动画
    if (i === newIndex) li.classList.add("enter");

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

      li.addEventListener("animationend", () => {
        const idx = Number(li.dataset.index);
        memos.splice(idx, 1);
        save();
        render();
      }, { once: true });
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
  const text = input.value.trim();
  if (!text) return;

  memos.unshift(text);
  input.value = "";
  input.focus();
  save();

  // 新条目索引为 0，播放入场动画
  render(0);
}

addBtn.addEventListener("click", addMemo);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addMemo();
});

load();