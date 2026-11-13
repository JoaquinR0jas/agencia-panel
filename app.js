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

  const RELEVO_ESTADOS = ["en_progreso", "bloqueado", "pausado", "terminado"];
  const RELEVO_LABEL = {
    en_progreso: "En progreso", bloqueado: "Bloqueado",
    pausado: "Pausado", terminado: "Terminado"
  };
  const RELEVO_TONE = {
    en_progreso: "info", bloqueado: "danger", pausado: "warn", terminado: "ok"
  };

  // La ruta local puede cambiar entre PC. El valor de `proyectos.ruta_local` es
  // el default y esta clave de localStorage lo sobrescribe en este navegador.
  const RUTA_STORAGE_PREFIX = "agencia:ruta-proyecto:";

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
    mensajes: [],
    mensajesError: "",
    mensajesTab: "bandeja",
    mensajeAbiertoId: null,
    mensajesTimer: null,
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
    startMensajesPoll();
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
          .select("id,negocio,rubro,comuna,direccion,telefono,email,instagram,sitio_web,web_estado,web_fuente,score,estado,oferta_sugerida,owner,notas,demo_url,ultimo_contacto,created_at,updated_at")
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

      await loadMensajes();
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
    updateMensajesBadge();
  }

  /* ------------------------------------------------------------------ */
  /* Mensajes entre socios                                               */
  /* ------------------------------------------------------------------ */

  function nombrePerfil(userId) {
    if (!userId) return "Alguien";
    const p = state.perfiles.find((x) => String(x.user_id) === String(userId));
    return p ? p.nombre : "Socio " + String(userId).slice(0, 8);
  }

  function mensajeNoLeido(m) {
    if (!m || !state.perfil) return false;
    if (String(m.de) === String(state.perfil.user_id)) return false;
    return !(m.leido_por || []).includes(state.perfil.user_id);
  }

  function contarMensajesNoLeidos() {
    return state.mensajes.filter(mensajeNoLeido).length;
  }

  function updateMensajesBadge() {
    const badge = $("#btn-mensajes-badge");
    const btn = $("#btn-mensajes");
    if (!badge) return;
    const n = contarMensajesNoLeidos();
    badge.textContent = String(n);
    badge.hidden = n === 0;
    if (btn) {
      btn.setAttribute("aria-label", n
        ? "Abrir mensajes de socios. " + n + " sin leer."
        : "Abrir mensajes de socios");
    }
  }

  async function loadMensajes(opts) {
    if (!state.perfil) return;
    try {
      const { data, error } = await db.from("mensajes_socios")
        .select("id,de,para,asunto,cuerpo,leido_por,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      state.mensajes = data || [];
      state.mensajesError = "";
    } catch (error) {
      state.mensajesError = errMsg(error);
    }
    updateMensajesBadge();
    if (!opts || !opts.silencioso) {
      // Si el modal está abierto en la bandeja, refresca la lista visible.
      // No se re-renderiza mientras alguien escribe un mensaje.
      const panel = $("#mensajes-panel");
      if (panel && state.mensajesTab === "bandeja") renderMensajesPanel();
    }
  }

  function startMensajesPoll() {
    stopMensajesPoll();
    state.mensajesTimer = setInterval(() => {
      if (!state.perfil) return;
      loadMensajes({ silencioso: false });
    }, 60000);
  }

  function stopMensajesPoll() {
    if (state.mensajesTimer) {
      clearInterval(state.mensajesTimer);
      state.mensajesTimer = null;
    }
  }

  function mensajeParaTexto(m) {
    if (!m.para) return "Todos";
    if (state.perfil && String(m.para) === String(state.perfil.user_id)) return "Mí";
    return nombrePerfil(m.para);
  }

  function abrirMensajes() {
    state.mensajesTab = "bandeja";
    openModal(
      '<div class="modal-head"><div class="modal-head-main">' +
      '<div class="modal-title">Mensajes de socios</div>' +
      '<div class="modal-sub">Bandeja interna del panel. Los agentes usan otro buzón (mensajes_equipo).</div>' +
      "</div>" +
      '<button class="modal-close" data-action="close-modal" aria-label="Cerrar">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="tabs" role="tablist" aria-label="Mensajes">' +
      '<button class="tab is-active" role="tab" aria-selected="true" data-action="mensajes-tab" data-tab="bandeja">Bandeja</button>' +
      '<button class="tab" role="tab" aria-selected="false" data-action="mensajes-tab" data-tab="escribir">Escribir</button>' +
      "</div>" +
      '<div id="mensajes-panel"></div>' +
      "</div>" +
      '<div class="modal-foot"><button class="btn btn--ghost" data-action="close-modal">Cerrar</button></div>',
      "wide"
    );
    renderMensajesPanel();
    loadMensajes();
  }

  function renderMensajesPanel() {
    const panel = $("#mensajes-panel");
    if (!panel) return;

    $$(".tabs [data-action='mensajes-tab']").forEach((btn) => {
      const active = btn.dataset.tab === state.mensajesTab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (state.mensajesTab === "escribir") {
      const opciones = state.perfiles
        .filter((p) => p.activo && state.perfil && String(p.user_id) !== String(state.perfil.user_id))
        .map((p) => '<option value="' + esc(p.user_id) + '">' + esc(p.nombre) +
          " · " + esc(ROL_LABEL[p.rol] || p.rol) + "</option>")
        .join("");
      panel.innerHTML =
        '<form id="mensaje-form">' +
        '<div class="form-grid">' +
        '<div class="field field--full"><label for="msg-para">Para</label>' +
        '<select id="msg-para" name="para"><option value="">Todos los socios</option>' + opciones + "</select></div>" +
        '<div class="field field--full"><label for="msg-asunto">Asunto *</label>' +
        '<input id="msg-asunto" name="asunto" required maxlength="160" placeholder="Ej: Revisar la propuesta de la barbería"></div>' +
        '<div class="field field--full"><label for="msg-cuerpo">Mensaje *</label>' +
        '<textarea id="msg-cuerpo" name="cuerpo" required maxlength="4000" placeholder="Escribe el mensaje…"></textarea></div>' +
        '<p id="mensaje-form-error" class="form-error" hidden></p>' +
        "</div>" +
        '<div class="form-actions"><button type="submit" class="btn btn--primary">Enviar mensaje</button></div>' +
        "</form>";
      return;
    }

    if (state.mensajesError) {
      panel.innerHTML =
        '<div class="notice notice--warn"><strong>No se pudo leer la bandeja.</strong> ' +
        esc(state.mensajesError) +
        '<div class="notice-actions"><button class="btn btn--outline btn--small" data-action="refrescar-mensajes">Reintentar</button></div></div>';
      return;
    }

    if (!state.mensajes.length) {
      panel.innerHTML = emptyState("✉", "Sin mensajes todavía",
        "Escribe el primero para coordinar con el resto del equipo.");
      return;
    }

    panel.innerHTML = '<div class="inbox">' + state.mensajes.map((m) => {
      const nuevo = mensajeNoLeido(m);
      const abierto = String(state.mensajeAbiertoId) === String(m.id);
      const cuerpo = String(m.cuerpo || "");
      const extracto = cuerpo.length > 150 ? cuerpo.slice(0, 150).trim() + "…" : cuerpo;
      return '<div class="msg' + (nuevo ? " msg--nuevo" : "") + '" role="button" tabindex="0" ' +
        'data-action="abrir-mensaje" data-id="' + esc(m.id) + '" aria-expanded="' + (abierto ? "true" : "false") + '" ' +
        'aria-label="' + esc("Mensaje de " + nombrePerfil(m.de) + ": " + m.asunto) + '">' +
        '<div class="msg-head"><strong>' + esc(m.asunto) + "</strong>" +
        (nuevo ? '<span class="chip chip--warn">Nuevo</span>' : "") +
        '<span class="spacer"></span><span class="msg-date">' + esc(fmtDateTime(m.created_at)) + "</span></div>" +
        '<div class="msg-meta">De ' + esc(nombrePerfil(m.de)) + " · Para " + esc(mensajeParaTexto(m)) + "</div>" +
        '<p class="msg-excerpt">' + esc(abierto ? cuerpo : extracto) + "</p>" +
        (!abierto && cuerpo.length > 150
          ? '<span class="msg-more">Abrir para leer todo</span>'
          : "") +
        "</div>";
    }).join("") + "</div>";
  }

  async function marcarMensajeLeido(m) {
    if (!m || !state.perfil || !mensajeNoLeido(m)) return;
    const uid = state.perfil.user_id;
    const leidoPor = Array.from(new Set([...(m.leido_por || []), uid]));
    m.leido_por = leidoPor;
    updateMensajesBadge();
    try {
      const { error } = await db.from("mensajes_socios")
        .update({ leido_por: leidoPor }).eq("id", m.id);
      if (error) throw error;
    } catch (error) {
      toast("No se pudo marcar el mensaje como leído: " + errMsg(error), true);
    }
  }

  function abrirMensaje(id) {
    const m = state.mensajes.find((x) => String(x.id) === String(id));
    if (!m) return;
    if (String(state.mensajeAbiertoId) === String(id)) {
      state.mensajeAbiertoId = null;
    } else {
      state.mensajeAbiertoId = m.id;
      marcarMensajeLeido(m);
    }
    renderMensajesPanel();
  }

  function cambiarTabMensajes(tab) {
    state.mensajesTab = tab === "escribir" ? "escribir" : "bandeja";
    renderMensajesPanel();
    const first = tab === "escribir" ? $("#msg-para") : null;
    if (first) setTimeout(() => first.focus(), 30);
  }

  async function enviarMensaje(form) {
    const fd = new FormData(form);
    const para = String(fd.get("para") || "").trim() || null;
    const asunto = String(fd.get("asunto") || "").trim();
    const cuerpo = String(fd.get("cuerpo") || "").trim();
    const errorEl = $("#mensaje-form-error");
    const submit = form.querySelector('button[type="submit"]');

    if (!asunto || !cuerpo) {
      if (errorEl) {
        errorEl.textContent = "El asunto y el mensaje son obligatorios.";
        errorEl.hidden = false;
      }
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Enviando…";
    }
    try {
      const { error } = await db.from("mensajes_socios").insert({
        de: state.perfil.user_id,
        para,
        asunto,
        cuerpo
      });
      if (error) throw error;
      state.mensajesTab = "bandeja";
      state.mensajeAbiertoId = null;
      await loadMensajes();
      toast(para ? "Mensaje enviado a " + nombrePerfil(para) + "." : "Mensaje enviado a todo el equipo.");
    } catch (error) {
      if (errorEl) {
        errorEl.textContent = errMsg(error);
        errorEl.hidden = false;
      }
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Enviar mensaje";
      }
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
        return '<div class="list-row" data-action="detalle-proyecto" data-id="' + esc(p.id) + '" style="cursor:pointer">' +
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
    const verificacionWeb =
      {
        propia: "Tiene web propia · descartado",
        social: "Solo redes sociales",
        ninguna: "Confirmado sin web",
        desconocida: "Sin verificar en Maps",
      }[lead.web_estado] || "Sin verificar";
    const demo = safeUrl(lead.demo_url)
      ? '<a class="btn btn--outline btn--small" href="' + esc(safeUrl(lead.demo_url)) + '" target="_blank" rel="noopener">Ver maqueta ↗</a>'
      : "";

    body.innerHTML =
      '<div class="detail-grid">' +
      '<div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">' + email + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Teléfono</div><div class="detail-value">' + tel + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Instagram</div><div class="detail-value">' + instagram + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Sitio web</div><div class="detail-value">' + web + "</div></div>" +
      '<div class="detail-item"><div class="detail-label">Verificación web</div><div class="detail-value">' + esc(verificacionWeb) + "</div></div>" +
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
          return '<tr><td><button class="link-btn cell-title-btn" data-action="detalle-proyecto" data-id="' +
            esc(p.id) + '" title="Ver cambios y relevo">' + esc(p.nombre) + '</button><div class="cell-sub">' +
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
      '<div class="field field--full"><label for="pr-ruta">Ruta local del proyecto <span>(opcional)</span></label>' +
      '<input id="pr-ruta" name="ruta_local" placeholder="C:\\Users\\juako\\Trabajo\\mi-proyecto" value="' + value("ruta_local") + '">' +
      '<span class="field-hint">Sirve para leer los commits y escribir RELEVO.md desde este PC. Cada socio puede sobrescribirla en su navegador.</span></div>' +
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
      ruta_local: String(fd.get("ruta_local") || "").trim() || null,
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
  /* Detalle de proyecto: cambios y relevo                               */
  /* ------------------------------------------------------------------ */

  let detalleProyecto = null;

  async function fetchOrquestador(path, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 12000);
    try {
      const res = await fetch(ORQUESTADOR_URL + path, Object.assign({}, options, {
        signal: controller.signal
      }));
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(datos.error || "HTTP " + res.status);
      if (datos && datos.ok === false) throw new Error(datos.error || "El orquestador devolvió un error.");
      return datos;
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("El orquestador no respondió a tiempo.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function mensajeOrquestador(error) {
    const raw = errMsg(error);
    if (/failed to fetch|networkerror|load failed|fetch/i.test(raw)) {
      return "No pude hablar con el orquestador local (127.0.0.1:8787). Ábrelo con `npm run orquestador` en el repo de captación o usa Centro de control.";
    }
    return raw;
  }

  function rutaLocalGuardada(id) {
    try {
      return localStorage.getItem(RUTA_STORAGE_PREFIX + id) || "";
    } catch (error) {
      return "";
    }
  }

  function guardarRutaLocalStorage(id, ruta) {
    try {
      if (ruta) localStorage.setItem(RUTA_STORAGE_PREFIX + id, ruta);
      else localStorage.removeItem(RUTA_STORAGE_PREFIX + id);
      return true;
    } catch (error) {
      toast("No se pudo guardar la ruta en este navegador: " + errMsg(error), true);
      return false;
    }
  }

  function rutaEfectivaProyecto(p) {
    return rutaLocalGuardada(p.id) || p.ruta_local || "";
  }

  function errorRutaLocal(ruta) {
    const r = String(ruta || "").trim();
    if (!r) return "Falta la ruta local del proyecto.";
    if (!/^[A-Za-z]:[\\/]/.test(r) && !/^\\\\/.test(r) && !r.startsWith("/")) {
      return "Escribe una ruta absoluta. Ejemplo: C:\\Users\\juako\\Trabajo\\mi-proyecto";
    }
    return "";
  }

  function openProyectoDetalle(id, opts) {
    const p = state.proyectos.find((x) => String(x.id) === String(id));
    if (!p) return;

    detalleProyecto = {
      proyecto: p,
      tab: opts && opts.tab === "relevo" ? "relevo" : "git",
      ruta: rutaEfectivaProyecto(p),
      git: null,
      gitError: "",
      cargandoGit: false,
      resumen: "",
      resumenError: "",
      resumenCargando: false,
      relevos: [],
      relevosError: "",
      cargandoRelevos: true
    };

    openModal(
      '<div class="modal-head"><div class="modal-head-main">' +
      '<div class="modal-title">' + esc(p.nombre) + "</div>" +
      '<div class="modal-sub">' + esc(clienteNombre(p.cliente_id)) + " · cambios del repo y traspaso del proyecto</div>" +
      "</div>" + chipProyecto(p.estado) +
      '<button class="modal-close" data-action="close-modal" aria-label="Cerrar">✕</button></div>' +
      '<div class="modal-body">' +
      '<div id="detalle-ruta"></div>' +
      '<div class="tabs" role="tablist" aria-label="Detalle del proyecto">' +
      '<button class="tab" role="tab" aria-selected="false" data-action="detalle-tab" data-tab="git">Últimos cambios</button>' +
      '<button class="tab" role="tab" aria-selected="false" data-action="detalle-tab" data-tab="relevo">Relevo</button>' +
      "</div>" +
      '<div id="detalle-panel"></div>' +
      "</div>" +
      '<div class="modal-foot">' +
      '<button class="btn btn--ghost" data-action="detalle-editar" data-id="' + esc(p.id) + '">Editar proyecto</button>' +
      '<button class="btn btn--outline" data-action="close-modal">Cerrar</button>' +
      "</div>",
      "wide"
    );

    renderDetalleRuta();
    renderDetallePanel();
    cargarRelevosDetalle();
    cargarGitDetalle();
  }

  function renderDetalleRuta() {
    const d = detalleProyecto;
    const el = $("#detalle-ruta");
    if (!d || !el) return;
    const p = d.proyecto;
    const guardada = rutaLocalGuardada(p.id);
    const valor = guardada || p.ruta_local || "";
    const origen = guardada
      ? "Ruta guardada en este navegador."
      : (p.ruta_local ? "Valor por defecto del proyecto." : "Todavía no hay una ruta configurada.");
    el.innerHTML =
      '<div class="detalle-ruta">' +
      '<div class="detail-label">Ruta local del proyecto</div>' +
      '<div class="inline-path">' +
      '<input id="detalle-ruta-input" aria-label="Ruta local del proyecto" placeholder="C:\\Users\\juako\\Trabajo\\mi-proyecto" value="' + esc(valor) + '">' +
      '<button class="btn btn--outline btn--small" data-action="guardar-ruta-detalle">Usar esta ruta</button>' +
      "</div>" +
      '<p class="field-hint">' + esc(origen) + " Se guarda solo en este navegador; el orquestador valida que exista.</p>" +
      "</div>";
  }

  function renderDetallePanel() {
    const d = detalleProyecto;
    const panel = $("#detalle-panel");
    if (!d || !panel) return;

    $$(".tabs [data-action='detalle-tab']").forEach((btn) => {
      const active = btn.dataset.tab === d.tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    panel.innerHTML = d.tab === "relevo" ? panelRelevoHtml(d) : panelGitHtml(d);
  }

  function panelGitHtml(d) {
    if (!d.ruta) {
      return '<div class="notice notice--warn"><strong>Sin ruta local.</strong> ' +
        "Configúrala arriba o en «Editar proyecto» para leer los commits y escribir RELEVO.md.</div>";
    }
    if (d.cargandoGit) {
      return '<p class="loading-inline">Consultando git en ' + esc(d.ruta) + "…</p>";
    }
    if (d.gitError) {
      return '<div class="notice notice--warn"><strong>No pude leer los cambios.</strong> ' +
        esc(d.gitError) +
        '<div class="notice-actions"><button class="btn btn--outline btn--small" data-action="detalle-reintentar-git">Reintentar</button></div></div>';
    }
    if (!d.git) {
      return '<p class="loading-inline">Sin datos de git todavía.</p>';
    }

    const commits = d.git.commits || [];
    const rama = d.git.rama || "rama desconocida";
    const commitsHtml = commits.length
      ? '<div class="commit-list">' + commits.map((c) => {
        const corto = c.corto || String(c.hash || "").slice(0, 7);
        return '<div class="commit">' +
          "<code>" + esc(corto || "—") + "</code>" +
          '<div class="commit-main"><strong>' + esc(c.mensaje || "(sin mensaje)") + "</strong>" +
          "<small>" + esc(c.autor || "sin autor") + " · " + esc(fmtDateTime(c.fecha)) + "</small></div>" +
          "</div>";
      }).join("") + "</div>"
      : emptyState("◷", "Sin commits", "El repo no tiene commits o la rama está vacía.");

    const resumenHtml = d.resumenCargando
      ? '<p class="loading-inline">Resumiendo con IA…</p>'
      : d.resumenError
        ? '<div class="notice notice--warn">' + esc(d.resumenError) + "</div>"
        : d.resumen
          ? '<div class="resumen-ia">' + esc(d.resumen) + "</div>"
          : "";

    return '<div class="git-head">' +
      chip("Rama " + rama, "info") +
      (d.git.sinCommitear ? '<span class="chip chip--warn">Cambios sin commitear</span>' : "") +
      '<span class="spacer"></span>' +
      '<button class="btn btn--outline btn--small" data-action="detalle-reintentar-git">Actualizar</button>' +
      "</div>" +
      commitsHtml +
      '<div class="detail-section"><div class="git-head">' +
      '<h4 style="margin:0">Resumen del proyecto</h4><span class="spacer"></span>' +
      '<button class="btn btn--primary btn--small" data-action="resumir-proyecto"' +
      (d.resumenCargando ? " disabled" : "") + ">" +
      (d.resumenCargando ? "Resumiendo…" : "Resumir con IA") + "</button></div>" +
      '<p class="field-hint" style="margin-top:6px">El resumen lo genera el orquestador local y no modifica el repo.</p>' +
      resumenHtml + "</div>";
  }

  function relevoCardHtml(r, opts) {
    const autor = nombrePerfil(r.autor);
    const parts = [];
    if (r.rama) parts.push('<span class="chip chip--plain">Rama ' + esc(r.rama) + "</span>");
    if (r.commit) parts.push('<span class="chip chip--plain">Commit ' + esc(String(r.commit).slice(0, 8)) + "</span>");

    const bloque = (titulo, texto) => texto && String(texto).trim()
      ? "<h4>" + esc(titulo) + "</h4><p>" + esc(texto) + "</p>"
      : "";

    return '<div class="relevo-card' + (opts && opts.destacado ? " relevo-card--last" : "") + '">' +
      '<div class="relevo-head">' + chip(RELEVO_LABEL[r.estado] || r.estado || "—", RELEVO_TONE[r.estado] || "plain") +
      '<span class="muted" style="font-size:12px">' + esc(autor) + " · " + esc(fmtDateTime(r.created_at)) + "</span>" +
      '<span class="spacer"></span>' + parts.join(" ") + "</div>" +
      '<div class="relevo-body">' +
      bloque("Qué hice", r.hecho) +
      bloque("Qué falta", r.pendientes) +
      bloque("Decisiones", r.decisiones) +
      bloque("Siguiente paso", r.siguiente) +
      "</div></div>";
  }

  function panelRelevoHtml(d) {
    if (d.cargandoRelevos) return '<p class="loading-inline">Cargando relevos…</p>';
    if (d.relevosError) {
      return '<div class="notice notice--warn"><strong>No pude cargar los relevos.</strong> ' +
        esc(d.relevosError) +
        '<div class="notice-actions"><button class="btn btn--outline btn--small" data-action="detalle-reintentar-relevos">Reintentar</button></div></div>';
    }
    if (!d.relevos.length) {
      return emptyState("⇄", "Sin relevos todavía",
        "Cuando alguien deje el proyecto, el traspaso aparecerá aquí y en RELEVO.md.") +
        '<div class="form-actions"><button class="btn btn--primary" data-action="detalle-dejar" data-id="' +
        esc(d.proyecto.id) + '">Dejar proyecto</button></div>';
    }

    const ultimo = d.relevos[0];
    const historial = d.relevos.slice(1);
    const historialHtml = historial.length
      ? '<div class="detail-section"><h4>Historial (' + historial.length + ")</h4>" +
        historial.map((r) => '<details class="relevo-hist"><summary>' +
          esc(fmtDateTime(r.created_at)) + " · " + esc(nombrePerfil(r.autor)) + " · " +
          esc(RELEVO_LABEL[r.estado] || r.estado) + "</summary>" +
          relevoCardHtml(r) + "</details>").join("") + "</div>"
      : "";

    return '<div class="detail-section" style="margin-top:0;padding-top:0;border-top:0">' +
      '<h4>Último relevo</h4>' + relevoCardHtml(ultimo, { destacado: true }) +
      '<div class="form-actions">' +
      '<button class="btn btn--primary" data-action="detalle-dejar" data-id="' + esc(d.proyecto.id) + '">Dejar proyecto</button>' +
      '<button class="btn btn--outline" data-action="detalle-retomar" data-id="' + esc(d.proyecto.id) + '">Retomar</button>' +
      "</div></div>" + historialHtml;
  }

  async function cargarRelevosDetalle() {
    const d = detalleProyecto;
    if (!d) return;
    d.cargandoRelevos = true;
    d.relevosError = "";
    renderDetallePanel();
    try {
      const { data, error } = await db.from("relevos").select("*")
        .eq("proyecto_id", d.proyecto.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      if (detalleProyecto !== d) return;
      d.relevos = data || [];
    } catch (error) {
      if (detalleProyecto !== d) return;
      d.relevosError = errMsg(error);
    } finally {
      if (detalleProyecto === d) {
        d.cargandoRelevos = false;
        renderDetallePanel();
      }
    }
  }

  async function cargarGitDetalle() {
    const d = detalleProyecto;
    if (!d) return;
    if (!d.ruta) {
      d.git = null;
      d.gitError = "";
      renderDetallePanel();
      return;
    }
    const err = errorRutaLocal(d.ruta);
    if (err) {
      d.git = null;
      d.gitError = err;
      renderDetallePanel();
      return;
    }
    d.cargandoGit = true;
    d.gitError = "";
    renderDetallePanel();
    try {
      const datos = await fetchOrquestador(
        "/git?ruta=" + encodeURIComponent(d.ruta) + "&limite=15", {}, 12000
      );
      if (detalleProyecto !== d) return;
      d.git = datos;
    } catch (error) {
      if (detalleProyecto !== d) return;
      d.git = null;
      d.gitError = mensajeOrquestador(error);
    } finally {
      if (detalleProyecto === d) {
        d.cargandoGit = false;
        renderDetallePanel();
      }
    }
  }

  function guardarRutaDetalle() {
    const d = detalleProyecto;
    const input = $("#detalle-ruta-input");
    if (!d || !input) return;
    const ruta = input.value.trim();
    if (ruta) {
      const err = errorRutaLocal(ruta);
      if (err) {
        toast(err, true);
        input.focus();
        return;
      }
    }
    const p = d.proyecto;
    const guardar = ruta && ruta !== (p.ruta_local || "") ? ruta : "";
    if (!guardarRutaLocalStorage(p.id, guardar)) return;
    d.ruta = guardar || p.ruta_local || "";
    toast(guardar ? "Ruta guardada para este navegador." :
      "Se usará la ruta configurada en el proyecto.");
    renderDetalleRuta();
    cargarGitDetalle();
  }

  async function resumirDetalle() {
    const d = detalleProyecto;
    if (!d || !d.ruta) return;
    d.resumenCargando = true;
    d.resumenError = "";
    renderDetallePanel();
    try {
      const datos = await fetchOrquestador("/resumir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruta: d.ruta })
      }, 60000);
      if (detalleProyecto !== d) return;
      d.resumen = String(datos.resumen || "").trim() || "El orquestador no devolvió texto.";
    } catch (error) {
      if (detalleProyecto !== d) return;
      d.resumenError = mensajeOrquestador(error);
    } finally {
      if (detalleProyecto === d) {
        d.resumenCargando = false;
        renderDetallePanel();
      }
    }
  }

  function abrirDejarProyecto(id) {
    const p = state.proyectos.find((x) => String(x.id) === String(id));
    if (!p) return;
    const ruta = rutaEfectivaProyecto(p);
    const rama = detalleProyecto && String(detalleProyecto.proyecto.id) === String(p.id) && detalleProyecto.git
      ? (detalleProyecto.git.rama || "") : "";
    const commit = detalleProyecto && String(detalleProyecto.proyecto.id) === String(p.id) && detalleProyecto.git &&
      detalleProyecto.git.commits && detalleProyecto.git.commits[0]
      ? (detalleProyecto.git.commits[0].hash || detalleProyecto.git.commits[0].corto || "") : "";
    const estadoInicial = p.estado === "entregado" ? "terminado"
      : p.estado === "pausado" ? "pausado" : "en_progreso";

    openModal(
      '<div class="modal-head"><div class="modal-head-main">' +
      '<div class="modal-title">Dejar proyecto</div>' +
      '<div class="modal-sub">' + esc(p.nombre) + " · guarda el traspaso en Supabase y en RELEVO.md</div>" +
      "</div>" +
      '<button class="modal-close" data-action="close-modal" aria-label="Cerrar">✕</button></div>' +
      '<form id="relevo-form" data-proyecto="' + esc(p.id) + '">' +
      '<div class="modal-body">' +
      '<div class="notice notice--info"><strong>Cómo funciona.</strong> Al guardar se crea un relevo en Supabase. ' +
      "Si el orquestador está arriba, también escribe <code>RELEVO.md</code> en la ruta local del proyecto.</div>" +
      (!ruta ? '<div class="notice notice--warn"><strong>Sin ruta local.</strong> El relevo se guardará en Supabase, ' +
        "pero no se podrá escribir RELEVO.md. Configúrala en «Editar proyecto».</div>" : "") +
      '<div class="form-grid">' +
      '<div class="field"><label for="rel-estado">Estado</label><select id="rel-estado" name="estado">' +
      options(RELEVO_ESTADOS, RELEVO_LABEL, estadoInicial) + "</select></div>" +
      '<div class="field"><label for="rel-ruta">Ruta local</label><input id="rel-ruta" value="' + esc(ruta) + '" readonly></div>' +
      '<div class="field field--full"><label for="rel-hecho">Qué hice</label>' +
      '<textarea id="rel-hecho" name="hecho" placeholder="Resumen de lo que quedó funcionando…"></textarea></div>' +
      '<div class="field field--full"><label for="rel-falta">Qué falta</label>' +
      '<textarea id="rel-falta" name="pendientes" placeholder="Tareas concretas que siguen abiertas…"></textarea></div>' +
      '<div class="field field--full"><label for="rel-decisiones">Decisiones</label>' +
      '<textarea id="rel-decisiones" name="decisiones" placeholder="Decisiones técnicas o de producto que no hay que reabrir…"></textarea></div>' +
      '<div class="field field--full"><label for="rel-siguiente">Siguiente paso</label>' +
      '<textarea id="rel-siguiente" name="siguiente" placeholder="Lo primero que debe hacer quien retome…"></textarea></div>' +
      '<input type="hidden" id="rel-rama" name="rama" value="' + esc(rama) + '">' +
      '<input type="hidden" id="rel-commit" name="commit" value="' + esc(commit) + '">' +
      '<p id="relevo-form-error" class="form-error" hidden></p>' +
      "</div></div>" +
      '<div class="modal-foot">' +
      '<button type="button" class="btn btn--outline" data-action="generar-borrador"' + (ruta ? "" : " disabled") + ">Generar borrador</button>" +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn--ghost" data-action="close-modal">Cancelar</button>' +
      '<button type="submit" class="btn btn--primary">Guardar relevo</button>' +
      "</div></form>",
      "wide"
    );
  }

  async function generarBorradorRelevo(btn) {
    const form = $("#relevo-form");
    if (!form) return;
    const p = state.proyectos.find((x) => String(x.id) === String(form.dataset.proyecto));
    if (!p) return;
    const ruta = rutaEfectivaProyecto(p);
    if (!ruta) {
      toast("Configura la ruta local del proyecto antes de generar el borrador.", true);
      return;
    }
    const campos = ["rel-hecho", "rel-falta", "rel-decisiones", "rel-siguiente"];
    const tieneTexto = campos.some((id) => {
      const el = $("#" + id);
      return el && el.value.trim();
    });
    if (tieneTexto && !window.confirm("El borrador reemplazará lo que escribiste. ¿Continuar?")) return;

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generando…";
    try {
      const datos = await fetchOrquestador("/relevo/borrador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruta })
      }, 60000);
      const b = datos.borrador || {};
      const set = (id, value) => {
        const el = $("#" + id);
        if (el && value !== undefined && value !== null) el.value = String(value);
      };
      if (RELEVO_ESTADOS.includes(b.estado)) $("#rel-estado").value = b.estado;
      set("rel-hecho", b.hecho);
      set("rel-falta", b.pendientes);
      set("rel-decisiones", b.decisiones);
      set("rel-siguiente", b.siguiente);
      set("rel-rama", b.rama);
      set("rel-commit", b.commit);
      toast("Borrador generado. Revísalo antes de guardar.");
    } catch (error) {
      const message = mensajeOrquestador(error);
      const errorEl = $("#relevo-form-error");
      if (errorEl) {
        errorEl.textContent = "No se pudo generar el borrador: " + message;
        errorEl.hidden = false;
      }
      toast("No se pudo generar el borrador. Puedes escribirlo a mano.", true);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function formatearRelevoMd(p, datos) {
    const linea = (v) => String(v || "").trim() || "(sin detalle)";
    return "# Relevo — " + p.nombre + "\n\n" +
      "- **Fecha:** " + fmtDateTime(new Date().toISOString()) + "\n" +
      "- **Autor:** " + state.perfil.nombre + "\n" +
      "- **Estado:** " + (RELEVO_LABEL[datos.estado] || datos.estado) + "\n" +
      "- **Rama:** " + (datos.rama || "sin registrar") + "\n" +
      "- **Commit:** " + (datos.commit || "sin registrar") + "\n\n" +
      "## Qué hice\n\n" + linea(datos.hecho) + "\n\n" +
      "## Qué falta\n\n" + linea(datos.pendientes) + "\n\n" +
      "## Decisiones\n\n" + linea(datos.decisiones) + "\n\n" +
      "## Siguiente paso\n\n" + linea(datos.siguiente) + "\n\n" +
      "_Actualizado desde el panel de la agencia._\n";
  }

  async function guardarRelevo(form) {
    const fd = new FormData(form);
    const id = form.dataset.proyecto;
    const p = state.proyectos.find((x) => String(x.id) === String(id));
    if (!p) return;

    const datos = {
      estado: String(fd.get("estado") || "en_progreso"),
      hecho: String(fd.get("hecho") || "").trim(),
      pendientes: String(fd.get("pendientes") || "").trim(),
      decisiones: String(fd.get("decisiones") || "").trim(),
      siguiente: String(fd.get("siguiente") || "").trim(),
      rama: String(fd.get("rama") || "").trim() || null,
      commit: String(fd.get("commit") || "").trim() || null
    };
    const errorEl = $("#relevo-form-error");
    const submit = form.querySelector('button[type="submit"]');

    if (!datos.hecho && !datos.pendientes) {
      if (errorEl) {
        errorEl.textContent = "Escribe al menos qué hiciste o qué falta.";
        errorEl.hidden = false;
      }
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Guardando…";
    }

    try {
      const { error } = await db.from("relevos").insert({
        proyecto_id: p.id,
        autor: state.perfil.user_id,
        estado: datos.estado,
        hecho: datos.hecho,
        pendientes: datos.pendientes,
        decisiones: datos.decisiones,
        siguiente: datos.siguiente,
        rama: datos.rama,
        commit: datos.commit
      });
      if (error) throw error;
    } catch (error) {
      if (errorEl) {
        errorEl.textContent = errMsg(error);
        errorEl.hidden = false;
      }
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Guardar relevo";
      }
      return;
    }

    const ruta = rutaEfectivaProyecto(p);
    let archivoError = "";
    if (ruta) {
      try {
        await fetchOrquestador("/relevo/archivo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ruta, contenido: formatearRelevoMd(p, datos) })
        }, 30000);
      } catch (error) {
        archivoError = mensajeOrquestador(error);
      }
    } else {
      archivoError = "El proyecto no tiene ruta local configurada.";
    }

    closeModal();
    if (archivoError) {
      toast("Relevo guardado en Supabase. No se pudo escribir RELEVO.md: " + archivoError, true);
    } else {
      toast("Relevo guardado y RELEVO.md actualizado.");
    }
    openProyectoDetalle(p.id, { tab: "relevo" });
  }

  function textoRetomar(p, r) {
    const autor = nombrePerfil(r.autor);
    const linea = (v) => String(v || "").trim() || "(sin registrar)";
    return "Estás retomando el proyecto «" + p.nombre + "».\n\n" +
      "Lee RELEVO.md y docs/relevos/ antes de tocar código.\n\n" +
      "Estado: " + (RELEVO_LABEL[r.estado] || r.estado || "sin registrar") + "\n" +
      "Qué se hizo: " + linea(r.hecho) + "\n" +
      "Pendientes: " + linea(r.pendientes) + "\n" +
      "Decisiones: " + linea(r.decisiones) + "\n" +
      "Siguiente paso: " + linea(r.siguiente) + "\n" +
      "Rama: " + (r.rama || "sin registrar") + "\n" +
      "Commit: " + (r.commit || "sin registrar") + "\n" +
      "Relevo de: " + autor + " · " + fmtDateTime(r.created_at) + "\n\n" +
      "No rehagas lo hecho. Continúa desde el siguiente paso y anota lo que decidas en el próximo relevo.";
  }

  async function abrirRetomar(id) {
    const p = state.proyectos.find((x) => String(x.id) === String(id));
    if (!p) return;
    let relevo = null;
    if (detalleProyecto && String(detalleProyecto.proyecto.id) === String(p.id) && detalleProyecto.relevos.length) {
      relevo = detalleProyecto.relevos[0];
    } else {
      try {
        const { data, error } = await db.from("relevos").select("*")
          .eq("proyecto_id", p.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        relevo = (data || [])[0];
      } catch (error) {
        toast("No se pudo cargar el relevo: " + errMsg(error), true);
        return;
      }
    }
    if (!relevo) {
      toast("Este proyecto todavía no tiene un relevo para retomar.", true);
      return;
    }

    openModal(
      '<div class="modal-head"><div class="modal-head-main">' +
      '<div class="modal-title">Retomar ' + esc(p.nombre) + "</div>" +
      '<div class="modal-sub">Copia este texto y pégalo en el chat de tu agente.</div></div>' +
      '<button class="modal-close" data-action="close-modal" aria-label="Cerrar">✕</button></div>' +
      '<div class="modal-body">' +
      '<textarea id="retomar-texto" class="copy-box" readonly rows="16" aria-label="Texto para retomar el proyecto">' +
      esc(textoRetomar(p, relevo)) + "</textarea>" +
      "</div>" +
      '<div class="modal-foot"><button class="btn btn--ghost" data-action="close-modal">Cerrar</button>' +
      '<button class="btn btn--primary" data-action="copiar-retomar">Copiar texto</button></div>',
      "wide"
    );
  }

  async function copiarRetomar() {
    const area = $("#retomar-texto");
    if (!area) return;
    const texto = area.value;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(texto);
      } else {
        area.focus();
        area.select();
        if (!document.execCommand("copy")) throw new Error("El navegador bloqueó el portapapeles.");
      }
      toast("Texto copiado. Pégalo en el chat del agente que retoma.");
    } catch (error) {
      area.focus();
      area.select();
      toast("No se pudo copiar automáticamente: el texto quedó seleccionado.", true);
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
      '<div class="modal-title">Hacer todo</div>' +
      '<div class="modal-sub">leads → webs → seguimientos → respaldo. El envío de correos no se toca.</div></div>' +
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
      const res = await fetch(ORQUESTADOR_URL + "/todo?esperar=0", { method: "POST" });
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
        btn.textContent = "Hacer todo";
      }
      toast("Abre el centro de control con `npm run orquestador`", true);
      return;
    }

    const terminar = (datos) => {
      detenerPoll();
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Hacer todo";
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
          btn.textContent = "Hacer todo";
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
    detalleProyecto = null;
    state.mensajeAbiertoId = null;
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
        stopMensajesPoll();
        state.mensajes = [];
        state.mensajesError = "";
        updateMensajesBadge();
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
      case "abrir-mensajes": abrirMensajes(); break;
      case "mensajes-tab": cambiarTabMensajes(el.dataset.tab); break;
      case "abrir-mensaje": abrirMensaje(el.dataset.id); break;
      case "refrescar-mensajes": await loadMensajes(); break;
      case "detalle-proyecto": openProyectoDetalle(el.dataset.id); break;
      case "detalle-tab": {
        if (!detalleProyecto) break;
        detalleProyecto.tab = el.dataset.tab === "relevo" ? "relevo" : "git";
        renderDetallePanel();
        break;
      }
      case "guardar-ruta-detalle": guardarRutaDetalle(); break;
      case "detalle-reintentar-git": await cargarGitDetalle(); break;
      case "detalle-reintentar-relevos": await cargarRelevosDetalle(); break;
      case "resumir-proyecto": await resumirDetalle(); break;
      case "detalle-dejar": abrirDejarProyecto(el.dataset.id); break;
      case "detalle-retomar": await abrirRetomar(el.dataset.id); break;
      case "detalle-editar": {
        detalleProyecto = null;
        openProyectoModal(el.dataset.id);
        break;
      }
      case "generar-borrador": await generarBorradorRelevo(el); break;
      case "copiar-retomar": await copiarRetomar(); break;
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
    } else if (event.target.id === "mensaje-form") {
      event.preventDefault();
      await enviarMensaje(event.target);
    } else if (event.target.id === "relevo-form") {
      event.preventDefault();
      await guardarRelevo(event.target);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
    if ((event.key === "Enter" || event.key === " ") &&
      event.target && event.target.matches &&
      event.target.matches('[role="button"][data-action]')) {
      event.preventDefault();
      event.target.click();
    }
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
