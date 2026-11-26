(function () {
  "use strict";
  const DATA = window.NEWS_DATA || { items: [], updated: "" };
  const ITEMS = DATA.items.map(a => ({ ...a, t: new Date(a.published).getTime() }));
  const PAGE = 30;
  const CAT_CLASS = {
    "사고·재해": "b-accident", "화재·폭발·화학": "b-chem", "법령·정책": "b-law",
    "산업보건": "b-health", "예방·교육": "b-edu", "건설안전": "b-const", "일반": "b-gen"
  };
  const CAT_ORDER = ["사고·재해", "화재·폭발·화학", "법령·정책", "산업보건", "예방·교육", "건설안전", "일반"];
  const STOP = new Set(["안전", "관련", "사고", "대한", "위한", "통해", "이번", "있는", "에서", "하는", "으로", "것으로", "오늘", "이후", "지난", "진행", "실시", "개최", "발생"]);

  const $ = id => document.getElementById(id);
  const state = { cat: "", q: "", days: 7, source: "", saved: false, shown: PAGE };

  // 저장(즐겨찾기) — localStorage 가 막혀 있어도 동작하도록 try/catch
  let saved = new Set();
  try { saved = new Set(JSON.parse(localStorage.getItem("ehs-saved") || "[]")); } catch (e) {}
  const persist = () => { try { localStorage.setItem("ehs-saved", JSON.stringify([...saved])); } catch (e) {} };

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function ago(t) {
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return "방금 전";
    if (m < 60) return m + "분 전";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "시간 전";
    const d = Math.floor(h / 24);
    return d < 8 ? d + "일 전" : new Date(t).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  }
  function inPeriod(a) {
    if (state.days >= 60) return true;
    if (state.days === 1) {
      const n = new Date(), s = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
      return a.t >= s;
    }
    return a.t >= Date.now() - state.days * 86400000;
  }
  function filtered(ignoreCat) {
    const q = state.q.trim().toLowerCase();
    return ITEMS.filter(a =>
      inPeriod(a) &&
      (ignoreCat || !state.cat || a.category === state.cat) &&
      (!state.source || a.source === state.source) &&
      (!state.saved || saved.has(a.link)) &&
      (!q || (a.title + " " + a.source).toLowerCase().includes(q)));
  }

  function renderStats() {
    const day = ITEMS.filter(a => a.t >= Date.now() - 86400000);
    const week = ITEMS.filter(a => a.t >= Date.now() - 7 * 86400000);
    const acc = week.filter(a => a.category === "사고·재해").length;
    const law = week.filter(a => a.category === "법령·정책").length;
    $("stats").innerHTML = [
      ["최근 24시간 기사", day.length, ""], ["최근 7일 기사", week.length, ""],
      ["7일간 사고·재해", acc, "hot"], ["7일간 법령·정책", law, ""]
    ].map(([l, n, c]) => `<div class="stat ${c}"><b>${n}</b><span>${l}</span></div>`).join("");
    if (DATA.updated) {
      const d = new Date(DATA.updated);
      $("updated").textContent = "마지막 수집 " + d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
  }

  function renderChips() {
    const base = filtered(true);
    const cnt = {}; base.forEach(a => cnt[a.category] = (cnt[a.category] || 0) + 1);
    const chips = [["", "전체", base.length], ...CAT_ORDER.filter(c => cnt[c]).map(c => [c, c, cnt[c]])];
    $("chips").innerHTML = chips.map(([v, l, n]) =>
      `<button class="chip" data-cat="${esc(v)}" aria-pressed="${state.cat === v}">${esc(l)}<small>${n}</small></button>`).join("");
  }

  function renderList() {
    const rows = filtered(false);
    $("resultCount").textContent = `기사 ${rows.length}건`;
    const view = rows.slice(0, state.shown);
    $("list").innerHTML = view.map(a => {
      const isNew = Date.now() - a.t < 6 * 3600000;
      const on = saved.has(a.link);
      return `<li class="item">
        <a class="t" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a>
        <button class="star" data-link="${esc(a.link)}" aria-pressed="${on}" aria-label="${on ? "저장 해제" : "저장"}">${on ? "★" : "☆"}</button>
        <div class="meta"><span class="badge ${CAT_CLASS[a.category] || "b-gen"}">${esc(a.category)}</span>
          <span>${esc(a.source)}</span><span>· ${ago(a.t)}</span>${isNew ? '<span class="new">NEW</span>' : ""}</div>
      </li>`;
    }).join("");
    $("empty").hidden = rows.length > 0;
    $("more").hidden = rows.length <= state.shown;
  }

  function renderSide() {
    const rows = filtered(true);
    // 키워드: 제목에서 2자 이상 한글/영문 단어 빈도
    const f = {};
    rows.forEach(a => {
      new Set((a.title.match(/[가-힣A-Za-z]{2,}/g) || [])).forEach(w => {
        w = w.replace(/(은|는|이|가|을|를|의|에|도|로|과|와|에서|으로|까지|부터)$/, "");
        if (w.length < 2 || STOP.has(w)) return;
        f[w] = (f[w] || 0) + 1;
      });
    });
    const top = Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 18);
    $("kw").innerHTML = top.map(([w, n]) => `<button data-kw="${esc(w)}">${esc(w)} ${n}</button>`).join("");
    const s = {}; rows.forEach(a => s[a.source] = (s[a.source] || 0) + 1);
    $("srcRank").innerHTML = Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, n]) => `<li data-src="${esc(k)}">${esc(k)}<span>${n}</span></li>`).join("");
  }

  function renderAll() { renderChips(); renderList(); renderSide(); }

  function init() {
    const sources = [...new Set(ITEMS.map(a => a.source))].sort((a, b) => a.localeCompare(b, "ko"));
    $("source").insertAdjacentHTML("beforeend", sources.map(s => `<option>${esc(s)}</option>`).join(""));
    renderStats(); renderAll();

    $("q").addEventListener("input", e => { state.q = e.target.value; state.shown = PAGE; renderAll(); });
    $("period").addEventListener("change", e => { state.days = +e.target.value; state.shown = PAGE; renderAll(); });
    $("source").addEventListener("change", e => { state.source = e.target.value; state.shown = PAGE; renderAll(); });
    $("onlySaved").addEventListener("click", e => {
      state.saved = !state.saved; e.currentTarget.setAttribute("aria-pressed", state.saved);
      state.shown = PAGE; renderAll();
    });
    $("chips").addEventListener("click", e => {
      const b = e.target.closest("[data-cat]"); if (!b) return;
      state.cat = b.dataset.cat; state.shown = PAGE; renderAll();
    });
    $("more").addEventListener("click", () => { state.shown += PAGE; renderList(); });
    $("list").addEventListener("click", e => {
      const b = e.target.closest(".star"); if (!b) return;
      const l = b.dataset.link;
      saved.has(l) ? saved.delete(l) : saved.add(l);
      persist(); renderList();
    });
    $("kw").addEventListener("click", e => {
      const b = e.target.closest("[data-kw]"); if (!b) return;
      $("q").value = state.q = b.dataset.kw; state.shown = PAGE; renderAll(); window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("srcRank").addEventListener("click", e => {
      const li = e.target.closest("[data-src]"); if (!li) return;
      $("source").value = state.source = li.dataset.src; state.shown = PAGE; renderAll();
    });
    $("themeBtn").addEventListener("click", () => {
      const r = document.documentElement;
      const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      r.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem("ehs-theme", r.dataset.theme); } catch (e) {}
    });
    try { const t = localStorage.getItem("ehs-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  }
  init();
})();
