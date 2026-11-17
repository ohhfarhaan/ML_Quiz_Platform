(() => {
  "use strict";

  // ---------- data prep ----------
  // Each question gets a stable id "<lab>-<index>". Correct option is index 0 in the source.
  const BANK = [];
  for (const lab of LABS) {
    (QUESTIONS[lab.id] || []).forEach((q, i) => {
      BANK.push({ id: `${lab.id}-${i}`, lab: lab.id, text: q[0], options: q[1], explain: q[2] });
    });
  }
  const labById = Object.fromEntries(LABS.map(l => [l.id, l]));
  const byLab = id => BANK.filter(q => q.lab === id);

  // ---------- storage (per-viewer convenience, safe if unavailable) ----------
  const STORE_KEY = "mlquiz.progress.v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } };
  const save = p => { try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch {} };
  let progress = load(); // { [qid]: { c: correctCount, w: wrongCount, last: bool } }

  const record = (qid, correct) => {
    const p = progress[qid] || { c: 0, w: 0 };
    correct ? p.c++ : p.w++;
    p.last = correct;
    progress[qid] = p;
    save(progress);
  };

  // ---------- helpers ----------
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = s => {
    // ``` fenced code blocks, then `inline code`
    const parts = s.split(/```\n?/);
    return parts.map((p, i) => i % 2
      ? `<pre><code>${esc(p.replace(/\n$/, ""))}</code></pre>`
      : esc(p).replace(/`([^`]+)`/g, "<code>$1</code>")
    ).join("");
  };
  const $app = document.getElementById("app");
  const html = (s) => { $app.innerHTML = s; window.scrollTo(0, 0); };
  const LETTERS = ["A", "B", "C", "D"];

  // Prepare a question instance with shuffled options
  const prep = q => {
    const order = shuffle(q.options.map((_, i) => i));
    return { ...q, order, correctPos: order.indexOf(0), chosen: null };
  };

  // ---------- theme ----------
  const themeBtn = document.getElementById("themeToggle");
  const applyTheme = t => { if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme"); };
  try { applyTheme(localStorage.getItem("mlquiz.theme")); } catch {}
  themeBtn.onclick = () => {
    const cur = document.documentElement.getAttribute("data-theme")
      || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("mlquiz.theme", next); } catch {}
  };
  document.getElementById("homeLink").onclick = e => { e.preventDefault(); goHome(); };

  // ---------- state ----------
  let session = null; // { mode, title, qs, i, endsAt? }
  let timerId = null;
  let keyHandler = null;
  const stopTimer = () => { if (timerId) clearInterval(timerId); timerId = null; };
  // ---------- browser history (back button / swipe-back returns home) ----------
  const inSession = () => history.state && history.state.view === "session";
  const enterSession = () => {
    if (inSession()) history.replaceState({ view: "session" }, "", "#quiz");
    else history.pushState({ view: "session" }, "", "#quiz");
  };
  const goHome = () => { stopTimer(); if (inSession()) history.back(); else home(); };
  window.addEventListener("popstate", () => {
    if (session && session.mode === "mock" && !session.submitted && session.qs.some(q => q.chosen !== null)) {
      if (!confirm("Leave the mock quiz? Your answers will be lost.")) {
        history.pushState({ view: "session" }, "", "#quiz");
        return;
      }
    }
    stopTimer();
    home();
  });
  if (location.hash === "#quiz" || inSession()) history.replaceState(null, "", location.pathname + location.search);

  const setKeys = fn => { if (keyHandler) document.removeEventListener("keydown", keyHandler); keyHandler = fn; if (fn) document.addEventListener("keydown", fn); };

  // ---------- home ----------
  function home() {
    setKeys(null);
    session = null;
    const attempted = BANK.filter(q => progress[q.id]).length;
    const mastered = BANK.filter(q => progress[q.id] && progress[q.id].last).length;
    const mistakes = BANK.filter(q => progress[q.id] && progress[q.id].last === false).length;

    const labCards = LABS.map(l => {
      const qs = byLab(l.id);
      const done = qs.filter(q => progress[q.id] && progress[q.id].last).length;
      const pct = Math.round(100 * done / qs.length);
      return `<button class="lab" data-lab="${l.id}">
        <div class="n">${l.name}</div>
        <div class="m">${qs.length} questions · ${done} correct</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </button>`;
    }).join("");

    html(`
      <h1>ML Lab Quiz — practice every 1-marker</h1>
      <p class="sub">${BANK.length} MCQs across all ${LABS.length} labs, each with an explanation. The questions were written from the lab manuals and notebooks.</p>
      <div class="card">
        <b>Real quiz pattern</b>
        <div class="pattern">
          <span class="pill">20 questions</span><span class="pill">1 mark each</span>
          <span class="pill">30 minutes</span><span class="pill">≤ 2 per lab</span><span class="pill">scaled to 5</span>
        </div>
        <div class="hero-actions">
          <button class="mode primary" id="mock"><span class="t">⏱ Take a mock quiz</span><span class="d">20 Qs, 2 from each lab, 30-min timer, results at the end</span></button>
          <button class="mode" id="rapid"><span class="t">⚡ Rapid practice (all labs)</span><span class="d">Shuffled questions with instant answers and explanations</span></button>
          <button class="mode" id="mist" ${mistakes ? "" : "disabled style='opacity:.5;cursor:not-allowed'"}><span class="t">🔁 Fix my mistakes</span><span class="d">${mistakes ? mistakes + " question" + (mistakes > 1 ? "s" : "") + " you last got wrong" : "Nothing yet. Practise first!"}</span></button>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="v">${attempted}/${BANK.length}</div><div class="l">attempted</div></div>
        <div class="stat"><div class="v">${mastered}</div><div class="l">last answered right</div></div>
        <div class="stat"><div class="v">${mistakes}</div><div class="l">to revisit</div></div>
      </div>
      <a class="card" href="notes.html" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:16px;text-decoration:none;color:var(--text)">
        <span><b>📘 Study notes for all labs</b><br><span class="muted" style="font-size:14px">Short summary of every lab: concepts, formulas, code, traps. PDF download available.</span></span>
        <span class="btn primary" style="flex:none">Read →</span>
      </a>
      <h2>Practise lab by lab</h2>
      <div class="labs">${labCards}</div>
      <p class="kbd">Progress is saved in this browser only. ${attempted ? `<button class="linkbtn" id="reset">Reset progress</button>` : ""}</p>
    `);

    document.getElementById("mock").onclick = startMock;
    document.getElementById("rapid").onclick = () => startPractice("Rapid practice: all labs", shuffle(BANK));
    const mist = document.getElementById("mist");
    if (mistakes) mist.onclick = () => startPractice("Fix my mistakes", shuffle(BANK.filter(q => progress[q.id] && progress[q.id].last === false)));
    $app.querySelectorAll(".lab").forEach(b => b.onclick = () => {
      const l = labById[b.dataset.lab];
      startPractice(l.name, shuffle(byLab(l.id)));
    });
    const reset = document.getElementById("reset");
    if (reset) reset.onclick = () => { if (confirm("Clear all saved progress?")) { progress = {}; save(progress); home(); } };
  }

  // ---------- practice mode ----------
  function startPractice(title, qs) {
    enterSession();
    session = { mode: "practice", title, qs: qs.map(prep), i: 0, correct: 0, answered: 0 };
    renderPractice();
  }

  function renderPractice() {
    const s = session, q = s.qs[s.i], lab = labById[q.lab];
    const answered = q.chosen !== null;
    const opts = q.order.map((oi, pos) => {
      let cls = "opt";
      if (answered) {
        if (pos === q.correctPos) cls += " right";
        else if (pos === q.chosen) cls += " wrong";
      }
      return `<button class="${cls}" data-pos="${pos}" ${answered ? "disabled" : ""}><span class="k">${LETTERS[pos]}</span><span>${fmt(q.options[oi])}</span></button>`;
    }).join("");

    html(`
      <div class="qhead">
        <span class="tag">${lab.short}</span>
        <span class="qmeta">${s.title} · ${s.i + 1}/${s.qs.length} · Score ${s.correct}/${s.answered}</span>
      </div>
      <div class="progress"><i style="width:${100 * (s.i + (answered ? 1 : 0)) / s.qs.length}%"></i></div>
      <div class="card">
        <div class="qtext">${fmt(q.text)}</div>
        <div class="opts">${opts}</div>
        ${answered ? `<div class="explain"><b class="${q.chosen === q.correctPos ? "ok" : "no"}">${q.chosen === q.correctPos ? "✓ Correct" : "✗ Not quite. The answer is " + LETTERS[q.correctPos]}</b>${fmt(q.explain)}</div>` : ""}
      </div>
      <div class="nav">
        <button class="btn" id="quit">← Home</button>
        <div class="row">
          <button class="btn" id="prev" ${s.i === 0 ? "disabled" : ""}>Back</button>
          <button class="btn primary" id="next" ${answered ? "" : "disabled"}>${s.i === s.qs.length - 1 ? "Finish" : "Next →"}</button>
        </div>
      </div>
      <p class="kbd"><kbd>1</kbd>–<kbd>4</kbd> or <kbd>A</kbd>–<kbd>D</kbd> to answer · <kbd>Enter</kbd> next</p>
    `);

    const choose = pos => {
      if (q.chosen !== null) return;
      q.chosen = pos;
      const ok = pos === q.correctPos;
      s.answered++; if (ok) s.correct++;
      record(q.id, ok);
      renderPractice();
    };
    const next = () => { if (q.chosen === null) return; if (s.i < s.qs.length - 1) { s.i++; renderPractice(); } else practiceDone(); };
    $app.querySelectorAll(".opt").forEach(b => b.onclick = () => choose(+b.dataset.pos));
    document.getElementById("next").onclick = next;
    document.getElementById("prev").onclick = () => { s.i--; renderPractice(); };
    document.getElementById("quit").onclick = goHome;
    setKeys(e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const idx = "1234".indexOf(k) >= 0 ? "1234".indexOf(k) : "abcd".indexOf(k);
      if (idx >= 0 && idx < q.options.length) choose(idx);
      else if (k === "enter" || k === "arrowright") next();
      else if (k === "arrowleft" && s.i > 0) { s.i--; renderPractice(); }
    });
  }

  function practiceDone() {
    setKeys(null);
    const s = session;
    const pct = s.answered ? Math.round(100 * s.correct / s.answered) : 0;
    html(`
      <div class="card score">
        <div class="muted">${s.title}</div>
        <div class="big">${s.correct}/${s.answered}</div>
        <div class="scaled">${pct}% correct</div>
        <div class="row" style="justify-content:center;margin-top:18px">
          <button class="btn" id="h">Home</button>
          <button class="btn primary" id="again">Practise again (reshuffled)</button>
        </div>
      </div>
    `);
    document.getElementById("h").onclick = goHome;
    document.getElementById("again").onclick = () => startPractice(s.title, shuffle(s.qs.map(q => BANK.find(b => b.id === q.id))));
  }

  // ---------- mock quiz ----------
  function startMock() {
    // 2 random questions per lab → 20 questions, shuffled order
    let qs = [];
    for (const l of LABS) qs.push(...shuffle(byLab(l.id)).slice(0, 2));
    qs = shuffle(qs).map(prep);
    enterSession();
    session = { mode: "mock", title: "Mock quiz", qs, i: 0, endsAt: Date.now() + 30 * 60 * 1000 };
    stopTimer();
    timerId = setInterval(tick, 1000);
    renderMock();
  }

  function tick() {
    if (!session || session.mode !== "mock") return stopTimer();
    const left = Math.max(0, session.endsAt - Date.now());
    const el = document.getElementById("timer");
    if (el) {
      const m = Math.floor(left / 60000), sec = Math.floor(left / 1000) % 60;
      el.textContent = `${m}:${String(sec).padStart(2, "0")}`;
      el.classList.toggle("low", left < 5 * 60 * 1000);
    }
    if (left <= 0) submitMock(true);
  }

  function renderMock() {
    const s = session, q = s.qs[s.i], lab = labById[q.lab];
    const done = s.qs.filter(x => x.chosen !== null).length;
    const opts = q.order.map((oi, pos) =>
      `<button class="opt ${q.chosen === pos ? "sel" : ""}" data-pos="${pos}"><span class="k">${LETTERS[pos]}</span><span>${fmt(q.options[oi])}</span></button>`
    ).join("");
    const pal = s.qs.map((x, i) => `<button data-i="${i}" class="${x.chosen !== null ? "ans" : ""} ${i === s.i ? "cur" : ""}">${i + 1}</button>`).join("");

    html(`
      <div class="qhead">
        <span class="qmeta">Question ${s.i + 1} of ${s.qs.length} · ${done} answered</span>
        <span class="timer" id="timer">30:00</span>
      </div>
      <div class="progress"><i style="width:${100 * done / s.qs.length}%"></i></div>
      <div class="card">
        <div class="qtext">${fmt(q.text)}</div>
        <div class="opts">${opts}</div>
      </div>
      <div class="nav">
        <button class="btn" id="prev" ${s.i === 0 ? "disabled" : ""}>← Prev</button>
        <div class="row">
          ${s.i < s.qs.length - 1 ? `<button class="btn primary" id="next">Next →</button>` : ""}
          <button class="btn ${s.i === s.qs.length - 1 ? "primary" : ""}" id="submit">Submit</button>
        </div>
      </div>
      <div class="palette">${pal}</div>
      <p class="kbd"><kbd>1</kbd>–<kbd>4</kbd> to answer · <kbd>←</kbd>/<kbd>→</kbd> to move. Answers are revealed after you submit.</p>
    `);
    tick();

    const go = i => { if (i >= 0 && i < s.qs.length) { s.i = i; renderMock(); } };
    $app.querySelectorAll(".opt").forEach(b => b.onclick = () => { q.chosen = +b.dataset.pos; renderMock(); });
    $app.querySelectorAll(".palette button").forEach(b => b.onclick = () => go(+b.dataset.i));
    document.getElementById("prev").onclick = () => go(s.i - 1);
    const nx = document.getElementById("next"); if (nx) nx.onclick = () => go(s.i + 1);
    document.getElementById("submit").onclick = () => {
      const left = s.qs.filter(x => x.chosen === null).length;
      if (left && !confirm(`${left} question${left > 1 ? "s are" : " is"} unanswered. Submit anyway?`)) return;
      submitMock(false);
    };
    setKeys(e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const idx = "1234".indexOf(k) >= 0 ? "1234".indexOf(k) : "abcd".indexOf(k);
      if (idx >= 0 && idx < q.options.length) { q.chosen = idx; renderMock(); }
      else if (k === "arrowright" || k === "enter") go(s.i + 1);
      else if (k === "arrowleft") go(s.i - 1);
    });
  }

  function submitMock(timeUp) {
    stopTimer();
    setKeys(null);
    const s = session;
    if (!s || s.submitted) return;
    s.submitted = true;
    let score = 0;
    const perLab = {};
    for (const q of s.qs) {
      const ok = q.chosen === q.correctPos;
      if (ok) score++;
      if (q.chosen !== null) record(q.id, ok);
      perLab[q.lab] = perLab[q.lab] || [0, 0];
      perLab[q.lab][1]++; if (ok) perLab[q.lab][0]++;
    }
    const scaled = (score / s.qs.length * 5).toFixed(2);
    const rows = LABS.filter(l => perLab[l.id]).map(l => {
      const [c, t] = perLab[l.id];
      return `<div class="brow"><span>${l.short}</span><span class="${c === t ? "ok" : c === 0 ? "no" : ""}">${c}/${t}</span></div>`;
    }).join("");

    const review = s.qs.map((q, n) => {
      const ok = q.chosen === q.correctPos;
      const opts = q.order.map((oi, pos) => {
        let cls = "opt";
        if (pos === q.correctPos) cls += " right"; else if (pos === q.chosen) cls += " wrong";
        return `<button class="${cls}" disabled><span class="k">${LETTERS[pos]}</span><span>${fmt(q.options[oi])}</span></button>`;
      }).join("");
      return `<div class="card review-item" data-ok="${ok}">
        <div class="qhead"><span class="tag">${labById[q.lab].short}</span><span class="${ok ? "ok" : "no"}">Q${n + 1} · ${ok ? "✓ correct" : q.chosen === null ? "— skipped" : "✗ wrong"}</span></div>
        <div class="qtext">${fmt(q.text)}</div>
        <div class="opts">${opts}</div>
        <div class="explain">${fmt(q.explain)}</div>
      </div>`;
    }).join("");

    html(`
      <div class="card score">
        ${timeUp ? `<div class="no">⏰ Time's up!</div>` : ""}
        <div class="muted">Mock quiz result</div>
        <div class="big">${score}/20</div>
        <div class="scaled">Scaled: <b>${scaled} / 5</b></div>
        <div class="breakdown">${rows}</div>
        <div class="row" style="justify-content:center;margin-top:18px">
          <button class="btn" id="h">Home</button>
          <button class="btn primary" id="again">New mock quiz</button>
        </div>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:24px">
        <h2 style="margin:0">Review</h2>
        <label class="muted" style="font-size:14px"><input type="checkbox" id="onlyWrong"> Show only mistakes</label>
      </div>
      ${review}
    `);
    document.getElementById("h").onclick = goHome;
    document.getElementById("again").onclick = startMock;
    document.getElementById("onlyWrong").onchange = e => {
      $app.querySelectorAll(".review-item").forEach(el => { el.style.display = e.target.checked && el.dataset.ok === "true" ? "none" : ""; });
    };
  }

  home();
})();
