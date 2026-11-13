/* Panel de la agencia — SPA sin build.
 * Depende de window.supabase (UMD por CDN) y de config.js.
 * Toda la seguridad vive en RLS: aquí solo se usa la anon key pública.
 */
(function () {
  "use strict";

  const cfg = window.PANEL_CONFIG || {};
  const SUPABASE_URL = cfg.SUPABASE_URL;
  const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY;
  // Orquestador local (npm run orquestador). Se puede cambiar en config.js.
  const ORQUESTADOR_URL = cfg.ORQUESTADOR_URL || "http://127.0.0.1:8787";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  }

  function safeUrl(value) {
    if (!value) return "";
    try {
      const u = new URL(String(value), window.location.href);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch (err) { /* URL inválida */ }
    return "";
  }

  function norm(value) {
    return String(value === null || value === undefined ? "" : value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function fmtDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
  }

  function fmtDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) + " · " +
      d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }

  function fmtMoney(value) {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat("es-CL", {
      style: "currency", currency: "CLP", maximumFractionDigits: 0
    }).format(n);
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "–";
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  /* ------------------------------------------------------------------ */
  /* Catálogos                                                           */
  /* ------------------------------------------------------------------ */

  const LEAD_ESTADOS = [
    "nuevo", "calificado", "calificado_sin_email", "borrador", "aprobado",
    "enviado", "respondio", "reunion", "propuesta", "ganado", "perdido", "descartado"
  ];
  const LEAD_LABEL = {
    nuevo: "Nuevo", calificado: "Calificado", calificado_sin_email: "Calificado sin email",
    borrador: "Borrador", aprobado: "Aprobado", enviado: "Enviado", respondio: "Respondió",
    reunion: "Reunión", propuesta: "Propuesta", ganado: "Ganado", perdido: "Perdido",
    descartado: "Descartado"
  };
  const LEAD_TONE = {
    nuevo: "plain", calificado: "info", calificado_sin_email: "warn", borrador: "warn",
    aprobado: "ok", enviado: "info", respondio: "plum", reunion: "plum",
    propuesta: "plum", ganado: "ok", perdido: "danger", descartado: "plain"
  };

  const CLIENTE_ESTADOS = ["prospecto", "activo", "pausado", "cerrado", "perdido"];
  const CLIENTE_LABEL = {
    prospecto: "Prospecto", activo: "Activo", pausado: "Pausado",
    cerrado: "Cerrado", perdido: "Perdido"
  };
  const CLIENTE_TONE = {
    prospecto: "info", activo: "ok", pausado: "warn", cerrado: "plain", perdido: "danger"
  };

  const PROYECTO_ESTADOS = ["idea", "en_progreso", "revision", "entregado", "pausado", "cancelado"];
  const PROYECTO_LABEL = {
    idea: "Idea", en_progreso: "En progreso", revision: "En revisión",
    entregado: "Entregado", pausado: "Pausado", cancelado: "Cancelado"
  };
  const PROYECTO_TONE = {
    idea: "plain", en_progreso: "info", revision: "warn",
    entregado: "ok", pausado: "warn", cancelado: "danger"
  };

  const ROL_LABEL = { admin: "Administrador", socio: "Socio", operador: "Operador" };

  const VIEWS = {
    resumen: { title: "Resumen", eyebrow: "Vista general", render: renderResumen },
    leads: { title: "Leads", eyebrow: "Captación", render: renderLeads },
    clientes: { title: "Clientes", eyebrow: "Cartera", render: renderClientes },
    proyectos: { title: "Proyectos", eyebrow: "Operación", render: renderProyectos },
    equipo: { title: "Equipo", eyebrow: "Accesos", render: renderEquipo }
  };

  /* ------------------------------------------------------------------ */
  /* Estado                                                              */
  /* ------------------------------------------------------------------ */

  const state = {
    perfil: null,
    leads: [],
    interacciones: [],
    clientes: [],
    proyectos: [],
    perfiles: [],
    view: "resumen",
    filtros: { q: "", estado: "", score: "0", sort: "reciente" },
    leadLimit: 60,
    loading: false
  };

  const modalRoot = $("#modal-root");
  const toastEl = $("#toast");
  let toastTimer = null;

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  function setLoading(on) {
    state.loading = on;
    const bar = $("#loading-bar");
    if (bar) bar.hidden = !on;
  }

  function toast(message, isError) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.toggle("toast--error", !!isError);
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4200);
  }

  function showAppError(message) {
    const el = $("#app-error");
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  function errMsg(error) {
    if (!error) return "Ocurrió un error inesperado.";
    if (typeof error === "string") return error;
    return error.message || error.error_description || "Ocurrió un error inesperado.";
  }

  /* ------------------------------------------------------------------ */
  /* Sesión                                                              */
  /* ------------------------------------------------------------------ */

  function showLogin(message) {
    $("#app-view").hidden = true;
    $("#login-view").hidden = false;
    const err = $("#login-error");
    if (err) {
      err.textContent = message || "";
      err.hidden = !message;
    }
    const submit = $("#login-submit");
    if (submit) {
      submit.disabled = false;
      submit.textContent = "Entrar al panel";
    }
    const email = $("#login-email");
    if (email) setTimeout(() => email.focus(), 50);
  }

  async function enterApp(session) {
    const { data: perfil, error } = await db
      .from("perfiles")
      .select("user_id,nombre,rol,activo")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error || !perfil || !perfil.activo) {
      await db.auth.signOut();
      showLogin("Tu usuario no tiene un perfil activo en el panel. Pídele acceso a un administrador.");
      return;
    }

    state.perfil = perfil;
    $("#login-view").hidden = true;
    $("#app-view").hidden = false;
    $("#user-name").textContent = perfil.nombre;
    $("#user-role").textContent = ROL_LABEL[perfil.rol] || perfil.rol;
    $("#user-avatar").textContent = initials(perfil.nombre);
    $("#sidebar-user").textContent = perfil.nombre;

    switchView(state.view || "resumen");
    await loadAll();
  }

  async function boot() {
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      showLogin("No se pudo cargar la configuración del panel. Revisa config.js.");
      return;
    }
    const centro = $("#btn-centro-control");
    if (centro) centro.href = ORQUESTADOR_URL + "/";
    const { data } = await db.auth.getSession();
    if (data && data.session) {
      await enterApp(data.session);
    } else {
      showLogin();
    }
    db.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") showLogin();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Carga de datos                                                      */
  /* ------------------------------------------------------------------ */

  async function loadAll() {
    setLoading(true);
    showAppError("");
    try {
      const [leads, interacciones, clientes, proyectos, perfiles] = await Promise.all([
        db.from("leads")
          .select("id,negocio,rubro,comuna,direccion,telefono,email,instagram,sitio_web,score,estado,oferta_sugerida,owner,notas,demo_url,ultimo_contacto,created_at,updated_at")
          .order("created_at", { ascending: false }).limit(1000),
        db.from("interacciones")
          .select("id,lead_id,ronda,canal,asunto,resumen,cuerpo,estado,aprobado_por,enviado_at,created_at")
          .order("created_at", { ascending: false }).limit(800),
        db.from("clientes").select("*").order("updated_at", { ascending: false }),
        db.from("proyectos").select("*").order("created_at", { ascending: false }),
        db.from("perfiles").select("user_id,nombre,rol,activo,created_at").order("nombre")
      ]);

      const failure = [leads, interacciones, clientes, proyectos, perfiles].find((r) => r.error);
      if (failure) throw failure.error;

      state.leads = leads.data || [];
      state.interacciones = interacciones.data || [];
      state.clientes = clientes.data || [];
      state.proyectos = proyectos.data || [];
      state.perfiles = perfiles.data || [];

      updateBadges();
      renderView();
    } catch (error) {
      showAppError("No se pudieron cargar los datos: " + errMsg(error));
    } finally {
      setLoading(false);
    }
  }

  function updateBadges() {
    const pendientes = state.interacciones.filter((i) => i.estado === "borrador").length;
    const badge = $("#nav-leads-badge");
    if (badge) {
      badge.textContent = String(pendientes);
      badge.hidden = pendientes === 0;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Navegación                                                          */
  /* ------------------------------------------------------------------ */

  function switchView(name) {
    if (!VIEWS[name]) name = "resumen";
    state.view = name;
    $$(".nav-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === name);
    });
    closeMenu();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function renderView() {
    const view = VIEWS[state.view] || VIEWS.resumen;
    $("#view-title").textContent = view.title;
    $("#view-eyebrow").textContent = view.eyebrow;
    document.title = view.title + " · Panel Agencia";
    view.render();
  }

  function openMenu() {
    $("#sidebar").classList.add("is-open");
    $("#sidebar-scrim").classList.add("is-open");
  }
  function closeMenu() {
    $("#sidebar").classList.remove("is-open");
    $("#sidebar-scrim").classList.remove("is-open");
  }

  /* ------------------------------------------------------------------ */
  /* Chips y helpers de render                                           */
  /* ------------------------------------------------------------------ */

  function chip(label, tone) {
    return '<span class="chip chip--' + (tone || "plain") + '">' + esc(label) + "</span>";
  }
  function chipLead(estado) {
    return chip(LEAD_LABEL[estado] || estado || "—", LEAD_TONE[estado] || "plain");
  }
  function chipCliente(estado) {
    return chip(CLIENTE_LABEL[estado] || estado || "—", CLIENTE_TONE[estado] || "plain");
  }
  function chipProyecto(estado) {
    return chip(PROYECTO_LABEL[estado] || estado || "—", PROYECTO_TONE[estado] || "plain");
  }

  function scoreBadge(score) {
    const n = Number(score) || 0;
    const tone = n >= 80 ? "high" : n >= 60 ? "mid" : "low";
    return '<span class="score score--' + tone + '">' + esc(n) + "</span>";
  }

  function options(items, labels, selected) {
    return items.map((item) => {
      return '<option value="' + esc(item) + '"' + (item === selected ? " selected" : "") + ">" +
        esc(labels[item] || item) + "</option>";
    }).join("");
  }

  function clienteNombre(id) {
    const c = state.clientes.find((x) => String(x.id) === String(id));
    return c ? c.negocio : "Sin cliente";
  }

  function emptyState(icon, title, text) {
    return '<div class="empty"><span class="empty-ico">' + esc(icon) + "</span><strong>" +
      esc(title) + "</strong><p>" + esc(text || "") + "</p></div>";
  }

  /* ------------------------------------------------------------------ */
  /* Resumen                                                             */
  /* ------------------------------------------------------------------ */

  function renderResumen() {
    const leads = state.leads;
    const byEstado = {};
    LEAD_ESTADOS.forEach((e) => { byEstado[e] = 0; });
    leads.forEach((l) => { byEstado[l.estado] = (byEstado[l.estado] || 0) + 1; });

    const activos = leads.filter((l) => !["descartado", "perdido", "ganado"].includes(l.estado)).length;
    const borradores = state.interacciones.filter((i) => i.estado === "borrador");
    const borradorLeadIds = new Set(borradores.map((i) => String(i.lead_id)));
    const clientesActivos = state.clientes.filter((c) => c.estado === "activo").length;
    const proyectosCurso = state.proyectos.filter((p) => ["en_progreso", "revision"].includes(p.estado));
    const pipeline = state.proyectos
      .filter((p) => ["idea", "en_progreso", "revision"].includes(p.estado))
      .reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
    const ganados = byEstado.ganado || 0;

    const maxBar = Math.max(1, ...LEAD_ESTADOS.map((e) => byEstado[e]));
    const topEstados = LEAD_ESTADOS
      .filter((e) => byEstado[e] > 0)
      .sort((a, b) => byEstado[b] - byEstado[a])
      .slice(0, 8);

    const pendientes = leads
      .filter((l) => borradorLeadIds.has(String(l.id)))
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
      .slice(0, 5);

    const proximos = state.proyectos
      .filter((p) => p.fecha_entrega && !["entregado", "cancelado"].includes(p.estado))
      .sort((a, b) => new Date(a.fecha_entrega) - new Date(b.fecha_entrega))
      .slice(0, 5);

    const hora = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches";
    const nombre = String(state.perfil.nombre || "").split(/\s+/)[0];
    const hoy = new Date().toLocaleDateString("es-CL", {
      weekday: "long", day: "numeric", month: "long"
    });

    const barsHtml = topEstados.length
      ? topEstados.map((e) => {
        const n = byEstado[e];
        const pct = Math.max(3, Math.round((n / maxBar) * 100));
        return '<div class="bar-row">' +
          '<span class="bar-label">' + esc(LEAD_LABEL[e] || e) + "</span>" +
          '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%"></span></span>' +
          '<span class="bar-value">' + n + "</span></div>";
      }).join("")
      : '<p class="muted" style="font-size:12.5px">Todavía no hay leads en la base.</p>';

    const pendientesHtml = pendientes.length
      ? pendientes.map((l) => {
        return '<div class="list-row" data-action="lead" data-id="' + esc(l.id) + '" style="cursor:pointer">' +
          '<div class="list-main"><strong>' + esc(l.negocio) + "</strong><small>" +
          esc(l.comuna || l.rubro || "Sin comuna") + " · " + esc(LEAD_LABEL[l.estado] || l.estado) +
          '</small></div><div class="list-meta">' + scoreBadge(l.score) + "</div></div>";
      }).join("")
      : emptyState("✓", "Sin borradores pendientes", "Cuando la corrida genere borradores, aparecerán aquí para revisar.");

    const proximosHtml = proximos.length
      ? proximos.map((p) => {
        return '<div class="list-row" data-action="edit-proyecto" data-id="' + esc(p.id) + '" style="cursor:pointer">' +
          '<div class="list-main"><strong>' + esc(p.nombre) + "</strong><small>" +
          esc(clienteNombre(p.cliente_id)) + " · " + esc(PROYECTO_LABEL[p.estado] || p.estado) +
          '</small></div><div class="list-meta">' + esc(fmtDate(p.fecha_entrega)) + "</div></div>";
      }).join("")
      : emptyState("◇", "Sin entregas agendadas", "Agrega fechas de entrega a tus proyectos.");

    $("#view-root").innerHTML =
      '<div class="hero"><div class="hero-row"><div>' +
      '<p class="eyebrow" style="color:#a9c0b5">' + esc(hoy) + "</p>" +
      '<h2 style="margin-top:8px">' + esc(saludo) + ", " + esc(nombre) + ".</h2>" +
      "<p>Este es el estado de la agencia hoy. Revisa los borradores antes de que salgan y mantén los proyectos al día.</p>" +
      '</div><div class="hero-meta">' +
      "<div><span>Equipo</span><strong>" + state.perfiles.filter((p) => p.activo).length + " activos</strong></div>" +
      "<div><span>Leads</span><strong>" + leads.length + " en base</strong></div>" +
      "<div><span>Borradores</span><strong>" + borradores.length + " por revisar</strong></div>" +
      "</div></div></div>" +

      '<div class="kpi-grid">' +
      '<div class="kpi kpi--accent"><span class="kpi-label">Leads activos</span><span class="kpi-value">' + activos + '</span><span class="kpi-meta">Sin descartados, perdidos ni ganados</span></div>' +
      '<div class="kpi"><span class="kpi-label">Borradores por aprobar</span><span class="kpi-value">' + borradores.length + '</span><span class="kpi-meta">No se envía nada al aprobar</span></div>' +
      '<div class="kpi"><span class="kpi-label">Clientes activos</span><span class="kpi-value">' + clientesActivos + '</span><span class="kpi-meta">' + state.clientes.length + " en cartera</span></div>" +
      '<div class="kpi"><span class="kpi-label">Proyectos en curso</span><span class="kpi-value">' + proyectosCurso.length + '</span><span class="kpi-meta">' + state.proyectos.length + " en total</span></div>" +
      '<div class="kpi"><span class="kpi-label">Pipeline abierto</span><span class="kpi-value" style="font-size:24px">' + esc(fmtMoney(pipeline)) + '</span><span class="kpi-meta">Idea + en curso + revisión</span></div>' +
      '<div class="kpi"><span class="kpi-label">Leads ganados</span><span class="kpi-value">' + ganados + '</span><span class="kpi-meta">Cerrados a favor</span></div>' +
      "</div>" +

      '<div class="grid-2">' +
      '<div class="stack">' +
      '<div class="panel"><div class="panel-head"><div><div class="panel-title">Leads por estado</div><div class="panel-sub">Distribución actual de la base</div></div>' +
      '<a class="panel-link" href="#" data-view="leads">Ver todos →</a></div><div class="panel-body"><div class="bars">' + barsHtml + "</div></div></div>" +
      '<div class="panel"><div class="panel-head"><div><div class="panel-title">Proyectos por entregar</div><div class="panel-sub">Ordenados por fecha comprometida</div></div>' +
      '<a class="panel-link" href="#" data-view="proyectos">Ver proyectos →</a></div><div class="panel-body panel-body--flush">' + proximosHtml + "</div></div>" +
      "</div>" +
      '<div class="panel"><div class="panel-head"><div><div class="panel-title">Borradores pendientes</div><div class="panel-sub">Revisa el cuerpo antes de aprobar</div></div>' +
      '<span class="badge">' + borradores.length + "</span></div><div class=\"panel-body panel-body--flush\">" + pendientesHtml + "</div></div>" +
      "</div>";
  }

  /* ------------------------------------------------------------------ */
  /* Leads                                                               */
  /* ------------------------------------------------------------------ */

  function renderLeads() {
    $("#view-root").innerHTML =
      '<div class="page-head"><div><h2>Leads</h2><p>Base de captación. Abre un lead para ver el borrador y aprobarlo.</p></div>' +
      '<div class="page-actions"><button class="btn btn--outline btn--small" data-action="reload">Actualizar</button></div></div>' +
      '<div class="panel"><div class="toolbar">' +
      '<input id="lead-q" class="search" type="search" placeholder="Buscar negocio, comuna, email…" value="' + esc(state.filtros.q) + '">' +
      '<select id="lead-estado" aria-label="Filtrar por estado"><option value="">Todos los estados</option>' +
      options(LEAD_ESTADOS, LEAD_LABEL, state.filtros.estado) + "</select>" +
      '<select id="lead-score" aria-label="Filtrar por score">' +
      '<option value="0"' + (state.filtros.score === "0" ? " selected" : "") + ">Cualquier score</option>" +
      '<option value="60"' + (state.filtros.score === "60" ? " selected" : "") + ">Score 60+</option>" +
      '<option value="80"' + (state.filtros.score === "80" ? " selected" : "") + ">Score 80+</option>" +
      "</select>" +
      '<select id="lead-sort" aria-label="Ordenar">' +
      '<option value="reciente"' + (state.filtros.sort === "reciente" ? " selected" : "") + ">Más recientes</option>" +
      '<option value="score"' + (state.filtros.sort === "score" ? " selected" : "") + ">Mayor score</option>" +
      "</select>" +
      '<span id="leads-count" class="toolbar-count"></span>' +
      '</div><div class="table-wrap" id="leads-table-wrap"></div></div>';

    $("#lead-q").addEventListener("input", (e) => {
      state.filtros.q = e.target.value;
      state.leadLimit = 60;
      renderLeadTable();
    });
    $("#lead-estado").addEventListener("change", (e) => {
      state.filtros.estado = e.target.value;
      state.leadLimit = 60;
      renderLeadTable();
    });
    $("#lead-score").addEventListener("change", (e) => {
      state.filtros.score = e.target.value;
      state.leadLimit = 60;
      renderLeadTable();
    });
    $("#lead-sort").addEventListener("change", (e) => {
      state.filtros.sort = e.target.value;
      renderLeadTable();
    });

    renderLeadTable();
  }

  function filteredLeads() {
    const q = norm(state.filtros.q);
    const estado = state.filtros.estado;
    const score = Number(state.filtros.score) || 0;
    let rows = state.leads.filter((l) => {
      if (estado && l.estado !== estado) return false;
      if (score && (Number(l.score) || 0) < score) return false;
      if (q) {
        const haystack = norm([l.negocio, l.rubro, l.comuna, l.email, l.owner, l.telefono].join(" "));
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    if (state.filtros.sort === "score") {
      rows = rows.slice().sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    }
    return rows;
  }

  function renderLeadTable() {
    const wrap = $("#leads-table-wrap");
    if (!wrap) return;
    const rows = filteredLeads();
    const shown = rows.slice(0, state.leadLimit);
    const count = $("#leads-count");
    if (count) count.textContent = rows.length + " de " + state.leads.length;

    if (!rows.length) {
      wrap.innerHTML = emptyState("◎", "Sin resultados", "Prueba con otro estado, score o búsqueda.");
      return;
    }

    wrap.innerHTML = '<table class="data"><thead><tr>' +
      "<th>Negocio</th><th>Comuna</th><th>Score</th><th>Estado</th><th>Actualizado</th>" +
      "</tr></thead><tbody>" +
      shown.map((l) => {
        return '<tr class="is-clickable" data-action="lead" data-id="' + esc(l.id) + '">' +
          '<td><div class="cell-title">' + esc(l.negocio) + '</div><div class="cell-sub">' +
          esc(l.rubro || "Sin rubro") + (l.email ? " · " + esc(l.email) : "") + "</div></td>" +
          "<td>" + esc(l.comuna || "—") + "</td>" +
          "<td>" + scoreBadge(l.score) + "</td>" +
          "<td>" + chipLead(l.estado) + "</td>" +
          '<td class="num">' + esc(fmtDate(l.updated_at)) + "</td></tr>";
      }).join("") +
      "</tbody></table>" +
      (rows.length > shown.length
        ? '<div class="table-foot"><button class="btn btn--outline btn--small" data-action="more-leads">Mostrar más (' +
          (rows.length - shown.length) + " restantes)</button></div>"
        : "");
  }

  function draftHtml(interaccion, leadId) {
    const cuerpo = interaccion.cuerpo || interaccion.resumen || "(sin cuerpo guardado)";
    const ESTADO_INT = {
      borrador: "Borrador", aprobado: "Aprobado", enviando: "Enviando", enviado: "Enviado",
      fallido: "Fallido", respondido: "Respondido", rebotado: "Rebotado"
    };
    const toneInt = interaccion.estado === "borrador" ? "warn"
      : interaccion.estado === "enviado" ? "info"
      : interaccion.estado === "fallido" || interaccion.estado === "rebotado" ? "danger"
      : "ok";
    const aprobado = interaccion.aprobado_por
      ? '<span class="muted" style="font-size:11px">Aprobado por ' + esc(interaccion.aprobado_por) + "</span>"
      : "";
    const enviado = interaccion.enviado_at
      ? '<span class="muted" style="font-size:11px">Enviado ' + esc(fmtDateTime(interaccion.enviado_at)) + "</span>"
      : "";
    const action = interaccion.estado === "borrador"
      ? '<div class="draft-actions"><button class="btn btn--primary btn--small" data-action="aprobar" data-lead="' +
        esc(leadId) + '" data-int="' + esc(interaccion.id) + '">Aprobar borrador</button></div>'
      : '<div class="draft-actions">' + aprobado + " " + enviado + "</div>";

    return '<div class="draft"><div class="draft-head">' +
      "<strong>Ronda " + esc(interaccion.ronda || 1) + "</strong>" +
      chip(ESTADO_INT[interaccion.estado] || interaccion.estado, toneInt) +
      '<span class="spacer"></span><span class="muted" style="font-size:11px">' +
      esc(fmtDateTime(interaccion.created_at)) + "</span></div>" +
      (interaccion.asunto
        ? '<div style="padding:10px 13px 0"><span class="detail-label">Asunto</span><div style="font-size:12.5px;font-weight:600">' +
          esc(interaccion.asunto) + "</div></div>"
        : "") +
      '<div class="draft-body">' + esc(cuerpo) + "</div>" + action + "</div>";
  }

  async function openLead(id) {
    const lead = state.leads.find((l) => String(l.id) === String(id));
    if (!lead) return;

    openModal(
      '<div class="modal-head"><div class="modal-head-main">' +
      '<div class="modal-title">' + esc(lead.negocio) + "</div>" +
      '<div class="modal-sub">' + esc(lead.rubro || "Sin rubro") + " · " + esc(lead.comuna || "Sin comuna") + "</div>" +
      "</div>" + chipLead(lead.estado) +
      '<button class="modal-close" data-action="close-modal" aria-label="Cerrar">✕</button></div>' +
      '<div class="modal-body" id="lead-detail-body"><p class="muted" style="font-size:13px">Cargando borradores…</p></div>',
      "wide"
    );

    let interacciones = [];
    try {
      const { data, error } = await db.from("interacciones").select("*")
        .eq("lead_id", lead.id).order("ronda", { ascending: false });
      if (error) throw error;
      interacciones = data || [];
    } catch (error) {
      toast("No se pudieron cargar los borradores: " + errMsg(error), true);
    }

    const body = $("#lead-detail-body");
    if (!body) return;

    const email = lead.email
      ? '<a href="mailto:' + esc(encodeURIComponent(lead.email)) + '">' + esc(lead.email) + "</a>"
      : "—";
    const tel = lead.telefono
      ? '<a href="tel:' + esc(String(lead.telefono).replace(/[^+\d]/g, "")) + '">' + esc(lead.telefono) + "</a>"
      : "—";
    const instagram = lead.instagram
      ? (safeUrl(lead.instagram.startsWith("http") ? lead.instagram : "https://instagram.com/" + String(lead.instagram).replace(/^@/, ""))
        ? '<a href="' + esc(safeUrl(lead.instagram.startsWith("http") ? lead.instagram : "https://instagram.com/" + String(lead.instagram).replace(/^@/, ""))) + '" target="_blank" rel="noopener">' + esc(lead.instagram) + " ↗</a>"
        : esc(lead.instagram))
      : "—";
    const web = safeUrl(lead.sitio_web)
      ? '<a href="' + esc(safeUrl(lead.sitio_web)) + '" target="_blank" rel="noopener">' + esc(lead.sitio_web) + " ↗</a>"
      : "—";
    const demo = safeUrl(lead.demo_url)
      ? '<a class="btn btn--outline btn--small" href="' + esc(safeUrl(lead.demo_url)) + '" target="_blank" rel="noopener">Ver maqueta ↗</a>'
      : "";

    body.innerHTML =
      '<div class="detail-grid">' +
      '<div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">' + email + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Teléfono</div><div class="detail-value">' + tel + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Instagram</div><div class="detail-value">' + instagram + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Sitio web</div><div class="detail-value">' + web + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Score</div><div class="detail-value">' + scoreBadge(lead.score) + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Responsable</div><div class="detail-value">' + esc(lead.owner || "Sin asignar") + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Último contacto</div><div class="detail-value">' + esc(fmtDateTime(lead.ultimo_contacto)) + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Creado</div><div class="detail-value">' + esc(fmtDateTime(lead.created_at)) + "</div></div>" +
      "</div>" +
      (lead.oferta_sugerida
        ? '<div class="detail-section"><h4>Oferta sugerida</h4><p>' + esc(lead.oferta_sugerida) + "</p></div>"
        : "") +
      (lead.notas
        ? '<div class="detail-section"><h4>Notas</h4><p>' + esc(lead.notas) + "</p></div>"
        : "") +
      (demo ? '<div class="detail-section"><h4>Maqueta enviada</h4>' + demo + "</div>" : "") +
      '<div class="detail-section"><h4>Estado del lead</h4>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<select id="lead-estado-select" data-action="set-lead-estado" data-id="' + esc(lead.id) + '" ' +
      'style="border:1px solid var(--line-2);border-radius:8px;padding:8px 10px;background:#fbfaf8;font-size:13px">' +
      options(LEAD_ESTADOS, LEAD_LABEL, lead.estado) + "</select>" +
      '<span class="muted" style="font-size:11.5px">Cambiar el estado no envía correos.</span></div></div>' +
      '<div class="detail-section"><h4>Borradores e interacciones</h4>' +
      (interacciones.length
        ? interacciones.map((i) => draftHtml(i, lead.id)).join("")
        : emptyState("✉", "Sin interacciones", "Este lead todavía no tiene borradores generados.")) +
      "</div>";
  }

  async function aprobarBorrador(leadId, interaccionId, button) {
    if (!window.confirm("¿Aprobar este borrador? Solo se marcará el estado; no se enviará ningún correo.")) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Aprobando…";
    try {
      const { error } = await db.rpc("aprobar_borrador", {
        p_lead_id: Number(leadId),
        p_interaccion_id: interaccionId ? Number(interaccionId) : null,
        p_por: state.perfil.nombre
      });
      if (error) throw error;
      closeModal();
      toast("Borrador aprobado. No se envió ningún correo.");
      await loadAll();
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      toast("No se pudo aprobar: " + errMsg(error), true);
    }
  }

  async function cambiarEstadoLead(id, estado, select) {
    const anterior = state.leads.find((l) => String(l.id) === String(id))?.estado;
    select.disabled = true;
    try {
      const { error } = await db.from("leads").update({ estado }).eq("id", id);
      if (error) throw error;
      closeModal();
      toast("Estado del lead actualizado a " + (LEAD_LABEL[estado] || estado) + ".");
      await loadAll();
    } catch (error) {
      select.value = anterior || "";
      select.disabled = false;
      toast("No se pudo cambiar el estado: " + errMsg(error), true);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Clientes                                                            */
  /* ------------------------------------------------------------------ */

  function renderClientes() {
    const rows = state.clientes;
    const table = rows.length
      ? '<div class="table-wrap"><table class="data"><thead><tr>' +
        "<th>Negocio</th><th>Contacto</th><th>Comuna</th><th>Estado</th><th>Responsable</th><th></th>" +
        "</tr></thead><tbody>" +
        rows.map((c) => {
          return "<tr><td><div class=\"cell-title\">" + esc(c.negocio) + "</div><div class=\"cell-sub\">" +
            esc(c.email || "Sin email") + "</div></td>" +
            "<td>" + esc(c.contacto || "—") + (c.telefono ? '<div class="cell-sub">' + esc(c.telefono) + "</div>" : "") + "</td>" +
            "<td>" + esc(c.comuna || "—") + "</td>" +
            "<td>" + chipCliente(c.estado) + "</td>" +
            "<td>" + esc(c.owner || "—") + "</td>" +
            '<td><div class="row-actions">' +
            '<button class="btn btn--outline btn--small" data-action="edit-cliente" data-id="' + esc(c.id) + '">Editar</button>' +
            '<button class="btn btn--danger btn--small" data-action="delete-cliente" data-id="' + esc(c.id) + '">Eliminar</button>' +
            "</div></td></tr>";
        }).join("") + "</tbody></table></div>"
      : emptyState("▤", "Sin clientes todavía", "Agrega el primero con el botón de arriba.");

    $("#view-root").innerHTML =
      '<div class="page-head"><div><h2>Clientes</h2><p>Cartera activa y prospectos. Un cliente puede tener varios proyectos.</p></div>' +
      '<div class="page-actions"><button class="btn btn--primary" data-action="new-cliente">+ Nuevo cliente</button></div></div>' +
      '<div class="panel">' + table + "</div>";
  }

  function openClienteModal(id) {
    const c = id ? state.clientes.find((x) => String(x.id) === String(id)) : null;
    const isEdit = !!c;
    const value = (key) => esc(c ? (c[key] || "") : "");

    openModal(
      '<div class="modal-head"><div class="modal-head-main">' +
      '<div class="modal-title">' + (isEdit ? "Editar cliente" : "Nuevo cliente") + "</div>" +
      '<div class="modal-sub">' + (isEdit ? "Actualiza los datos de la cartera." : "Registra un prospecto o cliente activo.") + "</div>" +
      '</div><button class="modal-close" data-action="close-modal" aria-label="Cerrar">✕</button></div>' +
      '<form id="cliente-form" data-id="' + (isEdit ? esc(c.id) : "") + '">' +
      '<div class="modal-body"><div class="form-grid">' +
      '<div class="field field--full"><label for="cl-negocio">Negocio *</label><input id="cl-negocio" name="negocio" required maxlength="160" value="' + value("negocio") + '"></div>' +
      '<div class="field"><label for="cl-contacto">Contacto</label><input id="cl-contacto" name="contacto" maxlength="120" value="' + value("contacto") + '"></div>' +
      '<div class="field"><label for="cl-email">Email</label><input id="cl-email" name="email" type="email" maxlength="160" value="' + value("email") + '"></div>' +
      '<div class="field"><label for="cl-telefono">Teléfono</label><input id="cl-telefono" name="telefono" maxlength="40" value="' + value("telefono") + '"></div>' +
      '<div class="field"><label for="cl-comuna">Comuna</label><input id="cl-comuna" name="comuna" maxlength="80" value="' + value("comuna") + '"></div>' +
      '<div class="field"><label for="cl-estado">Estado</label><select id="cl-estado" name="estado">' +
      options(CLIENTE_ESTADOS, CLIENTE_LABEL, c ? c.estado : "prospecto") + "</select></div>" +
      '<div class="field"><label for="cl-owner">Responsable</label><input id="cl-owner" name="owner" maxlength="120" value="' +
      (c ? value("owner") : esc(state.perfil.nombre)) + '"></div>' +
      '<div class="field field--full"><label for="cl-notas">Notas</label><textarea id="cl-notas" name="notas">' + value("notas") + "</textarea></div>" +
      '<p id="cliente-form-error" class="form-error" hidden></p>' +
      "</div></div>" +
      '<div class="modal-foot"><button type="button" class="btn btn--ghost" data-action="close-modal">Cancelar</button>' +
      '<button type="submit" class="btn btn--primary">' + (isEdit ? "Guardar cambios" : "Crear cliente") + "</button></div>" +
      "</form>",
      "wide"
    );
  }

  async function saveCliente(form) {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const payload = {
      negocio: String(fd.get("negocio") || "").trim(),
      contacto: String(fd.get("contacto") || "").trim() || null,
      email: String(fd.get("email") || "").trim() || null,
      telefono: String(fd.get("telefono") || "").trim() || null,
      comuna: String(fd.get("comuna") || "").trim() || null,
      estado: String(fd.get("estado") || "prospecto"),
      owner: String(fd.get("owner") || "").trim() || null,
      notas: String(fd.get("notas") || "").trim() || null
    };
    const errorEl = $("#cliente-form-error");
    const submit = form.querySelector('button[type="submit"]');

    if (!payload.negocio) {
      errorEl.textContent = "El negocio es obligatorio.";
      errorEl.hidden = false;
      return;
    }

    submit.disabled = true;
    submit.textContent = "Guardando…";
    try {
      const query = id
        ? db.from("clientes").update(payload).eq("id", id)
        : db.from("clientes").insert(payload);
      const { error } = await query;
      if (error) throw error;
      closeModal();
      toast(id ? "Cliente actualizado." : "Cliente creado.");
      await loadAll();
    } catch (error) {
      errorEl.textContent = errMsg(error);
      errorEl.hidden = false;
      submit.disabled = false;
      submit.textContent = id ? "Guardar cambios" : "Crear cliente";
    }
  }

  /* ------------------------------------------------------------------ */
  /* Proyectos                                                           */
  /* ------------------------------------------------------------------ */

  function renderProyectos() {
    const rows = state.proyectos;
    const table = rows.length
      ? '<div class="table-wrap"><table class="data"><thead><tr>' +
        "<th>Proyecto</th><th>Estado</th><th>Monto</th><th>Entrega</th><th>Enlaces</th><th></th>" +
        "</tr></thead><tbody>" +
        rows.map((p) => {
          const links = [];
          if (safeUrl(p.repo_url)) links.push('<a class="panel-link" href="' + esc(safeUrl(p.repo_url)) + '" target="_blank" rel="noopener">Repo ↗</a>');
          if (safeUrl(p.demo_url)) links.push('<a class="panel-link" href="' + esc(safeUrl(p.demo_url)) + '" target="_blank" rel="noopener">Demo ↗</a>');
          return '<tr><td><div class="cell-title">' + esc(p.nombre) + '</div><div class="cell-sub">' +
            esc(clienteNombre(p.cliente_id)) + "</div></td>" +
            "<td>" + chipProyecto(p.estado) + "</td>" +
            '<td class="num">' + esc(fmtMoney(p.monto)) + "</td>" +
            '<td class="num">' + esc(fmtDate(p.fecha_entrega)) + "</td>" +
            "<td>" + (links.length ? links.join(" · ") : '<span class="muted">—</span>') + "</td>" +
            '<td><div class="row-actions">' +
            '<button class="btn btn--outline btn--small" data-action="edit-proyecto" data-id="' + esc(p.id) + '">Editar</button>' +
            '<button class="btn btn--danger btn--small" data-action="delete-proyecto" data-id="' + esc(p.id) + '">Eliminar</button>' +
            "</div></td></tr>";
        }).join("") + "</tbody></table></div>"
      : emptyState("◇", "Sin proyectos todavía", "Crea el primer proyecto y asígnalo a un cliente.");

    $("#view-root").innerHTML =
      '<div class="page-head"><div><h2>Proyectos</h2><p>Controla estados, montos y fechas de entrega de cada trabajo.</p></div>' +
      '<div class="page-actions"><button class="btn btn--primary" data-action="new-proyecto">+ Nuevo proyecto</button></div></div>' +
      '<div class="panel">' + table + "</div>";
  }

  function openProyectoModal(id) {
    const p = id ? state.proyectos.find((x) => String(x.id) === String(id)) : null;
    const isEdit = !!p;
    const value = (key) => esc(p ? (p[key] || "") : "");
    const clienteOptions = '<option value="">— Sin cliente —</option>' +
      state.clientes.map((c) => '<option value="' + esc(c.id) + '"' +
        (p && String(p.cliente_id) === String(c.id) ? " selected" : "") + ">" + esc(c.negocio) + "</option>").join("");

    openModal(
      '<div class="modal-head"><div class="modal-head-main">' +
      '<div class="modal-title">' + (isEdit ? "Editar proyecto" : "Nuevo proyecto") + "</div>" +
      '<div class="modal-sub">' + (isEdit ? "Actualiza el avance y los enlaces." : "Registra un trabajo para la cartera.") + "</div>" +
      '</div><button class="modal-close" data-action="close-modal" aria-label="Cerrar">✕</button></div>' +
      '<form id="proyecto-form" data-id="' + (isEdit ? esc(p.id) : "") + '">' +
      '<div class="modal-body"><div class="form-grid">' +
      '<div class="field field--full"><label for="pr-nombre">Nombre del proyecto *</label><input id="pr-nombre" name="nombre" required maxlength="160" value="' + value("nombre") + '"></div>' +
      '<div class="field"><label for="pr-cliente">Cliente</label><select id="pr-cliente" name="cliente_id">' + clienteOptions + "</select></div>" +
      '<div class="field"><label for="pr-estado">Estado</label><select id="pr-estado" name="estado">' +
      options(PROYECTO_ESTADOS, PROYECTO_LABEL, p ? p.estado : "idea") + "</select></div>" +
      '<div class="field"><label for="pr-monto">Monto (CLP)</label><input id="pr-monto" name="monto" type="number" min="0" step="1000" value="' +
      (p && p.monto !== null ? esc(p.monto) : "") + '"></div>' +
      '<div class="field"><label for="pr-inicio">Fecha de inicio</label><input id="pr-inicio" name="fecha_inicio" type="date" value="' +
      (p && p.fecha_inicio ? esc(p.fecha_inicio) : "") + '"></div>' +
      '<div class="field"><label for="pr-entrega">Fecha de entrega</label><input id="pr-entrega" name="fecha_entrega" type="date" value="' +
      (p && p.fecha_entrega ? esc(p.fecha_entrega) : "") + '"></div>' +
      '<div class="field"><label for="pr-repo">Repo URL</label><input id="pr-repo" name="repo_url" type="url" placeholder="https://github.com/…" value="' + value("repo_url") + '"></div>' +
      '<div class="field field--full"><label for="pr-demo">Demo URL</label><input id="pr-demo" name="demo_url" type="url" placeholder="https://…" value="' + value("demo_url") + '"></div>' +
      '<div class="field field--full"><label for="pr-notas">Notas</label><textarea id="pr-notas" name="notas">' + value("notas") + "</textarea></div>" +
      '<p id="proyecto-form-error" class="form-error" hidden></p>' +
      "</div></div>" +
      '<div class="modal-foot"><button type="button" class="btn btn--ghost" data-action="close-modal">Cancelar</button>' +
      '<button type="submit" class="btn btn--primary">' + (isEdit ? "Guardar cambios" : "Crear proyecto") + "</button></div>" +
      "</form>",
      "wide"
    );
  }

  async function saveProyecto(form) {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const montoRaw = String(fd.get("monto") || "").trim();
    const monto = montoRaw === "" ? null : Number(montoRaw);
    const payload = {
      cliente_id: String(fd.get("cliente_id") || "") || null,
      nombre: String(fd.get("nombre") || "").trim(),
      estado: String(fd.get("estado") || "idea"),
      monto: Number.isFinite(monto) ? monto : null,
      fecha_inicio: String(fd.get("fecha_inicio") || "") || null,
      fecha_entrega: String(fd.get("fecha_entrega") || "") || null,
      repo_url: String(fd.get("repo_url") || "").trim() || null,
      demo_url: String(fd.get("demo_url") || "").trim() || null,
      notas: String(fd.get("notas") || "").trim() || null
    };
    const errorEl = $("#proyecto-form-error");
    const submit = form.querySelector('button[type="submit"]');

    if (!payload.nombre) {
      errorEl.textContent = "El nombre del proyecto es obligatorio.";
      errorEl.hidden = false;
      return;
    }

    submit.disabled = true;
    submit.textContent = "Guardando…";
    try {
      const query = id
        ? db.from("proyectos").update(payload).eq("id", id)
        : db.from("proyectos").insert(payload);
      const { error } = await query;
      if (error) throw error;
      closeModal();
      toast(id ? "Proyecto actualizado." : "Proyecto creado.");
      await loadAll();
    } catch (error) {
      errorEl.textContent = errMsg(error);
      errorEl.hidden = false;
      submit.disabled = false;
      submit.textContent = id ? "Guardar cambios" : "Crear proyecto";
    }
  }

  /* ------------------------------------------------------------------ */
  /* Equipo                                                              */
  /* ------------------------------------------------------------------ */

  function renderEquipo() {
    const cards = state.perfiles.map((p) => {
      const tone = p.activo ? "ok" : "danger";
      return '<div class="team-card"><span class="avatar avatar--lg">' + esc(initials(p.nombre)) + "</span>" +
        '<div class="team-card-main"><strong>' + esc(p.nombre) + "</strong><small>" +
        esc(ROL_LABEL[p.rol] || p.rol) + " · desde " + esc(fmtDate(p.created_at)) + "</small></div>" +
        chip(p.activo ? "Activo" : "Inactivo", tone) + "</div>";
    }).join("");

    $("#view-root").innerHTML =
      '<div class="page-head"><div><h2>Equipo</h2><p>Personas con acceso al panel. Los permisos se controlan con la tabla <code>perfiles</code>.</p></div>' +
      '<div class="page-actions"><a class="btn btn--outline btn--small" href="https://supabase.com/dashboard/project/' +
      esc(cfg.PROJECT_REF) + '/auth/users" target="_blank" rel="noopener">Usuarios de Auth ↗</a></div></div>' +
      '<div class="team-grid">' + (cards || emptyState("◍", "Sin perfiles", "Crea el primer perfil en Supabase.")) + "</div>" +
      '<div class="stack" style="margin-top:18px">' +
      '<div class="info-box"><strong>Cómo agregar a un socio</strong>' +
      "<ol><li>En Supabase, entra a <b>Authentication → Users</b> y crea el usuario con email y contraseña (marca <i>Auto Confirm User</i>).</li>" +
      "<li>Copia el <b>UUID</b> del usuario y agrega su fila en <code>perfiles</code>.</li>" +
      "<li>Pídele que entre al panel con ese email y contraseña. Sin fila activa no verá nada.</li></ol>" +
      '<p style="margin-top:10px"><code>insert into public.perfiles (user_id, nombre, rol) values (\'&lt;uuid&gt;\', \'Nombre\', \'socio\');</code></p>' +
      "</div>" +
      '<div class="info-box"><strong>Roles</strong>' +
      "<p><b>admin</b>: puede crear, editar y desactivar perfiles, además de todo lo operativo. <b>socio</b> y <b>operador</b>: gestionan leads, clientes y proyectos, pero no administran el equipo.</p></div>" +
      "</div>";
  }

  /* ------------------------------------------------------------------ */
  /* Centro de control (orquestador local)                               */
  /* ------------------------------------------------------------------ */

  let corridaTimer = null;

  function detenerPoll() {
    if (corridaTimer) {
      clearInterval(corridaTimer);
      corridaTimer = null;
    }
  }

  function resumenLinea(resumen) {
    const orden = ["leads", "encontrados", "existentes", "calificados",
      "borradores", "seguimientos", "descartados", "fallidos"];
    const claves = Object.keys(resumen || {});
    const partes = orden.filter((k) => typeof resumen[k] === "number")
      .concat(claves.filter((k) => !orden.includes(k)))
      .map((k) => k + ": " + resumen[k]);
    return partes.length ? partes.join(" · ") : "sin contadores en la salida";
  }

  function abrirModalCorrida() {
    openModal(
      '<div class="modal-head"><div class="modal-head-main">' +
      '<div class="modal-title">Correr sistema</div>' +
      '<div class="modal-sub">corrida → seguimiento. El envío de correos no se toca.</div></div>' +
      '<button class="modal-close" data-action="close-modal" aria-label="Cerrar">✕</button></div>' +
      '<div class="modal-body"><p id="corrida-estado" style="font-size:13.5px;color:var(--ink-2)">Iniciando…</p>' +
      '<pre id="corrida-log" class="corrida-log" hidden></pre></div>' +
      '<div class="modal-foot"><button class="btn btn--ghost" data-action="close-modal">Cerrar</button></div>',
      "wide"
    );
  }

  async function correrSistema(btn) {
    if (btn && btn.disabled) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "corriendo…";
    }
    detenerPoll();
    abrirModalCorrida();

    const estadoEl = $("#corrida-estado");
    const logEl = $("#corrida-log");

    try {
      const res = await fetch(ORQUESTADOR_URL + "/correr?esperar=0", { method: "POST" });
      const datos = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast("Ya hay una corrida en curso.", true);
      } else if (!res.ok) {
        throw new Error(datos.error || "HTTP " + res.status);
      }
    } catch (error) {
      closeModal();
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Correr sistema";
      }
      toast("Abre el centro de control con `npm run orquestador`", true);
      return;
    }

    const terminar = (datos) => {
      detenerPoll();
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Correr sistema";
      }
      const ultima = datos && datos.ultima;
      const estadoActual = $("#corrida-estado");
      const logActual = $("#corrida-log");
      if (!estadoActual || !logActual) return; // el usuario cerró el modal
      if (!ultima) {
        estadoActual.textContent = "La corrida terminó sin resultado.";
        return;
      }
      const segundos = Math.round(ultima.duracionMs / 1000);
      const pasos = (ultima.pasos || [])
        .map((p) => (p.ok ? "✓ " : "✗ ") + p.nombre)
        .join(" · ");
      estadoActual.innerHTML =
        (ultima.ok ? "Listo" : "Terminó con errores") + " en " + segundos + " s · " + esc(pasos) +
        '<br><span style="font-size:12.5px">' + esc(resumenLinea(ultima.resumen)) + "</span>";
      logActual.hidden = false;
      logActual.textContent = ultima.log || "(sin salida)";
      toast(ultima.ok ? "Corrida terminada: " + resumenLinea(ultima.resumen) : "La corrida terminó con errores.", !ultima.ok);
    };

    const consultar = async () => {
      try {
        const res = await fetch(ORQUESTADOR_URL + "/estado", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const datos = await res.json();
        const estadoActual = $("#corrida-estado");
        const logActual = $("#corrida-log");
        if (!estadoActual) { detenerPoll(); return; }
        if (datos.corriendo) {
          estadoActual.textContent = "Ejecutando " + (datos.pasoActual || "pipeline") + "…";
          if (datos.log) {
            logActual.hidden = false;
            logActual.textContent = datos.log;
          }
          return;
        }
        terminar(datos);
      } catch (error) {
        detenerPoll();
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Correr sistema";
        }
        toast("Se perdió la conexión con el orquestador.", true);
      }
    };

    corridaTimer = setInterval(consultar, 2000);
    setTimeout(consultar, 600);
  }

  async function abrirOpenBot(btn) {
    if (btn && btn.disabled) return;
    const textoOriginal = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Abriendo…";
    }
    try {
      const res = await fetch(ORQUESTADOR_URL + "/abrir-openbot", { method: "POST" });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok || !datos.abierto) throw new Error(datos.error || "HTTP " + res.status);
      if (datos.yaEstaba) {
        toast(datos.enfocado ? "OpenBot ya estaba abierto; lo traje al frente." : "OpenBot ya estaba abierto.");
      } else {
        toast("OpenBot abierto. Dale unos segundos para cargar.");
      }
    } catch (error) {
      toast("No pude llamar al centro de control. Si está corriendo, el navegador pudo bloquear el acceso local: usa el botón Centro de control.", true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = textoOriginal || "Abrir OpenBot";
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Modales y confirmaciones                                            */
  /* ------------------------------------------------------------------ */

  function openModal(html, size) {
    const cls = size === "wide" ? "modal modal--wide" : size === "small" ? "modal modal--small" : "modal";
    modalRoot.innerHTML = '<div class="modal-overlay"><div class="' + cls + '" role="dialog" aria-modal="true">' +
      html + "</div></div>";
    document.body.style.overflow = "hidden";
    const first = modalRoot.querySelector("input, select, textarea, button");
    if (first) setTimeout(() => first.focus(), 40);
  }

  function closeModal() {
    modalRoot.innerHTML = "";
    document.body.style.overflow = "";
  }

  function openConfirm(opts) {
    openModal(
      '<div class="modal-head"><div class="modal-head-main"><div class="modal-title">' + esc(opts.title) + "</div>" +
      '<div class="modal-sub">Esta acción no se puede deshacer.</div></div>' +
      '<button class="modal-close" data-action="close-modal" aria-label="Cerrar">✕</button></div>' +
      '<div class="modal-body"><p style="font-size:13.5px;color:var(--ink-2)">' + esc(opts.message) + "</p></div>" +
      '<div class="modal-foot"><button class="btn btn--ghost" data-action="close-modal">Cancelar</button>' +
      '<button id="confirm-yes" class="btn btn--danger">' + esc(opts.label || "Eliminar") + "</button></div>",
      "small"
    );
    const btn = $("#confirm-yes");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Eliminando…";
      try {
        await opts.run();
        closeModal();
        toast(opts.success || "Eliminado.");
        await loadAll();
      } catch (error) {
        btn.disabled = false;
        btn.textContent = opts.label || "Eliminar";
        toast(errMsg(error), true);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Eventos                                                             */
  /* ------------------------------------------------------------------ */

  document.addEventListener("click", async (event) => {
    const navBtn = event.target.closest("[data-view]");
    if (navBtn) {
      event.preventDefault();
      switchView(navBtn.dataset.view);
      renderView();
      return;
    }

    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;

    switch (action) {
      case "toggle-password": {
        const input = $("#login-password");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        el.textContent = show ? "Ocultar" : "Ver";
        break;
      }
      case "logout": {
        await db.auth.signOut();
        state.perfil = null;
        showLogin();
        toast("Sesión cerrada.");
        break;
      }
      case "reload": {
        await loadAll();
        toast("Datos actualizados.");
        break;
      }
      case "open-menu": openMenu(); break;
      case "close-menu": closeMenu(); break;
      case "close-modal": closeModal(); break;
      case "correr-sistema": await correrSistema(el); break;
      case "abrir-openbot": await abrirOpenBot(el); break;
      case "lead": openLead(el.dataset.id); break;
      case "more-leads": {
        state.leadLimit += 60;
        renderLeadTable();
        break;
      }
      case "aprobar": {
        await aprobarBorrador(el.dataset.lead, el.dataset.int, el);
        break;
      }
      case "new-cliente": openClienteModal(); break;
      case "edit-cliente": openClienteModal(el.dataset.id); break;
      case "delete-cliente": {
        const c = state.clientes.find((x) => String(x.id) === String(el.dataset.id));
        if (!c) break;
        openConfirm({
          title: "Eliminar cliente",
          message: "Se eliminará «" + c.negocio + "» y también sus proyectos asociados. Los leads no se tocan.",
          label: "Eliminar cliente",
          success: "Cliente eliminado.",
          run: async () => {
            const { error } = await db.from("clientes").delete().eq("id", c.id);
            if (error) throw error;
          }
        });
        break;
      }
      case "new-proyecto": openProyectoModal(); break;
      case "edit-proyecto": openProyectoModal(el.dataset.id); break;
      case "delete-proyecto": {
        const p = state.proyectos.find((x) => String(x.id) === String(el.dataset.id));
        if (!p) break;
        openConfirm({
          title: "Eliminar proyecto",
          message: "Se eliminará «" + p.nombre + "». Esta acción no se puede deshacer.",
          label: "Eliminar proyecto",
          success: "Proyecto eliminado.",
          run: async () => {
            const { error } = await db.from("proyectos").delete().eq("id", p.id);
            if (error) throw error;
          }
        });
        break;
      }
      default: break;
    }
  });

  document.addEventListener("change", async (event) => {
    const el = event.target.closest('[data-action="set-lead-estado"]');
    if (!el) return;
    await cambiarEstadoLead(el.dataset.id, el.value, el);
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "cliente-form") {
      event.preventDefault();
      await saveCliente(event.target);
    } else if (event.target.id === "proyecto-form") {
      event.preventDefault();
      await saveProyecto(event.target);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  modalRoot.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-overlay")) closeModal();
  });

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    const errorEl = $("#login-error");
    const submit = $("#login-submit");

    errorEl.hidden = true;
    submit.disabled = true;
    submit.textContent = "Entrando…";

    try {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data && data.session) {
        await enterApp(data.session);
      }
    } catch (error) {
      const raw = errMsg(error);
      let message = raw;
      if (/invalid login credentials/i.test(raw)) message = "Email o contraseña incorrectos.";
      else if (/email not confirmed/i.test(raw)) message = "Tu email aún no está confirmado. Pide que activen tu cuenta.";
      errorEl.textContent = message;
      errorEl.hidden = false;
      submit.disabled = false;
      submit.textContent = "Entrar al panel";
      $("#login-password").value = "";
      $("#login-password").focus();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */

  boot();
})();
