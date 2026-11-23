(() => {
  const $ = (selector) => document.querySelector(selector);
  const make = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  const normalize = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const slug = (text) => normalize(text).replace(/\s+/g, "-");
  const clamp = (min, value, max) => Math.min(max, Math.max(min, value));
  const STATES = { s: "Sólido", l: "Líquido", g: "Gasoso", "?": "Desconhecido" };
  const NOBLE = [2, 10, 18, 36, 54, 86, 118];
  const CORES = { He: [2], Ne: [2, 8], Ar: [2, 8, 8], Kr: [2, 8, 18, 8], Xe: [2, 8, 18, 18, 8], Rn: [2, 8, 18, 32, 18, 8] };
  const SHORT = {
    alkali: "Alcalinos", alkaline: "Alcalinoterrosos", transition: "Transição", post: "Pós-transição",
    metalloid: "Metaloides", nonmetal: "Não metais", halogen: "Halogéneos", noble: "Gases nobres",
    lanthanide: "Lantanídeos", actinide: "Actinídeos"
  };
  const RAIL_KEY = "periodica-menu-escondido";

  const categoryOf = (z, group) => {
    if (z >= 57 && z <= 71) return "lanthanide";
    if (z >= 89 && z <= 103) return "actinide";
    if (NOBLE.includes(z)) return "noble";
    if ([9, 17, 35, 53, 85, 117].includes(z)) return "halogen";
    if ([1, 6, 7, 8, 15, 16, 34].includes(z)) return "nonmetal";
    if ([5, 14, 32, 33, 51, 52].includes(z)) return "metalloid";
    if (group === 1) return "alkali";
    if (group === 2) return "alkaline";
    if (group >= 3 && group <= 12) return "transition";
    return "post";
  };

  const position = (z) => {
    if (z >= 57 && z <= 71) return { period: 6, group: 3, col: z - 54, row: 9 };
    if (z >= 89 && z <= 103) return { period: 7, group: 3, col: z - 86, row: 10 };
    if (z === 1) return { period: 1, group: 1, col: 1, row: 1 };
    if (z === 2) return { period: 1, group: 18, col: 18, row: 1 };
    const starts = [[3, 2], [11, 3], [19, 4], [37, 5], [55, 6], [87, 7]];
    const [start, period] = starts.filter(([s]) => z >= s).pop();
    let group = z - start + 1;
    if (period <= 3 && group > 2) group += 10;
    if (period >= 6 && group > 2) group -= 14;
    return { period, group, col: group, row: period };
  };

  const shellsOf = (config) => {
    const core = config.match(/\[(\w+)\]/);
    const shells = core ? [...CORES[core[1]]] : [];
    for (const m of config.matchAll(/(\d)([spdf])(\d+)/g)) {
      const index = Number(m[1]) - 1;
      shells[index] = (shells[index] || 0) + Number(m[3]);
    }
    return Array.from(shells, (count) => count || 0);
  };

  const elements = window.ELEMENT_ROWS.split("\n").map((line, index) => {
    const [symbol, name, mass, config, , stateCode] = line.split("|");
    const z = index + 1;
    const pos = position(z);
    return { z, symbol, name, mass, config, stateCode, ...pos, category: categoryOf(z, pos.group), shells: shellsOf(config) };
  });
  const byZ = new Map(elements.map((el) => [el.z, el]));
  const works = window.WORKS.map((work) => {
    const tally = {};
    work.elements.forEach((z) => { const c = byZ.get(z).category; tally[c] = (tally[c] || 0) + 1; });
    const category = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    const label = /^Grupo/.test(work.scope) ? `${work.theme}, ${work.scope.toLowerCase()}` : work.theme;
    return { ...work, category, label, url: String(window.VIDEOS[work.student] || "").trim() };
  });
  const worksFor = (z) => works.filter((work) => work.elements.includes(z));
  const hasVideo = (el) => worksFor(el.z).some((work) => work.url);
  const isFBlock = (el) => el.row > 7;

  const MODES = {
    family: {
      label: "Família",
      items: Object.keys(SHORT).map((key) => ({ key, label: SHORT[key], color: `var(--${key})` })),
      keyOf: (el) => el.category,
      colorOf: (el) => `var(--${el.category})`
    },
    state: {
      label: "Estado",
      items: [
        { key: "s", label: "Sólido", color: "var(--state-s)" },
        { key: "l", label: "Líquido", color: "var(--state-l)" },
        { key: "g", label: "Gasoso", color: "var(--state-g)" },
        { key: "?", label: "Desconhecido", color: "var(--state-u)" }
      ],
      keyOf: (el) => el.stateCode,
      colorOf: (el) => `var(--state-${el.stateCode === "?" ? "u" : el.stateCode})`
    },
    video: {
      label: "Vídeos",
      items: [
        { key: "yes", label: "Com vídeo", color: "var(--flame)" },
        { key: "no", label: "Por publicar", color: "var(--off)" }
      ],
      keyOf: (el) => (hasVideo(el) ? "yes" : "no"),
      colorOf: (el) => (hasVideo(el) ? "var(--flame)" : "var(--off)")
    }
  };

  const state = { mode: "family", filter: null, axis: null, work: null, element: null, query: "" };
  const cells = new Map();
  const workButtons = new Map();
  const axisButtons = new Map();
  const modeButtons = new Map();
  const rangeCells = new Map();
  let legendButtons = new Map();
  let returnFocus = null;
  let placement = null;
  let toastTimer = 0;
  let inspector = null;

  /* Vídeos */
  function parseVideo(url) {
    if (!url) return null;
    let m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    if (m) return { type: "frame", src: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` };
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/);
    if (m) return { type: "frame", src: `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ""}` };
    m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]+)/);
    if (m) return { type: "frame", src: `https://drive.google.com/file/d/${m[1]}/preview` };
    const safe = /^https?:\/\//i.test(url) || !/^[a-z][a-z0-9+.-]*:/i.test(url);
    if (!safe) return null;
    if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) return { type: "file", src: url };
    return { type: "link", src: url };
  }

  function player(work) {
    const video = parseVideo(work.url);
    const box = make("div", { className: "player" });
    if (!video) {
      box.append(make("p", {}, make("strong", { textContent: "Vídeo por publicar" }), `O trabalho de ${work.student} aparece aqui assim que for adicionado.`));
      return box;
    }
    if (video.type === "frame") {
      const frame = make("iframe", { src: video.src, title: `Vídeo de ${work.student}: ${work.theme}`, allowFullscreen: true, loading: "lazy" });
      frame.allow = "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      box.append(frame);
      return make("div", {}, box, make("a", { className: "open-link", href: work.url, target: "_blank", rel: "noopener", textContent: "Abrir vídeo num separador novo" }));
    }
    if (video.type === "file") {
      box.append(make("video", { src: video.src, controls: true, preload: "metadata" }));
      return box;
    }
    box.append(make("p", {}, make("a", { href: video.src, target: "_blank", rel: "noopener", textContent: "Abrir vídeo num separador novo" })));
    return box;
  }

  /* Construção da tabela */
  function buildModes() {
    Object.entries(MODES).forEach(([key, mode]) => {
      const button = make("button", { type: "button", textContent: mode.label });
      button.onclick = () => setMode(key);
      modeButtons.set(key, button);
      $("#modes").append(button);
    });
  }

  function place(node, col, row) {
    node.style.gridColumn = col;
    node.style.gridRow = row;
  }

  function buildAxis(type, value) {
    const label = type === "group" ? `Grupo ${value}` : `Período ${value}`;
    const button = make("button", { type: "button", className: `axis ${type}`, textContent: value, title: label });
    button.setAttribute("aria-label", `Destacar ${label}`);
    button.onclick = () => {
      const same = state.axis && state.axis.type === type && state.axis.value === value;
      state.axis = same ? null : { type, value };
      paint();
    };
    button.onmouseenter = () => paint({ axis: { type, value } });
    button.onmouseleave = () => paint();
    axisButtons.set(`${type}${value}`, button);
    if (type === "group") place(button, value + 1, 1);
    else place(button, 1, value + 1);
    $("#table").append(button);
  }

  function buildTable() {
    const table = $("#table");
    for (let g = 1; g <= 18; g += 1) buildAxis("group", g);
    for (let p = 1; p <= 7; p += 1) buildAxis("period", p);

    inspector = make("div", { className: "inspector-inner" });
    const shell = make("div", { className: "inspector" }, inspector);
    shell.setAttribute("aria-hidden", "true");
    table.append(shell);

    elements.forEach((el) => {
      const cell = make("button", { type: "button", className: "cell" },
        make("span", { className: "z", textContent: el.z }),
        make("span", { className: "sym", textContent: el.symbol }),
        make("span", { className: "nm", textContent: el.name }));
      if (hasVideo(el)) cell.append(make("span", { className: "dot" }));
      place(cell, el.col + 1, el.row + 1);
      cell.style.setProperty("--col", el.col);
      cell.setAttribute("aria-label", `${el.name}, número atómico ${el.z}${hasVideo(el) ? ", tem vídeo" : ""}`);
      cell.onclick = () => openElement(el, cell);
      cell.onkeydown = (event) => moveFocus(event, el);
      cell.onmouseenter = () => inspect(el);
      cell.onfocus = () => inspect(el);
      cells.set(el.z, cell);
      table.append(cell);
    });

    [["lanthanide", "57–71", 6, "Lantanídeos"], ["actinide", "89–103", 7, "Actinídeos"]].forEach(([key, text, period, label]) => {
      const cell = make("button", { type: "button", className: "cell range" }, make("span", { className: "sym", textContent: text }));
      place(cell, 4, period + 1);
      cell.style.setProperty("--c", `var(--${key})`);
      cell.style.setProperty("--col", 3);
      cell.setAttribute("aria-label", `Filtrar ${label}`);
      cell.onclick = () => {
        if (state.mode !== "family") setMode("family");
        toggleFilter(key);
      };
      rangeCells.set(key, cell);
      table.append(cell);
    });
    const gap = make("div", { className: "gap" });
    gap.style.gridRow = 9;
    table.append(gap);
    table.addEventListener("mouseleave", () => inspect());
  }

  function moveFocus(event, el) {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    let { col, row } = el;
    for (let i = 0; i < 18; i += 1) {
      col += delta[0];
      row += delta[1];
      if (row === 8) row += delta[1];
      const next = elements.find((item) => item.col === col && item.row === row);
      if (next) { cells.get(next.z).focus(); return; }
    }
  }

  function miniMap(work) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 18 9");
    svg.setAttribute("class", "work-map");
    svg.setAttribute("aria-hidden", "true");
    let base = "";
    let lit = "";
    elements.forEach((el) => {
      const y = el.row > 8 ? el.row - 2 : el.row - 1;
      const square = `M${el.col - 1} ${y}h.8v.8h-.8z`;
      if (work.elements.includes(el.z)) lit += square;
      else base += square;
    });
    [["base", base], ["on", lit]].forEach(([name, d]) => {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("class", name);
      path.setAttribute("d", d);
      svg.append(path);
    });
    return svg;
  }

  function buildWorks() {
    const list = $("#work-list");
    works.forEach((work) => {
      const button = make("button", { type: "button", className: "work" },
        miniMap(work),
        make("b", { textContent: work.student }),
        work.url ? make("span", { className: "work-play" }) : make("span"),
        make("small", { textContent: work.label, title: work.label }));
      button.style.setProperty("--c", `var(--${work.category})`);
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", `${work.student}: ${work.theme}, ${work.scope}. ${work.url ? "Vídeo disponível" : "Vídeo por publicar"}`);
      button.onclick = () => (state.work === work ? closePanel() : openWork(work, button));
      button.onmouseenter = () => { inspect(work); paint({ work }); };
      button.onmouseleave = () => { inspect(); paint(); };
      workButtons.set(work, button);
      list.append(make("li", {}, button));
    });
    const published = works.filter((work) => work.url).length;
    $("#progress").textContent = `${published} de ${works.length} vídeos`;
    $("#progress-bar").style.width = `${(published / works.length) * 100}%`;
  }

  /* Vistas e filtros */
  function setMode(key) {
    state.mode = key;
    state.filter = null;
    const mode = MODES[key];
    modeButtons.forEach((button, id) => button.setAttribute("aria-pressed", String(id === key)));
    elements.forEach((el) => {
      const cell = cells.get(el.z);
      cell.style.setProperty("--c", mode.colorOf(el));
    });
    rangeCells.forEach((cell, range) => {
      cell.style.setProperty("--c", key === "family" ? `var(--${range})` : "var(--off)");
    });
    legendButtons = new Map();
    $("#legend").replaceChildren(...mode.items.map((item) => {
      const button = make("button", { type: "button", textContent: item.label });
      button.style.setProperty("--c", item.color);
      button.setAttribute("aria-pressed", "false");
      button.onclick = () => toggleFilter(item.key);
      button.onmouseenter = () => paint({ filter: item.key });
      button.onmouseleave = () => paint();
      legendButtons.set(item.key, button);
      return button;
    }));
    paint();
    inspect();
  }

  function toggleFilter(key) {
    state.filter = state.filter === key ? null : key;
    paint();
  }

  function workMatches(work, query) {
    if (query.length <= 2) return normalize(work.student).startsWith(query);
    return normalize(`${work.student} ${work.theme} ${work.scope}`).includes(query);
  }

  function matchesQuery(el, query) {
    if (!query) return true;
    if (/^\d+$/.test(query)) return el.z === Number(query);
    const symbol = normalize(el.symbol);
    const name = normalize(el.name);
    if (query.length <= 2) return symbol === query || name.startsWith(query);
    return symbol === query || name.includes(query) || worksFor(el.z).some((work) => workMatches(work, query));
  }

  function inAxis(el, axis) {
    if (!axis) return true;
    if (axis.type === "group") return !isFBlock(el) && el.group === axis.value;
    return el.period === axis.value;
  }

  function paint(preview = {}) {
    const work = preview.work || state.work;
    const axis = preview.axis || state.axis;
    const filter = preview.filter || state.filter;
    const keyOf = MODES[state.mode].keyOf;
    const query = normalize(state.query);
    let matches = 0;
    elements.forEach((el) => {
      const cell = cells.get(el.z);
      const inWork = work ? work.elements.includes(el.z) : true;
      const inFilter = filter && keyOf ? keyOf(el) === filter : true;
      const found = matchesQuery(el, query);
      if (found) matches += 1;
      cell.classList.toggle("dim", !(inWork && inFilter && found && inAxis(el, axis)));
      cell.classList.toggle("lit", Boolean(work) && inWork);
      cell.classList.toggle("active", state.element === el);
    });
    const focused = Boolean(work || axis || filter || query);
    rangeCells.forEach((cell, key) => {
      const chosen = state.mode === "family" && filter === key && !work && !axis && !query;
      cell.classList.toggle("dim", focused && !chosen);
    });
    let visibleWorks = 0;
    workButtons.forEach((button, item) => {
      button.setAttribute("aria-pressed", String(state.work === item));
      const show = !query || workMatches(item, query) || item.elements.some((z) => matchesQuery(byZ.get(z), query));
      button.parentElement.hidden = !show;
      if (show) visibleWorks += 1;
    });
    $("#no-work").hidden = visibleWorks > 0;
    legendButtons.forEach((button, key) => button.setAttribute("aria-pressed", String(state.filter === key)));
    axisButtons.forEach((button, key) => {
      button.setAttribute("aria-pressed", String(Boolean(state.axis) && `${state.axis.type}${state.axis.value}` === key));
    });
    $("#search-key").hidden = Boolean(state.query);
    $("#search-count").textContent = query ? `${matches} ${matches === 1 ? "elemento" : "elementos"}` : "";
    if (query && !matches && !state.element && !state.work) renderEmptySearch();
  }

  /* Pré-visualização */
  function inspect(target) {
    const item = target || state.element || state.work;
    if (!item) {
      if (normalize(state.query) && !elements.some((el) => matchesQuery(el, normalize(state.query)))) return renderEmptySearch();
      const published = works.filter((work) => work.url).length;
      inspector.replaceChildren(make("div", { className: "ins-copy" },
        make("p", { className: "ins-title wrap", textContent: "Escolhe um elemento para ver o vídeo" }),
        make("p", { className: "ins-sub", textContent: `${published} de ${works.length} trabalhos publicados` })));
      return;
    }
    if (item.student) {
      const tile = make("div", { className: "ins-tile", textContent: String(item.elements.length) });
      tile.style.setProperty("--c", `var(--${item.category})`);
      inspector.replaceChildren(tile, make("div", { className: "ins-copy" },
        make("p", { className: "ins-title", textContent: item.student }),
        make("p", { className: "ins-sub", textContent: item.label }),
        make("p", { className: "ins-sub", textContent: item.url ? "Vídeo disponível" : "Vídeo por publicar" })));
      return;
    }
    const tile = make("div", { className: "ins-tile" }, make("small", { textContent: item.z }), item.symbol);
    tile.style.setProperty("--c", MODES[state.mode].colorOf(item));
    const related = worksFor(item.z).map((work) => work.student).join(" e ");
    const fact = (label, value) => make("div", {}, make("dt", { textContent: label }), make("dd", {}, value));
    inspector.replaceChildren(tile, make("div", { className: "ins-copy" },
      make("p", { className: "ins-title", textContent: item.name }),
      make("p", { className: "ins-sub", textContent: related ? `Trabalho de ${related}` : window.CATEGORIES[item.category] }),
      make("dl", { className: "ins-facts" },
        fact("Massa", item.mass),
        fact("Configuração", formatConfig(item.config)))));
  }

  function renderEmptySearch() {
    inspector.replaceChildren(make("div", { className: "ins-copy" },
      make("p", { className: "ins-title wrap", textContent: "Nada encontrado" }),
      make("p", { className: "ins-sub", textContent: "Experimenta um símbolo, um número ou o nome de um aluno." })));
  }

  /* Painel */
  function placePanel(next) {
    if (next) placement = next;
    if (!placement || $("#panel").hidden) return;
    const panel = $("#panel");
    const { side, cell } = placement;
    const viewport = document.documentElement.clientWidth;
    panel.classList.toggle("left", side === "left");
    let width = 460;
    let offset = 0;
    if (viewport > 980) {
      if (cell) {
        const rect = cell.getBoundingClientRect();
        width = clamp(380, (side === "left" ? rect.left : viewport - rect.right) - 14, 480);
      } else if (side === "left" && !$("#layout").classList.contains("rail-hidden")) {
        offset = $("#works").getBoundingClientRect().right;
      }
    }
    panel.style.setProperty("--panel-w", `${width}px`);
    panel.style.setProperty("--panel-offset", `${offset}px`);
  }

  function showPanel(content, trigger, where) {
    const panel = $("#panel");
    const wasHidden = panel.hidden;
    if (wasHidden || trigger) returnFocus = trigger || document.activeElement;
    $("#panel-body").replaceChildren(...content);
    panel.hidden = false;
    placePanel(where);
    panel.scrollTop = 0;
    if (wasHidden) $("#close").focus({ preventScroll: true });
  }

  function formatConfig(config) {
    const node = make("span");
    config.split(/([spdf]\d+)/).forEach((part) => {
      const m = part.match(/^([spdf])(\d+)$/);
      if (m) node.append(m[1], make("sup", { textContent: m[2] }));
      else node.append(part);
    });
    return node;
  }

  function fact(label, value, wide) {
    const dd = make("dd");
    dd.append(value);
    return make("div", { className: wide ? "wide" : "" }, make("dt", { textContent: label }), dd);
  }

  function atom(el) {
    const wrap = make("div", { className: "atom" });
    wrap.style.setProperty("--c", `var(--${el.category})`);
    wrap.setAttribute("aria-hidden", "true");
    const count = el.shells.length;
    const step = 46 / count;
    const rings = el.shells.map((electrons, index) => {
      const radius = 11 + step * (index + 1);
      let dots = "";
      for (let i = 0; i < electrons; i += 1) {
        const angle = (i / electrons) * Math.PI * 2;
        dots += `<circle class="electron" cx="${(60 + radius * Math.cos(angle)).toFixed(2)}" cy="${(60 + radius * Math.sin(angle)).toFixed(2)}" r="1.5"/>`;
      }
      return `<circle class="ring" cx="60" cy="60" r="${radius.toFixed(2)}"/><g style="animation-duration:${14 + index * 7}s">${dots}</g>`;
    }).join("");
    wrap.innerHTML = `<svg viewBox="0 0 120 120"><circle class="nucleus" cx="60" cy="60" r="8"/>${rings}</svg>`;
    return wrap;
  }

  function openElement(el, trigger) {
    state.element = el;
    state.work = null;
    setHash(el.symbol);
    const tile = make("div", { className: "tile" }, make("small", { textContent: el.z }), el.symbol);
    tile.style.setProperty("--c", `var(--${el.category})`);
    const facts = make("dl", { className: "facts" },
      fact("Massa atómica", el.mass),
      fact("Estado a 25 °C", STATES[el.stateCode]),
      fact("Grupo", isFBlock(el) ? "Bloco f" : String(el.group)),
      fact("Período", String(el.period)),
      fact("Camadas", el.shells.join(", "), true),
      fact("Configuração eletrónica", formatConfig(el.config), true));
    const content = [make("div", { className: "hero" }, tile,
      make("div", { className: "hero-text" },
        make("h2", { textContent: el.name }),
        make("p", { textContent: window.CATEGORIES[el.category] })),
      atom(el))];
    const related = worksFor(el.z);
    if (related.length) {
      const stage = make("div");
      const tabs = make("div", { className: "tabs", role: "tablist" });
      const select = (work, tab) => {
        tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === tab)));
        stage.replaceChildren(make("p", { className: "work-title", textContent: work.label }), player(work));
      };
      const first = related.find((work) => work.url) || related[0];
      let firstTab = null;
      related.forEach((work) => {
        const tab = make("button", { type: "button", role: "tab", textContent: work.student });
        tab.onclick = () => select(work, tab);
        tabs.append(tab);
        if (work === first) firstTab = tab;
      });
      select(first, firstTab);
      content.push(make("h3", { textContent: related.length > 1 ? "Vídeos da turma" : "Vídeo da turma" }), tabs, stage);
    } else {
      content.push(make("h3", { textContent: "Vídeo da turma" }), make("p", { className: "work-title", textContent: "Este elemento não faz parte de nenhum trabalho." }));
    }
    content.push(make("h3", { textContent: "Propriedades" }), facts);
    showPanel(content, trigger, { side: el.col > 11 ? "left" : "right", cell: cells.get(el.z) });
    paint();
    inspect();
  }

  function openWork(work, trigger) {
    state.work = work;
    state.element = null;
    setHash(slug(work.student));
    const chips = make("div", { className: "chips" });
    [...work.elements].sort((a, b) => a - b).forEach((z) => {
      const el = byZ.get(z);
      const chip = make("button", { type: "button", className: "chip", textContent: el.symbol, title: el.name });
      chip.style.setProperty("--c", `var(--${el.category})`);
      chip.setAttribute("aria-label", el.name);
      chip.onclick = () => openElement(el, cells.get(z));
      chips.append(chip);
    });
    const meanCol = work.elements.reduce((sum, z) => sum + byZ.get(z).col, 0) / work.elements.length;
    showPanel([
      make("div", { className: "hero" }, make("div", { className: "hero-text" },
        make("h2", { textContent: work.student }),
        make("p", { textContent: work.scope === work.label ? work.theme : `${work.theme}, ${work.scope}` }))),
      make("h3", { textContent: "Vídeo" }), player(work),
      make("h3", { textContent: `Elementos (${work.elements.length})` }), chips
    ], trigger, { side: meanCol > 11 ? "left" : "right", cell: null });
    paint();
    inspect();
  }

  function closePanel() {
    $("#panel").hidden = true;
    $("#panel-body").replaceChildren();
    state.work = null;
    state.element = null;
    placement = null;
    setHash("");
    paint();
    inspect();
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }

  function step(delta) {
    if (state.element) {
      const next = elements[(state.element.z - 1 + delta + elements.length) % elements.length];
      openElement(next, cells.get(next.z));
    } else if (state.work) {
      const index = works.indexOf(state.work);
      const next = works[(index + delta + works.length) % works.length];
      openWork(next, workButtons.get(next));
    }
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 2200);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link copiado");
    } catch {
      toast("Não foi possível copiar. Copia o endereço na barra do browser.");
    }
  }

  /* Menu lateral */
  function readRail() {
    try { return localStorage.getItem(RAIL_KEY) === "1"; } catch { return false; }
  }

  function setRail(hidden, save = true) {
    const works_ = $("#works");
    if (hidden && works_.contains(document.activeElement)) $("#rail-toggle").focus();
    $("#layout").classList.toggle("rail-hidden", hidden);
    document.body.classList.toggle("rail-hidden-page", hidden);
    $("#rail-toggle").setAttribute("aria-expanded", String(!hidden));
    $("#rail-label").textContent = hidden ? "Mostrar alunos" : "Esconder alunos";
    $("#rail-toggle").setAttribute("aria-label", `${hidden ? "Mostrar" : "Esconder"} lista de alunos`);
    if (save) {
      try { localStorage.setItem(RAIL_KEY, hidden ? "1" : "0"); } catch { /* preferência opcional */ }
    }
    setTimeout(() => placePanel(), 260);
  }

  /* Links diretos */
  function setHash(value) {
    history.replaceState(null, "", value ? `#${encodeURIComponent(value)}` : location.pathname + location.search);
  }

  function openFromHash() {
    let value = "";
    try { value = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (!value) return;
    const work = works.find((item) => slug(item.student) === normalize(value));
    if (work) { openWork(work, workButtons.get(work)); return; }
    const el = elements.find((item) => item.symbol.toLowerCase() === value.toLowerCase());
    if (el) openElement(el, cells.get(el.z));
  }

  function submitSearch() {
    const query = normalize(state.query);
    if (!query) return;
    const exact = elements.find((el) => String(el.z) === query || normalize(el.symbol) === query);
    if (exact) { openElement(exact, cells.get(exact.z)); return; }
    const work = works.find((item) => normalize(item.student).startsWith(query));
    if (work) { openWork(work, workButtons.get(work)); return; }
    const first = elements.find((el) => matchesQuery(el, query));
    if (first) openElement(first, cells.get(first.z));
  }

  const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);

  buildModes();
  buildTable();
  buildWorks();
  setMode("family");
  setRail(readRail(), false);

  const search = $("#search");
  search.addEventListener("input", () => { state.query = search.value; paint(); inspect(); });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); submitSearch(); }
    if (event.key === "Escape" && search.value) {
      event.stopPropagation();
      search.value = "";
      state.query = "";
      paint();
      inspect();
    }
  });
  $("#rail-toggle").addEventListener("click", () => setRail(!$("#layout").classList.contains("rail-hidden")));
  $("#close").addEventListener("click", closePanel);
  $("#prev").addEventListener("click", () => step(-1));
  $("#next").addEventListener("click", () => step(1));
  $("#copy").addEventListener("click", copyLink);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#panel").hidden) { closePanel(); return; }
    if (typing() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "/") { event.preventDefault(); search.focus(); }
    if (event.key.toLowerCase() === "m") setRail(!$("#layout").classList.contains("rail-hidden"));
    if (!$("#panel").hidden && !event.target.closest?.(".cell")) {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    }
  });
  window.addEventListener("resize", () => placePanel());
  window.addEventListener("hashchange", openFromHash);
  paint();
  openFromHash();
})();
