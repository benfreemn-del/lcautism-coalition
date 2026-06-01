/* =========================================================================
   LCAC CRM — single-file dashboard app
   No build step. Uses the Supabase JS client from the CDN (see index.html).
   All reads/writes go through Supabase and respect Row Level Security:
   the anon key alone returns nothing; data appears only after sign-in.
   ========================================================================= */

const SUPABASE_URL = "https://byxuapnhhuxekamgnwaf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_HP0LFR18xtQuMtqAYAHwmw_Tkx2QgJt";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

// Escape user-provided text before injecting into innerHTML
function esc(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const dollars = (cents) =>
  cents == null ? "" : "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toCents = (str) => {
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : Math.round(n * 100);
};

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(d.length <= 10 ? d + "T00:00:00" : d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const startOfYearISO = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

let toastTimer;
function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " toast-error" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), isError ? 6000 : 3500);
}

// Friendly wrapper around Supabase calls
async function run(promise, errPrefix) {
  const { data, error } = await promise;
  if (error) {
    console.error(error);
    toast((errPrefix ? errPrefix + ": " : "") + (error.message || "Something went wrong."), true);
    throw error;
  }
  return data;
}

/* ---------------------------------------------------------------------------
   Modal
   ------------------------------------------------------------------------- */
function openModal(node) {
  const c = $("#modal-content");
  c.innerHTML = "";
  c.appendChild(node);
  $("#modal-overlay").hidden = false;
}
function closeModal() {
  $("#modal-overlay").hidden = true;
  $("#modal-content").innerHTML = "";
}
$("#modal-close").addEventListener("click", closeModal);
$("#modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#modal-overlay").hidden) closeModal();
});

// Build a labeled field
function field(label, control, full = false) {
  return el("div", { class: "field" + (full ? " full" : "") }, [
    el("label", { text: label }),
    control,
  ]);
}
function input(attrs) { return el("input", attrs); }
function select(name, options, value) {
  const s = el("select", { name });
  options.forEach((o) => {
    const opt = el("option", { value: o.value, text: o.label });
    if (o.value === value) opt.selected = true;
    s.appendChild(opt);
  });
  return s;
}
function checkbox(name, label, checked) {
  const cb = el("input", { type: "checkbox", name, id: "cb-" + name });
  cb.checked = !!checked;
  return el("div", { class: "checkbox-row" }, [cb, el("label", { for: "cb-" + name, text: label })]);
}

const CONTACT_TYPES = ["family", "donor", "volunteer", "partner", "board", "staff", "community", "other"];
const LANGS = [{ value: "en", label: "English" }, { value: "es", label: "Spanish" }, { value: "other", label: "Other" }];
const DONATION_METHODS = ["cash", "check", "card", "stripe", "in_kind", "grant", "other"];
const GRANT_STAGES = ["prospect", "drafting", "submitted", "awarded", "declined", "reporting", "closed"];
const INTERACTION_TYPES = ["note", "call", "email", "meeting", "thank_you", "event", "other"];
const opts = (arr) => arr.map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));

/* =========================================================================
   AUTH
   ========================================================================= */
const loginForm = $("#login-form");
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#login-btn");
  const errBox = $("#login-error");
  errBox.hidden = true;
  btn.disabled = true;
  btn.textContent = "Signing in...";
  const { error } = await sb.auth.signInWithPassword({
    email: $("#login-email").value.trim(),
    password: $("#login-password").value,
  });
  btn.disabled = false;
  btn.textContent = "Sign In";
  if (error) {
    errBox.textContent = "Could not sign in. Please check your email and password.";
    errBox.hidden = false;
  }
});

$("#signout-btn").addEventListener("click", async () => {
  await sb.auth.signOut();
});

function showLogin() {
  $("#login-screen").style.display = "flex";
  $("#app").hidden = true;
}
function showApp(session) {
  $("#login-screen").style.display = "none";
  $("#app").hidden = false;
  $("#user-email").textContent = session.user.email;
  $("#login-form").reset();
  switchView(currentView || "dashboard");
  loadRepliesBadge();
}

sb.auth.onAuthStateChange((_event, session) => {
  if (session) showApp(session);
  else showLogin();
});
// Initial check
sb.auth.getSession().then(({ data }) => {
  if (data.session) showApp(data.session);
  else showLogin();
});

/* =========================================================================
   NAVIGATION
   ========================================================================= */
let currentView = "dashboard";
const VIEWS = {
  dashboard: renderDashboard,
  contacts: renderContacts,
  donations: renderDonations,
  inbox: renderInbox,
  replies: renderReplies,
  reminders: renderReminders,
  grants: renderGrants,
};

function switchView(view) {
  currentView = view;
  $$(".navlink").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
  $$(".view").forEach((v) => (v.hidden = true));
  const container = $("#view-" + view);
  container.hidden = false;
  $("#sidenav").classList.remove("open");
  VIEWS[view](container);
}

$$(".navlink").forEach((btn) =>
  btn.addEventListener("click", () => switchView(btn.dataset.view))
);
$("#nav-toggle").addEventListener("click", () => $("#sidenav").classList.toggle("open"));

function setLoading(container, title) {
  container.innerHTML = "";
  if (title) container.appendChild(el("h2", { class: "page-title", text: title }));
  container.appendChild(el("div", { class: "loading", text: "Loading..." }));
}

/* =========================================================================
   EMAIL REPLIES (AI-drafted replies waiting for Michelle to approve)
   ========================================================================= */
function monthKey() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function updateRepliesBadge(n) {
  const b = $("#replies-badge");
  if (!b) return;
  if (n > 0) { b.textContent = String(n); b.hidden = false; }
  else b.hidden = true;
}

function loadRepliesBadge() {
  sb.from("queued_replies").select("id").eq("status", "pending")
    .then(({ data }) => { if (data) updateRepliesBadge(data.length); })
    .catch(() => {});
}

async function renderReplies(c) {
  setLoading(c, "Email Replies");
  let pending, cost, sent;
  try {
    [pending, cost, sent] = await Promise.all([
      run(sb.from("queued_replies").select("*").eq("status", "pending").order("created_at", { ascending: false }), "Loading drafts"),
      run(sb.from("system_costs").select("*").eq("month", monthKey()).maybeSingle(), "Loading usage"),
      run(sb.from("queued_replies").select("*").eq("status", "sent").order("sent_at", { ascending: false }).limit(10), "Loading sent"),
    ]);
  } catch (e) {
    c.innerHTML = "";
    c.appendChild(el("h2", { class: "page-title", text: "Email Replies" }));
    c.appendChild(el("div", { class: "card" }, [el("p", { class: "muted", text: "This feature isn't turned on yet. Once the email co-pilot is set up, draft replies will appear here." })]));
    return;
  }

  updateRepliesBadge(pending.length);

  c.innerHTML = "";
  c.appendChild(el("h2", { class: "page-title", text: "Email Replies" }));
  c.appendChild(el("p", { class: "page-sub", text: "AI-written draft replies in your voice. Read each one, edit if you like, then Approve & Send. Nothing sends until you approve it." }));

  const spent = cost && cost.total_usd != null ? Number(cost.total_usd) : 0;
  const count = cost && cost.draft_count != null ? cost.draft_count : 0;
  c.appendChild(el("div", { class: "muted", style: "margin-bottom:12px;font-size:14px", text: `This month: $${spent.toFixed(2)} across ${count} draft${count === 1 ? "" : "s"}.` }));

  if (pending.length === 0) {
    c.appendChild(el("div", { class: "card" }, [el("p", { class: "muted", text: "No drafts waiting. When a new email arrives, a ready-to-send reply will appear here." })]));
  }

  pending.forEach((r) => {
    const card = el("div", { class: "card" });
    card.appendChild(el("div", {}, [
      el("strong", { text: r.from_name || r.from_email || "(unknown sender)" }),
      el("span", { class: "muted", text: r.from_email ? ` — ${r.from_email}` : "" }),
    ]));
    card.appendChild(el("div", { class: "muted", style: "font-size:14px;margin-bottom:6px", text: `${r.inbox ? r.inbox + "@ · " : ""}${r.subject ? esc(r.subject) + " · " : ""}${fmtDateTime(r.created_at)}` }));

    if (r.body_text) {
      const orig = el("details", { style: "margin-bottom:8px" });
      orig.appendChild(el("summary", { class: "muted", style: "cursor:pointer;font-size:13px", text: "Show original message" }));
      orig.appendChild(el("div", { class: "muted", style: "white-space:pre-wrap;font-size:13px;margin-top:6px", text: r.body_text }));
      card.appendChild(orig);
    }

    const ta = el("textarea", { class: "reply-draft", rows: "8", style: "width:100%" });
    ta.value = r.edited_body || r.draft_body || "";
    card.appendChild(ta);

    const actions = el("div", { class: "form-actions", style: "justify-content:flex-start;flex-wrap:wrap" });
    const approveBtn = el("button", { class: "btn btn-success btn-small" }, "Approve & Send");
    approveBtn.addEventListener("click", async () => {
      const body = ta.value.trim();
      if (!body) { toast("The reply is empty.", true); return; }
      approveBtn.disabled = true;
      try {
        await run(sb.from("queued_replies").update({
          status: "approved",
          edited_body: body,
          approved_at: new Date().toISOString(),
        }).eq("id", r.id), "Approving");
        if (r.contact_id) {
          await sb.from("interactions").insert({
            contact_id: r.contact_id,
            type: "email",
            summary: "Replied to: " + (r.subject || "(no subject)"),
            occurred_at: new Date().toISOString(),
          });
        }
        toast("Approved — it'll send within a few minutes.");
        switchView("replies");
      } catch (err) { approveBtn.disabled = false; }
    });
    const discardBtn = el("button", { class: "btn btn-ghost btn-small" }, "Discard");
    discardBtn.addEventListener("click", async () => {
      discardBtn.disabled = true;
      try {
        await run(sb.from("queued_replies").update({ status: "discarded" }).eq("id", r.id), "Discarding");
        toast("Draft discarded.");
        switchView("replies");
      } catch (err) { discardBtn.disabled = false; }
    });
    actions.appendChild(approveBtn);
    actions.appendChild(discardBtn);
    card.appendChild(actions);
    c.appendChild(card);
  });

  if (sent && sent.length) {
    const sd = el("details", { style: "margin-top:16px" });
    sd.appendChild(el("summary", { class: "muted", style: "cursor:pointer", text: `Recently sent (${sent.length})` }));
    const list = el("div", { class: "card", style: "margin-top:8px" });
    sent.forEach((s) => {
      list.appendChild(el("div", { class: "attn-item", style: "flex-direction:column;align-items:flex-start;gap:2px" }, [
        el("div", {}, [el("strong", { text: s.from_name || s.from_email || "(unknown)" }), el("span", { class: "muted", text: s.subject ? " — " + esc(s.subject) : "" })]),
        el("div", { class: "muted", style: "font-size:13px", text: "Sent " + fmtDateTime(s.sent_at) }),
      ]));
    });
    sd.appendChild(list);
    c.appendChild(sd);
  }
}

/* =========================================================================
   DASHBOARD
   ========================================================================= */
async function renderDashboard(c) {
  setLoading(c, "Dashboard");
  try {
    const [cCountRes, donations, reminders, rsvps, forms, grants, unthanked] = await Promise.all([
      sb.from("contacts").select("id", { count: "exact", head: true }),
      run(sb.from("donations").select("amount_cents, donated_at").gte("donated_at", startOfYearISO()), "Loading donations"),
      run(sb.from("reminders").select("id, title, due_on, done").eq("done", false), "Loading reminders"),
      run(sb.from("event_rsvps").select("id").eq("processed", false), "Loading RSVPs"),
      run(sb.from("contact_form_submissions").select("id").eq("processed", false), "Loading submissions"),
      run(sb.from("grants").select("id, stage, title, deadline"), "Loading grants"),
      run(sb.from("donations").select("id, amount_cents, donated_at, contact_id").is("thanked_at", null), "Loading donations"),
    ]);

    const contactsTotal = cCountRes.count ?? 0;
    const ytd = donations.reduce((s, d) => s + (d.amount_cents || 0), 0);
    const openReminders = reminders.length;
    const unprocessed = rsvps.length + forms.length;

    const byStage = {};
    grants.forEach((g) => (byStage[g.stage] = (byStage[g.stage] || 0) + 1));

    updateInboxBadge(unprocessed);

    c.innerHTML = "";
    c.appendChild(el("h2", { class: "page-title", text: "Dashboard" }));
    c.appendChild(el("p", { class: "page-sub", text: "A quick look at how things stand today." }));

    // Stat tiles
    const stats = el("div", { class: "stat-grid" });
    const tile = (num, lbl) => el("div", { class: "stat" }, [el("div", { class: "num", text: num }), el("div", { class: "lbl", text: lbl })]);
    stats.appendChild(tile(String(contactsTotal), "Total contacts"));
    stats.appendChild(tile(dollars(ytd), "Donations this year"));
    stats.appendChild(tile(String(openReminders), "Open reminders"));
    stats.appendChild(tile(String(unprocessed), "Inbox to process"));
    c.appendChild(stats);

    // Grants by stage
    const gcard = el("div", { class: "card" });
    gcard.appendChild(el("h3", { text: "Grants by stage" }));
    const row = el("div", { class: "stage-row" });
    if (grants.length === 0) row.appendChild(el("span", { class: "muted", text: "No grants yet." }));
    GRANT_STAGES.forEach((st) => {
      if (byStage[st]) row.appendChild(el("span", { class: "stage-pill", html: `${esc(st)} <b>${byStage[st]}</b>` }));
    });
    gcard.appendChild(row);
    c.appendChild(gcard);

    // Needs attention today
    const acard = el("div", { class: "card" });
    acard.appendChild(el("h3", { text: "Needs attention today" }));
    const today = todayISO();
    const items = [];

    reminders
      .filter((r) => r.due_on && r.due_on <= today)
      .sort((a, b) => (a.due_on || "").localeCompare(b.due_on || ""))
      .forEach((r) => {
        const overdue = r.due_on < today;
        items.push({
          icon: "&#9200;",
          html: `Reminder: <b>${esc(r.title)}</b> ${overdue ? `<span class="attn-overdue">(overdue ${esc(fmtDate(r.due_on))})</span>` : "(due today)"}`,
          go: () => switchView("reminders"),
        });
      });

    if (unprocessed > 0)
      items.push({ icon: "&#128229;", html: `<b>${unprocessed}</b> new message${unprocessed === 1 ? "" : "s"} in the Inbox to review`, go: () => switchView("inbox") });

    if (unthanked.length > 0)
      items.push({ icon: "&#128140;", html: `<b>${unthanked.length}</b> donation${unthanked.length === 1 ? "" : "s"} still need a thank-you`, go: () => switchView("donations") });

    if (items.length === 0) {
      acard.appendChild(el("p", { class: "muted", text: "All caught up. Nothing needs attention right now." }));
    } else {
      items.forEach((it) => {
        const node = el("div", { class: "attn-item clickable", onclick: it.go, style: "cursor:pointer" }, [
          el("span", { class: "attn-icon", html: it.icon }),
          el("span", { html: it.html }),
        ]);
        acard.appendChild(node);
      });
    }
    c.appendChild(acard);
  } catch (e) {
    c.appendChild(el("p", { class: "error-text", text: "Could not load the dashboard. Please try again." }));
  }
}

function updateInboxBadge(n) {
  const b = $("#inbox-badge");
  if (n > 0) { b.textContent = n; b.hidden = false; }
  else b.hidden = true;
}

/* =========================================================================
   CONTACTS
   ========================================================================= */
let contactsCache = [];

async function renderContacts(c) {
  setLoading(c, "Contacts");
  try {
    contactsCache = await run(
      sb.from("contacts").select("*").order("last_name", { ascending: true }).order("first_name", { ascending: true }),
      "Loading contacts"
    );
  } catch (e) { return; }

  c.innerHTML = "";
  c.appendChild(
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("h2", { class: "page-title", text: "Contacts" }),
        el("p", { class: "page-sub", text: "Everyone in your community. Click a name to see details." }),
      ]),
      el("button", { class: "btn btn-primary", onclick: () => openContactForm() }, "+ Add contact"),
    ])
  );

  const search = input({ type: "search", placeholder: "Search name or email...", id: "contact-search" });
  const typeFilter = select("typeFilter", [{ value: "", label: "All types" }, ...opts(CONTACT_TYPES)], "");
  c.appendChild(el("div", { class: "toolbar" }, [search, typeFilter]));

  const listWrap = el("div", { class: "list-wrap card", style: "padding:0" });
  c.appendChild(listWrap);

  function draw() {
    const q = search.value.trim().toLowerCase();
    const ft = typeFilter.value;
    const rows = contactsCache.filter((p) => {
      if (ft && p.contact_type !== ft) return false;
      if (!q) return true;
      const hay = `${p.full_name || ""} ${p.first_name || ""} ${p.last_name || ""} ${p.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
    listWrap.innerHTML = "";
    if (rows.length === 0) {
      listWrap.appendChild(el("div", { class: "empty", text: "No contacts match your search." }));
      return;
    }
    const table = el("table");
    table.appendChild(el("thead", {}, el("tr", {}, [
      el("th", { text: "Name" }), el("th", { text: "Type" }), el("th", { text: "Email" }), el("th", { text: "Phone" }),
    ])));
    const tbody = el("tbody");
    rows.forEach((p) => {
      const tr = el("tr", { class: "clickable", onclick: () => openContactDetail(p.id) }, [
        el("td", {}, [
          el("strong", { text: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "(no name)" }),
          p.do_not_contact ? el("span", { class: "tag danger", text: "Do not contact", style: "margin-left:8px" }) : null,
        ]),
        el("td", {}, el("span", { class: "tag", text: p.contact_type || "—" })),
        el("td", { text: p.email || "—" }),
        el("td", { class: "nowrap", text: p.phone || "—" }),
      ]);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    listWrap.appendChild(table);
  }
  search.addEventListener("input", draw);
  typeFilter.addEventListener("change", draw);
  draw();
}

function readForm(formEl) {
  const data = {};
  $$("input, select, textarea", formEl).forEach((f) => {
    if (!f.name) return;
    if (f.type === "checkbox") data[f.name] = f.checked;
    else data[f.name] = f.value === "" ? null : f.value;
  });
  return data;
}

function openContactForm(existing = null) {
  const p = existing || {};
  const form = el("form", { class: "contact-form" });
  form.appendChild(el("h3", { text: existing ? "Edit contact" : "Add a contact" }));

  const grid = el("div", { class: "form-grid" });
  grid.appendChild(field("First name", input({ name: "first_name", value: p.first_name || "" })));
  grid.appendChild(field("Last name", input({ name: "last_name", value: p.last_name || "" })));
  grid.appendChild(field("Email", input({ name: "email", type: "email", value: p.email || "" })));
  grid.appendChild(field("Phone", input({ name: "phone", value: p.phone || "" })));
  grid.appendChild(field("Type", select("contact_type", opts(CONTACT_TYPES), p.contact_type || "family")));
  grid.appendChild(field("Preferred language", select("preferred_language", LANGS, p.preferred_language || "en")));
  grid.appendChild(field("Notes", el("textarea", { name: "notes", text: p.notes || "" }), true));
  grid.appendChild(el("div", { class: "field full" }, [
    checkbox("email_opt_in", "OK to send emails", p.email_opt_in),
    checkbox("do_not_contact", "Do not contact", p.do_not_contact),
  ]));
  form.appendChild(grid);

  const saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, existing ? "Save changes" : "Add contact");
  form.appendChild(el("div", { class: "form-actions" }, [
    el("button", { class: "btn btn-ghost", type: "button", onclick: closeModal }, "Cancel"),
    saveBtn,
  ]));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = readForm(form);
    if (!payload.first_name && !payload.last_name) { toast("Please enter at least a first or last name.", true); return; }
    saveBtn.disabled = true;
    try {
      if (existing) await run(sb.from("contacts").update(payload).eq("id", existing.id), "Saving contact");
      else await run(sb.from("contacts").insert(payload), "Adding contact");
      toast(existing ? "Contact updated." : "Contact added.");
      closeModal();
      switchView("contacts");
    } catch (err) { saveBtn.disabled = false; }
  });

  openModal(form);
}

async function openContactDetail(id) {
  const wrap = el("div");
  wrap.appendChild(el("div", { class: "loading", text: "Loading..." }));
  openModal(wrap);
  try {
    const [p, donations, interactions, reminders] = await Promise.all([
      run(sb.from("contacts").select("*").eq("id", id).single(), "Loading contact"),
      run(sb.from("donations").select("*").eq("contact_id", id).order("donated_at", { ascending: false }), "Loading donations"),
      run(sb.from("interactions").select("*").eq("contact_id", id).order("occurred_at", { ascending: false }), "Loading history"),
      run(sb.from("reminders").select("*").eq("contact_id", id).eq("done", false).order("due_on", { ascending: true }), "Loading reminders"),
    ]);

    wrap.innerHTML = "";
    const name = p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "(no name)";
    wrap.appendChild(el("h3", { text: name }));

    const dl = el("dl", { class: "kv" });
    const kv = (k, v) => { dl.appendChild(el("dt", { text: k })); dl.appendChild(el("dd", { text: v || "—" })); };
    kv("Type", p.contact_type);
    kv("Email", p.email);
    kv("Phone", p.phone);
    kv("Language", (LANGS.find((l) => l.value === p.preferred_language) || {}).label || p.preferred_language);
    kv("Email OK", p.email_opt_in ? "Yes" : "No");
    if (p.do_not_contact) kv("Do not contact", "Yes");
    if (p.notes) kv("Notes", p.notes);
    wrap.appendChild(dl);

    wrap.appendChild(el("div", { class: "form-actions", style: "justify-content:flex-start;margin-top:16px;flex-wrap:wrap" }, [
      el("button", { class: "btn btn-ghost btn-small", onclick: () => openContactForm(p) }, "Edit"),
      el("button", { class: "btn btn-ghost btn-small", onclick: () => openInteractionForm(id, name) }, "Log interaction"),
      el("button", { class: "btn btn-ghost btn-small", onclick: () => openReminderForm({ contact_id: id, contactName: name }) }, "Add reminder"),
    ]));

    // Donations
    const dsec = el("div", { class: "detail-section" });
    dsec.appendChild(el("h4", { text: "Donations" }));
    if (donations.length === 0) dsec.appendChild(el("p", { class: "muted", text: "No donations recorded." }));
    else {
      const ul = el("ul", { class: "mini-list" });
      donations.forEach((d) => ul.appendChild(el("li", {}, [
        el("strong", { text: dollars(d.amount_cents) }),
        el("span", { text: ` — ${fmtDate(d.donated_at)} (${(d.method || "").replace(/_/g, " ")})` }),
        d.thanked_at ? el("span", { class: "tag good", text: "thanked", style: "margin-left:8px" }) : el("span", { class: "tag warn", text: "not thanked", style: "margin-left:8px" }),
      ])));
      dsec.appendChild(ul);
    }
    wrap.appendChild(dsec);

    // Open reminders
    if (reminders.length) {
      const rsec = el("div", { class: "detail-section" });
      rsec.appendChild(el("h4", { text: "Open reminders" }));
      const ul = el("ul", { class: "mini-list" });
      reminders.forEach((r) => ul.appendChild(el("li", {}, [
        el("strong", { text: r.title }), el("span", { class: "muted", text: r.due_on ? ` — due ${fmtDate(r.due_on)}` : "" }),
      ])));
      rsec.appendChild(ul);
      wrap.appendChild(rsec);
    }

    // Interactions
    const isec = el("div", { class: "detail-section" });
    isec.appendChild(el("h4", { text: "History" }));
    if (interactions.length === 0) isec.appendChild(el("p", { class: "muted", text: "No interactions logged yet." }));
    else {
      const ul = el("ul", { class: "mini-list" });
      interactions.forEach((i) => ul.appendChild(el("li", {}, [
        el("span", { class: "tag", text: (i.type || "note").replace(/_/g, " ") }),
        el("span", { text: " " + (i.summary || "") }),
        el("div", { class: "muted", style: "font-size:13px", text: fmtDateTime(i.occurred_at) }),
      ])));
      isec.appendChild(ul);
    }
    wrap.appendChild(isec);
  } catch (e) {
    wrap.innerHTML = "";
    wrap.appendChild(el("p", { class: "error-text", text: "Could not load this contact." }));
  }
}

function openInteractionForm(contactId, contactName) {
  const form = el("form");
  form.appendChild(el("h3", { text: "Log an interaction" }));
  form.appendChild(el("p", { class: "muted", text: "With " + contactName }));
  form.appendChild(field("Type", select("type", opts(INTERACTION_TYPES), "note")));
  form.appendChild(field("What happened?", el("textarea", { name: "summary", placeholder: "Short summary of the call, email, or meeting..." })));
  form.appendChild(field("Date & time", input({ name: "occurred_at", type: "datetime-local", value: new Date().toISOString().slice(0, 16) })));
  const saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, "Save");
  form.appendChild(el("div", { class: "form-actions" }, [el("button", { class: "btn btn-ghost", type: "button", onclick: () => openContactDetail(contactId) }, "Cancel"), saveBtn]));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = readForm(form);
    data.contact_id = contactId;
    if (data.occurred_at) data.occurred_at = new Date(data.occurred_at).toISOString();
    saveBtn.disabled = true;
    try {
      await run(sb.from("interactions").insert(data), "Saving interaction");
      toast("Interaction logged.");
      openContactDetail(contactId);
    } catch (err) { saveBtn.disabled = false; }
  });
  openModal(form);
}

/* =========================================================================
   DONATIONS
   ========================================================================= */
async function renderDonations(c) {
  setLoading(c, "Donations");
  let donations, contacts;
  try {
    [donations, contacts] = await Promise.all([
      run(sb.from("donations").select("*, contacts(full_name)").order("donated_at", { ascending: false }), "Loading donations"),
      run(sb.from("contacts").select("id, full_name, first_name, last_name").order("last_name"), "Loading contacts"),
    ]);
  } catch (e) { return; }

  const total = donations.reduce((s, d) => s + (d.amount_cents || 0), 0);
  const unthanked = donations.filter((d) => !d.thanked_at).length;

  c.innerHTML = "";
  c.appendChild(el("div", { class: "page-head" }, [
    el("div", {}, [
      el("h2", { class: "page-title", text: "Donations" }),
      el("p", { class: "page-sub", text: `Total recorded: ${dollars(total)} · ${unthanked} still need a thank-you.` }),
    ]),
    el("button", { class: "btn btn-primary", onclick: () => openDonationForm(contacts) }, "+ Add donation"),
  ]));

  const listWrap = el("div", { class: "list-wrap card", style: "padding:0" });
  if (donations.length === 0) {
    listWrap.appendChild(el("div", { class: "empty", text: "No donations recorded yet." }));
  } else {
    const table = el("table");
    table.appendChild(el("thead", {}, el("tr", {}, [
      el("th", { text: "Date" }), el("th", { text: "Donor" }), el("th", { class: "right", text: "Amount" }),
      el("th", { text: "Method" }), el("th", { text: "Thanked?" }), el("th", { text: "" }),
    ])));
    const tbody = el("tbody");
    donations.forEach((d) => {
      const donorName = d.contacts ? d.contacts.full_name : (d.organization_id ? "Organization" : "—");
      const tr = el("tr", {}, [
        el("td", { class: "nowrap", text: fmtDate(d.donated_at) }),
        el("td", { text: donorName || "—" }),
        el("td", { class: "right nowrap", text: dollars(d.amount_cents) }),
        el("td", { text: (d.method || "").replace(/_/g, " ") }),
        el("td", {}, d.thanked_at
          ? el("span", { class: "tag good", text: "Thanked " + fmtDate(d.thanked_at) })
          : el("span", { class: "tag warn", text: "Not yet" })),
        el("td", {}, d.thanked_at ? null : el("button", { class: "btn btn-success btn-small", onclick: async (e) => {
          e.target.disabled = true;
          try {
            await run(sb.from("donations").update({ thanked_at: new Date().toISOString() }).eq("id", d.id), "Marking thanked");
            toast("Marked as thanked.");
            switchView("donations");
          } catch (err) { e.target.disabled = false; }
        } }, "Mark thanked")),
      ]);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    listWrap.appendChild(table);
  }
  c.appendChild(listWrap);
}

function contactOptions(contacts) {
  return [{ value: "", label: "— Not linked to a person —" }, ...contacts.map((c) => ({
    value: c.id, label: c.full_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "(no name)",
  }))];
}

function openDonationForm(contacts, prefill = {}) {
  const form = el("form");
  form.appendChild(el("h3", { text: "Add a donation" }));
  const grid = el("div", { class: "form-grid" });
  grid.appendChild(field("Donor (person)", select("contact_id", contactOptions(contacts), prefill.contact_id || "")));
  grid.appendChild(field("Amount ($)", input({ name: "amount", type: "text", inputmode: "decimal", placeholder: "0.00", value: prefill.amount || "" })));
  grid.appendChild(field("Date", input({ name: "donated_at", type: "date", value: prefill.donated_at || todayISO() })));
  grid.appendChild(field("Method", select("method", opts(DONATION_METHODS), "check")));
  grid.appendChild(field("Receipt #", input({ name: "receipt_number", value: "" })));
  grid.appendChild(el("div", { class: "field" }, [checkbox("is_recurring", "Recurring gift", false)]));
  grid.appendChild(field("Notes", el("textarea", { name: "notes" }), true));
  form.appendChild(grid);

  const saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, "Add donation");
  form.appendChild(el("div", { class: "form-actions" }, [el("button", { class: "btn btn-ghost", type: "button", onclick: closeModal }, "Cancel"), saveBtn]));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = readForm(form);
    const cents = toCents(raw.amount);
    if (cents == null || cents <= 0) { toast("Please enter a dollar amount.", true); return; }
    const payload = {
      contact_id: raw.contact_id || null,
      amount_cents: cents,
      donated_at: raw.donated_at,
      method: raw.method,
      receipt_number: raw.receipt_number,
      is_recurring: raw.is_recurring,
      notes: raw.notes,
    };
    saveBtn.disabled = true;
    try {
      await run(sb.from("donations").insert(payload), "Adding donation");
      toast("Donation added.");
      closeModal();
      switchView("donations");
    } catch (err) { saveBtn.disabled = false; }
  });
  openModal(form);
}

/* =========================================================================
   INBOX (RSVPs + contact-form submissions)
   ========================================================================= */
async function renderInbox(c) {
  setLoading(c, "Inbox");
  let rsvps, forms;
  try {
    [rsvps, forms] = await Promise.all([
      run(sb.from("event_rsvps").select("*, events(name)").eq("processed", false).order("submitted_at", { ascending: false }), "Loading RSVPs"),
      run(sb.from("contact_form_submissions").select("*").eq("processed", false).order("submitted_at", { ascending: false }), "Loading messages"),
    ]);
  } catch (e) { return; }

  updateInboxBadge(rsvps.length + forms.length);

  c.innerHTML = "";
  c.appendChild(el("h2", { class: "page-title", text: "Inbox" }));
  c.appendChild(el("p", { class: "page-sub", text: "New sign-ups and messages from the website. Process them and they leave this list." }));

  // RSVPs
  const rcard = el("div", { class: "card" });
  rcard.appendChild(el("h3", { text: `Event RSVPs (${rsvps.length})` }));
  if (rsvps.length === 0) rcard.appendChild(el("p", { class: "muted", text: "No new RSVPs." }));
  rsvps.forEach((r) => rcard.appendChild(inboxItem({
    title: r.name || "(no name)",
    sub: `${r.events ? r.events.name + " · " : ""}party of ${r.party_size || 1} · ${fmtDateTime(r.submitted_at)}`,
    contactLines: [r.email, r.phone].filter(Boolean).join(" · "),
    message: r.message,
    table: "event_rsvps",
    row: r,
  })));
  c.appendChild(rcard);

  // Contact form submissions
  const fcard = el("div", { class: "card" });
  fcard.appendChild(el("h3", { text: `Website messages (${forms.length})` }));
  if (forms.length === 0) fcard.appendChild(el("p", { class: "muted", text: "No new messages." }));
  forms.forEach((f) => fcard.appendChild(inboxItem({
    title: f.name || "(no name)",
    sub: `${f.subject ? esc(f.subject) + " · " : ""}${fmtDateTime(f.submitted_at)}`,
    contactLines: [f.email, f.phone].filter(Boolean).join(" · "),
    message: f.message,
    table: "contact_form_submissions",
    row: f,
  })));
  c.appendChild(fcard);
}

function inboxItem({ title, sub, contactLines, message, table, row }) {
  const wrap = el("div", { class: "attn-item", style: "align-items:flex-start;flex-direction:column;gap:6px" });
  wrap.appendChild(el("div", {}, [el("strong", { text: title }), el("span", { class: "muted", text: contactLines ? " — " + contactLines : "" })]));
  wrap.appendChild(el("div", { class: "muted", style: "font-size:14px", text: sub }));
  if (message) wrap.appendChild(el("div", { text: message }));
  const actions = el("div", { class: "form-actions", style: "justify-content:flex-start;margin-top:6px;flex-wrap:wrap" });
  actions.appendChild(el("button", { class: "btn btn-ghost btn-small", onclick: () => convertToContact(row) }, "Convert to contact"));
  actions.appendChild(el("button", { class: "btn btn-success btn-small", onclick: async (e) => {
    e.target.disabled = true;
    try {
      await run(sb.from(table).update({ processed: true }).eq("id", row.id), "Updating");
      toast("Marked as done.");
      switchView("inbox");
    } catch (err) { e.target.disabled = false; }
  } }, "Mark processed"));
  wrap.appendChild(actions);
  return wrap;
}

function convertToContact(row) {
  // Best-effort split of "First Last"
  const parts = (row.name || "").trim().split(/\s+/);
  const first = parts.shift() || "";
  const last = parts.join(" ");
  openContactForm({ first_name: first, last_name: last, email: row.email || "", phone: row.phone || "", contact_type: "community", preferred_language: "en", email_opt_in: false });
}

/* =========================================================================
   REMINDERS
   ========================================================================= */
async function renderReminders(c) {
  setLoading(c, "Reminders");
  let reminders, contacts;
  try {
    [reminders, contacts] = await Promise.all([
      run(sb.from("reminders").select("*, contacts(full_name)").eq("done", false).order("due_on", { ascending: true, nullsFirst: false }), "Loading reminders"),
      run(sb.from("contacts").select("id, full_name, first_name, last_name").order("last_name"), "Loading contacts"),
    ]);
  } catch (e) { return; }

  c.innerHTML = "";
  c.appendChild(el("div", { class: "page-head" }, [
    el("div", {}, [
      el("h2", { class: "page-title", text: "Reminders" }),
      el("p", { class: "page-sub", text: "Your open follow-up tasks, soonest first." }),
    ]),
    el("button", { class: "btn btn-primary", onclick: () => openReminderForm({ contacts }) }, "+ Add reminder"),
  ]));

  const card = el("div", { class: "card", style: "padding:0" });
  if (reminders.length === 0) {
    card.appendChild(el("div", { class: "empty", text: "No open reminders. Nice work!" }));
  } else {
    const today = todayISO();
    reminders.forEach((r) => {
      const overdue = r.due_on && r.due_on < today;
      const item = el("div", { class: "attn-item", style: "padding:14px 18px" }, [
        el("div", { style: "flex:1" }, [
          el("strong", { text: r.title }),
          r.details ? el("div", { class: "muted", style: "font-size:14px", text: r.details }) : null,
          el("div", { class: "muted", style: "font-size:13px" }, [
            r.due_on ? el("span", { class: overdue ? "attn-overdue" : "", text: (overdue ? "Overdue: " : "Due ") + fmtDate(r.due_on) }) : el("span", { text: "No due date" }),
            r.contacts ? el("span", { text: " · " + r.contacts.full_name }) : null,
          ]),
        ]),
        el("button", { class: "btn btn-success btn-small", onclick: async (e) => {
          e.target.disabled = true;
          try {
            await run(sb.from("reminders").update({ done: true, done_at: new Date().toISOString() }).eq("id", r.id), "Updating");
            toast("Reminder done.");
            switchView("reminders");
          } catch (err) { e.target.disabled = false; }
        } }, "Mark done"),
      ]);
      card.appendChild(item);
    });
  }
  c.appendChild(card);
}

function openReminderForm({ contacts, contact_id, contactName } = {}) {
  const form = el("form");
  form.appendChild(el("h3", { text: "Add a reminder" }));
  if (contactName) form.appendChild(el("p", { class: "muted", text: "For " + contactName }));
  form.appendChild(field("Title", input({ name: "title", placeholder: "e.g. Call about volunteer shift" })));
  form.appendChild(field("Details", el("textarea", { name: "details" })));
  form.appendChild(field("Due date", input({ name: "due_on", type: "date", value: todayISO() })));
  if (contacts && !contact_id) form.appendChild(field("Link to a person (optional)", select("contact_id", contactOptions(contacts), "")));

  const saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, "Add reminder");
  const cancel = contact_id
    ? el("button", { class: "btn btn-ghost", type: "button", onclick: () => openContactDetail(contact_id) }, "Cancel")
    : el("button", { class: "btn btn-ghost", type: "button", onclick: closeModal }, "Cancel");
  form.appendChild(el("div", { class: "form-actions" }, [cancel, saveBtn]));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = readForm(form);
    if (!data.title) { toast("Please give the reminder a title.", true); return; }
    if (contact_id) data.contact_id = contact_id;
    if (data.contact_id === "") data.contact_id = null;
    saveBtn.disabled = true;
    try {
      await run(sb.from("reminders").insert(data), "Saving reminder");
      toast("Reminder added.");
      if (contact_id) openContactDetail(contact_id);
      else { closeModal(); switchView("reminders"); }
    } catch (err) { saveBtn.disabled = false; }
  });
  openModal(form);
}

/* =========================================================================
   GRANTS
   ========================================================================= */
async function renderGrants(c) {
  setLoading(c, "Grants");
  let grants;
  try {
    grants = await run(sb.from("grants").select("*").order("deadline", { ascending: true, nullsFirst: false }), "Loading grants");
  } catch (e) { return; }

  c.innerHTML = "";
  c.appendChild(el("div", { class: "page-head" }, [
    el("div", {}, [
      el("h2", { class: "page-title", text: "Grants" }),
      el("p", { class: "page-sub", text: "Funding opportunities, by deadline." }),
    ]),
    el("button", { class: "btn btn-primary", onclick: () => openGrantForm() }, "+ Add grant"),
  ]));

  const listWrap = el("div", { class: "list-wrap card", style: "padding:0" });
  if (grants.length === 0) {
    listWrap.appendChild(el("div", { class: "empty", text: "No grants tracked yet." }));
  } else {
    const table = el("table");
    table.appendChild(el("thead", {}, el("tr", {}, [
      el("th", { text: "Deadline" }), el("th", { text: "Funder / Title" }), el("th", { text: "Stage" }),
      el("th", { class: "right", text: "Requested" }), el("th", { class: "right", text: "Awarded" }), el("th", { text: "" }),
    ])));
    const tbody = el("tbody");
    grants.forEach((g) => {
      const stageSel = select("stage", opts(GRANT_STAGES), g.stage);
      stageSel.classList.add("btn-small");
      stageSel.style.minHeight = "38px";
      stageSel.addEventListener("change", async () => {
        try {
          await run(sb.from("grants").update({ stage: stageSel.value }).eq("id", g.id), "Updating stage");
          toast("Stage updated.");
        } catch (e) {}
      });
      const tr = el("tr", {}, [
        el("td", { class: "nowrap", text: g.deadline ? fmtDate(g.deadline) : "—" }),
        el("td", {}, [
          el("strong", { text: g.funder_name || "—" }),
          g.title ? el("div", { class: "muted", style: "font-size:14px", text: g.title }) : null,
        ]),
        el("td", {}, stageSel),
        el("td", { class: "right nowrap", text: g.amount_requested_cents != null ? dollars(g.amount_requested_cents) : "—" }),
        el("td", { class: "right nowrap", text: g.amount_awarded_cents != null ? dollars(g.amount_awarded_cents) : "—" }),
        el("td", {}, el("button", { class: "btn btn-ghost btn-small", onclick: () => openGrantForm(g) }, "Edit")),
      ]);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    listWrap.appendChild(table);
  }
  c.appendChild(listWrap);
}

function openGrantForm(existing = null) {
  const g = existing || {};
  const form = el("form");
  form.appendChild(el("h3", { text: existing ? "Edit grant" : "Add a grant" }));
  const grid = el("div", { class: "form-grid" });
  grid.appendChild(field("Funder name", input({ name: "funder_name", value: g.funder_name || "" })));
  grid.appendChild(field("Title", input({ name: "title", value: g.title || "" })));
  grid.appendChild(field("Stage", select("stage", opts(GRANT_STAGES), g.stage || "prospect")));
  grid.appendChild(field("Deadline", input({ name: "deadline", type: "date", value: g.deadline || "" })));
  grid.appendChild(field("Amount requested ($)", input({ name: "amount_requested", type: "text", inputmode: "decimal", value: g.amount_requested_cents != null ? (g.amount_requested_cents / 100).toFixed(2) : "" })));
  grid.appendChild(field("Amount awarded ($)", input({ name: "amount_awarded", type: "text", inputmode: "decimal", value: g.amount_awarded_cents != null ? (g.amount_awarded_cents / 100).toFixed(2) : "" })));
  grid.appendChild(field("Link", input({ name: "url", type: "url", value: g.url || "", placeholder: "https://..." }), true));
  grid.appendChild(field("Notes", el("textarea", { name: "notes", text: g.notes || "" }), true));
  form.appendChild(grid);

  const saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, existing ? "Save changes" : "Add grant");
  form.appendChild(el("div", { class: "form-actions" }, [el("button", { class: "btn btn-ghost", type: "button", onclick: closeModal }, "Cancel"), saveBtn]));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = readForm(form);
    if (!raw.funder_name) { toast("Please enter the funder name.", true); return; }
    const payload = {
      funder_name: raw.funder_name,
      title: raw.title,
      stage: raw.stage,
      deadline: raw.deadline || null,
      url: raw.url,
      notes: raw.notes,
      amount_requested_cents: raw.amount_requested ? toCents(raw.amount_requested) : null,
      amount_awarded_cents: raw.amount_awarded ? toCents(raw.amount_awarded) : null,
    };
    saveBtn.disabled = true;
    try {
      if (existing) await run(sb.from("grants").update(payload).eq("id", existing.id), "Saving grant");
      else await run(sb.from("grants").insert(payload), "Adding grant");
      toast(existing ? "Grant updated." : "Grant added.");
      closeModal();
      switchView("grants");
    } catch (err) { saveBtn.disabled = false; }
  });
  openModal(form);
}
