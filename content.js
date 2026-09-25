(function () {
  function isContextValid() {
    return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
  }

  document.addEventListener("keydown", (e) => {
    if (!isContextValid()) return;

    if (e.altKey && (e.key === "a" || e.key === "A")) {
      e.preventDefault();

      const text = window.getSelection().toString().trim();
      if (!text) {
        showToast("没有选中任何文字");
        return;
      }

      try {
        chrome.storage.local.get(["memos"], (res) => {
          if (chrome.runtime.lastError) return;
          const memos = res.memos || [];
          memos.unshift(text);
          chrome.storage.local.set({ memos }, () => {
            if (chrome.runtime.lastError) return;
            showToast("已添加备忘 ✓");
            // 不再通知 background 弹出浮窗
          });
        });
      } catch (err) {}
    }
  });

  function showToast(msg) {
    const old = document.getElementById("__memo_toast__");
    if (old) old.remove();

    const t = document.createElement("div");
    t.id = "__memo_toast__";
    t.textContent = msg;
    t.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
      background: #2c3e50; color: #fff; font-size: 13px;
      padding: 10px 16px; border-radius: 8px;
      font-family: "Segoe UI","Microsoft YaHei",sans-serif;
      box-shadow: 0 6px 20px rgba(0,0,0,.2);
      opacity: 0; transform: translateY(8px);
      transition: opacity .2s, transform .2s;
      pointer-events: none;
    `;
    document.body.appendChild(t);

    requestAnimationFrame(() => {
      t.style.opacity = "1";
      t.style.transform = "translateY(0)";
    });

    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(8px)";
      setTimeout(() => t.remove(), 220);
    }, 1600);
  }
})();