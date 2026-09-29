const $ = (q, root = document) => root.querySelector(q);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      c
      ],
  );
const fmtDate = (s) =>
  s
    ? new Date(s).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    : "—";
const age = (s) => {
  if (!s) return "";
  const d = Math.max(0, Date.now() - new Date(s).getTime());
  const h = Math.floor(d / 36e5);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};
const state = {
  user: null,
  page: "overview",
  tickets: [],
  dashboard: null,
  analytics: null,
  detail: null,
  policies: [],
  policyConflicts: [],
  rules: [],
  users: [],
  assignees: [],
  sla: [],
  escalations: [],
  prompts: [],
  organization: null,
  followups: [],
  filters: {
    q: "",
    status: "",
    category: "",
    department: "",
    priority: "",
    verification: "",
    escalation: "",
    created_from: "",
    created_to: "",
    sla_risk: false,
    review: false,
  },
};
async function api(url, opts = {}) {
  const multipart =
    typeof FormData !== "undefined" && opts.body instanceof FormData;
  const r = await fetch(url, {
    credentials: "same-origin",
    ...opts,
    headers: {
      ...(multipart ? {} : { "Content-Type": "application/json" }),
      ...(opts.headers || {}),
    },
  });
  let data = {};
  try {
    data = await r.json();
  } catch { }
  if (!r.ok) {
    if (url.split("?")[0] === "/api/assignees" && r.status === 404) {
      throw new Error("This server version is outdated. Stop the running server, start SupportNova from this project folder, then refresh the page.");
    }
    throw new Error(data.error || `Request failed (${r.status})`);
  }
  return data;
}
function toast(msg, error = false) {
  const root = $("#toast-root"),
    el = document.createElement("div");
  el.className = `toast${error ? " error" : ""}`;
  el.textContent = msg;
  root.append(el);
  setTimeout(() => el.remove(), 3400);
}
function badge(text) {
  const s = String(text || "—"),
    cls = /Manual Review|Critical/i.test(s)
      ? "badge-manual"
      : /Agent Review|High/i.test(s)
        ? "badge-review"
        : /Verified/i.test(s)
          ? "badge-verified"
          : /Escalated/i.test(s)
            ? "badge-escalated"
            : /P1|P2/i.test(s)
              ? "badge-priority"
              : "badge-muted";
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}
const glyph = {
  overview: "◫",
  tickets: "▤",
  review: "⚑",
  policies: "◈",
  rules: "⌘",
  reports: "▥",
  admin: "⚙",
  organization: "✦",
  followups: "◷",
};
const navAll = [
  ["overview", "Overview"],
  ["tickets", "Complaints"],
  ["review", "Review queue"],
  ["followups", "Follow-ups"],
  ["policies", "Policies"],
  ["rules", "Rule matrix"],
  ["reports", "Reports"],
  ["admin", "Administration"],
  ["organization", "Organization"],
];
function visibleNav() {
  let p = ["overview", "tickets", "reports"];
  p.push("organization");
  if (["reviewer", "admin"].includes(state.user.role))
    p.push("review", "followups");
  if (state.user.role === "customer") p.push("followups");
  if (["admin", "auditor", "reviewer"].includes(state.user.role))
    p.push("policies");
  if (["admin", "auditor"].includes(state.user.role)) p.push("rules");
  if (state.user.role === "admin") p.push("admin");
  return navAll.filter(([k]) => p.includes(k));
}
function render() {
  if (!state.user) {
    renderLogin();
    return;
  }
  const nav = visibleNav();
  if (!nav.some((x) => x[0] === state.page)) state.page = "overview";
  const who = state.user;
  const aiLabel = who.role === "customer" ? "Workspace active" : ({ ready: "Last AI run succeeded", configured: "AI configured · awaiting a run", failed: "Last AI run succeeded· check provider", disabled: "AI disabled · Python rules active" }[state.dashboard?.ai_status] || "Checking workspace");
  $("#app").innerHTML =
    `<div class="shell"><aside class="sidebar"><div class="brand"><img class="logo-img" src="./static/images/logo.png" /></div><div class="workspace-label">WORKSPACE</div><nav class="nav">${nav.map(([k, n]) => `<button data-page="${k}" class="${state.page === k ? "active" : ""}"><span class="ico">${glyph[k]}</span><span class="label">${n}</span>${k === "review" && state.dashboard?.review ? `<span class="count">${state.dashboard.review}</span>` : ""}</button>`).join("")}</nav><div class="side-spacer"></div><div class="queue-card"><div class="queue-top"><span>Today's overview</span><span>↗</span></div><div class="queue-number">${state.dashboard?.total?.toLocaleString() || "—"}</div><div class="queue-copy">complaints in workspace</div></div><div class="user-chip"><div class="avatar">${esc(
      who.name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join(""),
    )}</div><div class="user-text"><div class="user-name">${esc(who.name)}</div><div class="user-role">${esc(who.role[0].toUpperCase() + who.role.slice(1))}</div></div><button class="logout" title="Sign out" data-action="logout">↪</button></div></aside><main class="main"><header class="topbar"><div class="crumb">Workspace <span style="padding:0 7px;color:#bdc5d2">/</span> <b>${esc(nav.find((x) => x[0] === state.page)?.[1] || "Overview")}</b></div><div class="top-right"><div class="live"><span class="dot"></span> ${esc(aiLabel)}</div><button class="icon-btn" title="Notifications">♧</button></div></header><section class="content" id="view"></section></main></div>${state.detail ? detailMarkup(state.detail) : ""}`;
  $("#view").innerHTML = pageMarkup();
  bind();
}
function renderLogin() {
  const app = $("#app");
  app.innerHTML = `<main class="login-screen"><section class="login-left"><div class="brand"><img class="logo-img" src="./static/images/logo.png" /></div><div class="hero-kicker">A clearer path to resolution</div><h1 class="hero-title">Every complaint.<br>Handled with care.</h1><p class="hero-copy">Bring intelligent triage and accountable decisions into one thoughtful workspace. AI proposes. Independent rules verify.</p><div class="hero-points"><div class="hero-point"><span class="check">✓</span> Grounded recommendations with traceable sources</div><div class="hero-point"><span class="check">✓</span> Sensitive cases routed for human review</div><div class="hero-point"><span class="check">✓</span> Clear ownership from intake to resolution</div></div></section><section class="login-right"><form class="login-card" id="login-form"><div class="eyebrow">Welcome to SupportNova</div><h2 class="login-title">Sign in to your workspace</h2><p class="login-sub">Use your demonstration account to continue.</p><div class="form-field"><label for="email">Work email</label><input class="field" id="email" name="email" type="email" autocomplete="username" required value="admin@supportnova.demo"></div><div class="form-field"><label for="password">Password</label><input class="field" id="password" name="password" type="password" autocomplete="current-password" required value="NovaDemo2026!"></div><button class="btn btn-primary login-submit" type="submit">Sign in <span>→</span></button><div class="demo-box"><div class="demo-head"><span>DEMO ACCOUNTS</span><span style="color:#8994a7;font-weight:400">Select a role</span></div><div class="demo-buttons">${[
    ["customer", "Customer"],
    ["agent", "Agent"],
    ["reviewer", "Reviewer"],
    ["admin", "Admin"],
    ["auditor", "Auditor"],
  ]
    .map(
      ([r, n]) =>
        `<button class="demo-role" type="button" data-demo="${r}">${n}</button>`,
    )
    .join(
      "",
    )}</div><div class="demo-cred">Password for all demo accounts: <strong>NovaDemo2026!</strong></div></div><div id="login-error" class="hint" style="color:#bd524a;margin-top:10px"></div></form></section></main>`;
  api("/api/health").then((info) => {
    if (info.storage === "firebase") {
      $(".demo-box")?.remove();
      $("#email").value = "";
      $("#password").value = "";
      $(".login-sub").textContent = "Sign in with your Firebase Authentication account.";
    }
  }).catch(() => { });
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: $("#email").value,
          password: $("#password").value,
        }),
      });
      await start();
    } catch (err) {
      $("#login-error").textContent = err.message;
    } finally {
      b.disabled = false;
    }
  });
  document.querySelectorAll("[data-demo]").forEach(
    (b) =>
    (b.onclick = () => {
      $("#email").value = `${b.dataset.demo}@supportnova.demo`;
      $("#password").value = "NovaDemo2026!";
      $("#login-form").requestSubmit();
    }),
  );
}
function pageMarkup() {
  switch (state.page) {
    case "tickets":
      return ticketsMarkup();
    case "review":
      return reviewMarkup();
    case "policies":
      return policiesMarkup();
    case "rules":
      return rulesMarkup();
    case "reports":
      return reportsMarkup();
    case "admin":
      return adminMarkup();
    case "organization":
      return organizationMarkup();
    case "followups":
      return followupsMarkup();
    default:
      return overviewMarkup();
  }
}
function pageHead(kicker, title, sub, actions = "") {
  return `<div class="heading-row"><div><div class="eyebrow">${kicker}</div><h1 class="page-title">${title}</h1><p class="subtitle">${sub}</p></div><div class="actions">${actions}</div></div>`;
}
const organizationIndustries = ["E-commerce", "Telecommunications", "Travel", "Consumer electronics", "Banking simulation", "Insurance simulation", "Online services", "Retail", "Logistics", "Subscription services"];
function organizationMarkup() {
  const o = state.organization || {}, admin = state.user.role === "admin";
  const list = (value) => Array.isArray(value) ? value.join("\n") : String(value || "");
  const field = (label, name, value, hint, area = false) => `<div class="form-field ${area ? "full" : ""}"><label for="org-${name}">${label}</label>${area ? `<textarea class="textarea org-textarea" id="org-${name}" name="${name}" ${admin ? "required" : "readonly"} maxlength="1500" placeholder="One item per line">${esc(value)}</textarea>` : `<input class="field" id="org-${name}" name="${name}" ${admin ? "required" : "readonly"} maxlength="${name === "name" ? 100 : 1200}" value="${esc(value)}" ${name === "industry" ? `list="organization-industries" placeholder="Choose or enter an industry"` : ""}>`}${hint ? `<span class="field-hint">${hint}</span>` : ""}</div>`;
  const saved = !!o.name;
  const actions = admin ? (saved ? '<button class="btn" type="button" data-org-reset>Reset changes</button><button class="btn btn-primary" type="submit" form="organization-form">Save organization</button>' : '<button class="btn btn-primary" type="submit" form="organization-form">Create organization →</button>') : "";
  return `${pageHead("TEAM SCENARIO · STEP 1", saved ? esc(o.name) : "Create your fictional organization", saved ? "Your team’s fictional company profile and scenario foundation." : "Start with a distinct fictional company. This profile gives your team a clear foundation for its policies, complaint data, and resolution rules.", actions)}<div class="org-layout"><section class="panel org-main"><div class="panel-head"><div><div class="panel-title">Organization profile</div><div class="panel-subtitle">Build a believable scenario that belongs to your team.</div></div><span class="badge ${saved ? "badge-verified" : "badge-muted"}">${saved ? "Profile saved" : "Setup step 1 of 3"}</span></div><form id="organization-form" class="org-form"><datalist id="organization-industries">${organizationIndustries.map((x) => `<option value="${x}">`).join("")}</datalist><div class="form-grid">${field("Fictional organization name *", "name", o.name, "Use an invented brand, never a real customer business.")}${field("Industry or domain *", "industry", o.industry, "Choose a suggested domain or enter another fictional industry.")}${field("What does the organization do? *", "description", o.description, "Describe the service and the fictional customer scenario.", true)}${field("Products or services *", "products", list(o.products), "List your team’s unique fictional offerings, one per line.", true)}${field("Departments *", "departments", list(o.departments), "Create distinct departments that own the work, one per line.", true)}${field("Complaint categories *", "categories", list(o.categories), "Define the complaint types that make this organization’s scenario unique.", true)}</div>${admin ? `<label class="fictional-check"><input type="checkbox" name="fictional_confirmed" required ${o.fictional_confirmed ? "checked" : ""}><span><strong>Fictional scenario confirmed.</strong> I confirm this organization, its products, policies, and complaint examples are invented and contain no real customer confidential information.</span></label><p class="org-save-note">You can revise this profile later. Next, create company knowledge-base documents and configure routing, escalation, and service-level rules in the workspace.</p>` : `<div class="notice org-readonly">Only an administrator can create or edit the team organization profile.</div>`}<div id="organization-error" class="hint" style="color:#bd524a"></div></form></section><aside class="panel org-guide"><div class="panel-title">Make your team’s scenario distinct</div><p class="panel-subtitle">The SRS asks teams to create their own organization and differ in industry, products, departments, categories, policies, and rules.</p><div class="org-step"><span class="org-step-num">1</span><div><strong>Organization</strong><small>Invent a company and choose its operating domain.</small></div><span class="org-step-state">${saved ? "✓" : "Now"}</span></div><div class="org-step"><span class="org-step-num">2</span><div><strong>Knowledge base</strong><small>Prepare complaint, refund, replacement, billing, delivery, privacy, and other policies plus FAQs and SOPs.</small></div><span class="org-step-state">Next</span></div><div class="org-step"><span class="org-step-num">3</span><div><strong>Operating rules</strong><small>Set department routing, resolution rules, escalations, and service levels.</small></div><span class="org-step-state">Then</span></div><div class="notice org-privacy"><strong>Protect real people.</strong> Use synthetic customer complaints only. Do not enter real customer confidential information.</div>${admin && saved ? '<div class="org-next-actions"><button class="btn" data-page="policies">Open knowledge base →</button><button class="btn" data-page="rules">Configure routing rules →</button></div>' : ""}</aside></div>`;
}
function overviewMarkup() {
  const d = state.dashboard || {},
    customer = state.user.role === "customer";
  const actions = `${["customer", "agent", "admin"].includes(state.user.role) ? '<button class="btn btn-primary" data-action="new">＋ New complaint</button>' : ""}`;
  const metrics = customer
    ? [
      ["My complaints", d.total || 0, "Complaints submitted", "▤"],
      ["Open cases", d.open || 0, "Awaiting an update", "◷"],
      ["Resolved", d.statuses?.Resolved || 0, "Marked as resolved", "✓"],
      ["Closed", d.statuses?.Closed || 0, "Completed cases", "○"],
    ]
    : [
      ["Total complaints", d.total || 0, "All submissions in workspace", "▤"],
      ["Open cases", d.open || 0, "Awaiting action", "◷"],
      ["Needs human review", d.review || 0, "Risk or disagreement", "⚑"],
      ["SLA at risk", d.sla_risk || 0, "Open longer than 72 hours", "◉"],
    ];
  const cats = Object.entries(d.by_category || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6),
    max = Math.max(1, ...cats.map((x) => x[1]));
  return `${pageHead("SERVICE OPERATIONS", "Good " + greeting() + ", " + esc(state.user.name.split(" ")[0]) + ".", customer ? "Track your complaints and follow updates here." : "Here is what is happening across your support workspace.", actions)}<div class="metrics">${metrics.map(([label, n, foot, icon]) => `<article class="metric"><div class="metric-head">${label}<span class="metric-icon">${icon}</span></div><div class="metric-value">${Number(n).toLocaleString()}</div><div class="metric-foot">${foot}</div></article>`).join("")}</div><div class="cards"><section class="panel"><div class="panel-head"><div><div class="panel-title">Recent complaints</div><div class="panel-subtitle">Latest activity across your workspace</div></div><button class="text-link" data-page="tickets">View all complaints →</button></div><div class="ticket-list">${(d.recent || []).map(rowMarkup).join("") || emptyMarkup("No complaints yet", "New complaints will appear here.")}</div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">Complaint categories</div><div class="panel-subtitle">Volume by primary issue</div></div><span class="badge badge-muted">Top categories</span></div><div class="distribution">${cats.map(([name, n]) => `<div class="dist-row"><span>${esc(name)}</span><div class="track"><div class="bar" style="width:${Math.max(4, (n / max) * 100)}%"></div></div><span class="dist-n">${n}</span></div>`).join("") || emptyMarkup("No category data", "Submit a complaint to see trends.")}</div></section></div><div class="two-panels" style="${customer ? "display:none" : ""}"><section class="panel"><div class="panel-head"><div><div class="panel-title">Decision pipeline</div><div class="panel-subtitle">Independent analysis and rule validation</div></div><span class="badge badge-verified">● Operational</span></div><div class="panel-body"><div class="flow"><div class="flow-item"><div class="flow-num">${d.total || 0}</div><div class="flow-name">Received & normalized</div></div><div class="flow-item"><div class="flow-num">${d.verified || 0}</div><div class="flow-name">Deterministic checks passed</div></div><div class="flow-item"><div class="flow-num">${d.review || 0}</div><div class="flow-name">Queued for human review</div></div></div><div class="notice" style="margin-top:12px"><strong>Governance active.</strong> Customer text is treated as untrusted input. Safety, privacy, and security escalation is enforced independently of sentiment.</div></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">Operational signals</div><div class="panel-subtitle">Items to keep an eye on</div></div><button class="text-link" data-page="review">Open queue →</button></div><div class="panel-body">${d.review ? `<div class="signal"><span class="signal-mark"></span><span><b>${d.review} cases</b> are awaiting reviewer assessment</span></div>` : ""}${d.sla_risk ? `<div class="signal"><span class="signal-mark"></span><span><b>${d.sla_risk} cases</b> exceed the 72-hour response target</span></div>` : ""}<div class="signal"><span class="signal-mark" style="background:#67b495"></span><span>Active policy sources remain traceable on each analysis</span></div><div class="signal"><span class="signal-mark" style="background:#8194e8"></span><span>${d.total || 0} synthetic cases loaded for demonstration</span></div></div></section></div>`;
}
function greeting() {
  let h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
function rowMarkup(t) {
  const customer = state.user.role === "customer";
  return `<div class="ticket-row" data-ticket="${esc(t.id)}"><div class="avatar" style="background:#eef1ff;color:#5c72cb">${esc((t.category || "C")[0])}</div><div class="ticket-content"><div class="ticket-meta"><span class="ticket-id">${esc(t.id)}</span>${badge(t.status)}</div><div class="ticket-title">${esc(t.title)}</div><div class="ticket-below"><span>${esc(t.department?.replaceAll("_", " ") || (customer ? "" : "—"))}</span><span>·</span><span>${age(t.updated_at)}</span></div></div>${customer ? "" : `<div>${badge(t.priority)}</div>`}</div>`;
}
function emptyMarkup(title, copy) {
  return `<div class="empty"><strong>${esc(title)}</strong>${esc(copy)}</div>`;
}
function toolbarMarkup(review = false) {
  return `<div class="page-toolbar"><div class="search-wrap"><span class="search-glyph">⌕</span><input class="field" id="filter-q" placeholder="Search complaints, IDs, departments…" value="${esc(state.filters.q)}"></div>${!review ? `<select class="select" id="filter-status"><option value="">All statuses</option>${["New", "Analyzed", "Pending Admin Review", "Assigned", "In Progress", "Awaiting Customer", "Escalated", "Resolved", "Closed", "Reopened"].map((s) => `<option ${state.filters.status === s ? "selected" : ""}>${s}</option>`).join("")}</select><select class="select" id="filter-category"><option value="">All categories</option>${["Delivery", "Billing", "Product Quality", "Account Access", "Returns", "Service", "Privacy", "Safety", "Technical Issue", "Other"].map((s) => `<option ${state.filters.category === s ? "selected" : ""}>${s}</option>`).join("")}</select>` : ""}<span class="badge badge-muted">${state.tickets.length} results</span></div>`;
}
function ticketTable(ts) {
  if (!ts.length)
    return emptyMarkup(
      "Nothing to show",
      "Try changing your search or filters.",
    );
  const customer = state.user.role === "customer";
  return `<div class="panel table-wrap"><table class="table"><thead><tr><th>Complaint</th><th>Category</th>${customer ? "" : "<th>Department</th><th>Priority</th>"}<th>Status</th>${customer ? "" : "<th>Verification</th>"}<th>Updated</th></tr></thead><tbody>${ts.map((t) => `<tr data-ticket="${esc(t.id)}"><td><div class="primary-cell">${esc(t.title)}</div><div class="mono">${esc(t.id)}</div></td><td>${esc(t.category)}</td>${customer ? "" : `<td>${esc(t.department?.replaceAll("_", " "))}</td><td>${badge(t.priority)}</td>`}<td>${badge(t.status)}</td>${customer ? "" : `<td>${badge(t.verification)}</td>`}<td>${age(t.updated_at)}</td></tr>`).join("")}</tbody></table></div>`;
}
function ticketsMarkup() {
  const act = ["customer", "agent", "admin"].includes(state.user.role)
    ? '<button class="btn btn-primary" data-action="new">＋ New complaint</button>'
    : "";
  return `${pageHead("SERVICE OPERATIONS", "Complaints", "Search, triage, and track customer issues from intake through resolution.", act)}${toolbarMarkup()}<div id="ticket-results">${ticketTable(state.tickets)}</div>`;
}
function reviewMarkup() {
  return `${pageHead("GOVERNANCE", "Reviewer queue", "Handle high-risk or uncertain cases, AI or policy disagreements, and cases waiting for agent capacity.", "")}<div class="notice" style="margin-bottom:13px"><strong>Automatic routing.</strong> Verified complaints go to an agent automatically. This queue contains cases that need reviewer attention or manual reassignment.</div>${toolbarMarkup(true)}<div id="ticket-results">${ticketTable(state.tickets)}</div>`;
}
function policiesMarkup() {
  const can = state.user.role === "admin";
  return `${pageHead("KNOWLEDGE GOVERNANCE", "Policies & sources", "Trace recommendations to active, versioned organization guidance.", can ? '<button class="btn" data-action="upload-policy">↑ Upload PDF / DOCX</button><button class="btn btn-primary" data-action="new-policy">＋ Add policy</button>' : "")}<div class="metrics" style="grid-template-columns:repeat(3,1fr)"><article class="metric"><div class="metric-head">Policy documents<span class="metric-icon">◈</span></div><div class="metric-value">${state.policies.length}</div><div class="metric-foot">Seeded and admin managed</div></article><article class="metric"><div class="metric-head">Active sources<span class="metric-icon">✓</span></div><div class="metric-value">${state.policies.filter((p) => p.status === "Active").length}</div><div class="metric-foot">Available to support analysis</div></article><article class="metric"><div class="metric-head">Policy categories<span class="metric-icon">⌗</span></div><div class="metric-value">${new Set(state.policies.map((p) => p.category)).size}</div><div class="metric-foot">Source references preserved</div></article></div><div class="panel table-wrap"><table class="table"><thead><tr><th>Document</th><th>Category</th><th>Version</th><th>Status</th><th>Effective</th><th>Updated</th></tr></thead><tbody>${state.policies.map((p) => `<tr data-policy="${esc(p.id)}"><td><div class="primary-cell">${esc(p.title)}</div><div class="mono">${esc(p.id)}</div></td><td>${esc(p.category)}</td><td>v${esc(p.version)}</td><td>${badge(p.status === "Active" ? "Verified" : p.status)}</td><td>${fmtDate(p.effective)}</td><td>${fmtDate(p.updated_at)}</td></tr>`).join("")}</tbody></table></div><p class="hint" style="margin:10px 3px">PDF and DOCX uploads are parsed into source chunks with page or section metadata. Only Active sources support primary recommendations.</p>`;
}
function rulesMarkup() {
  const active = state.rules.filter((r) => r.active).length;
  return `${pageHead("DETERMINISTIC CONTROLS", "Complaint rule matrix", "Configurable routing, priority, and escalation rules applied independently of model output.", state.user.role === "admin" ? '<button class="btn btn-primary" data-action="new-rule">＋ Add rule</button>' : "")}<div class="metrics" style="grid-template-columns:repeat(3,1fr)"><article class="metric"><div class="metric-head">Configured rules<span class="metric-icon">⌘</span></div><div class="metric-value">${state.rules.length}</div><div class="metric-foot">Versioned rule matrix</div></article><article class="metric"><div class="metric-head">Active rules<span class="metric-icon">✓</span></div><div class="metric-value">${active}</div><div class="metric-foot">Applied during validation</div></article><article class="metric"><div class="metric-head">Escalation categories<span class="metric-icon">⚑</span></div><div class="metric-value">3</div><div class="metric-foot">Safety · Privacy · Security</div></article></div><div class="panel table-wrap"><table class="table"><thead><tr><th>Rule ID</th><th>Category</th><th>Department</th><th>Priority</th><th>Escalation</th><th>Trigger & required action</th><th>State</th></tr></thead><tbody>${state.rules.map((r) => `<tr><td class="primary-cell">${esc(r.id)}</td><td>${esc(r.category)}</td><td>${esc(r.department.replaceAll("_", " "))}</td><td>${badge(r.priority)}</td><td>${esc(r.escalation)}</td><td class="rule-desc" title="${esc(r.trigger + " — " + r.action)}">${esc(r.trigger)} → ${esc(r.action)}</td><td>${state.user.role === "admin" ? `<button class="btn ${r.active ? "btn-soft" : ""}" data-toggle-rule="${esc(r.id)}">${r.active ? "Active" : "Inactive"}</button>` : badge(r.active ? "Verified" : "Inactive")}</td></tr>`).join("")}</tbody></table></div><p class="hint" style="margin:10px 3px">Rules are shared case-handling controls, not per-user access grants. Administrators can add and enable rules; mandatory safety checks remain built into the independent validator.</p>`;
}
function reportsMarkup() {
  const d = state.dashboard || {}, a = state.analytics || {};
  const card = (title, map) => {
    const entries = Object.entries(map || {}).sort((x, y) => y[1] - x[1]);
    const max = Math.max(1, ...entries.map((x) => x[1]));
    return `<section class="panel"><div class="panel-head"><div><div class="panel-title">${esc(title)}</div></div></div><div class="distribution">${entries.map(([name, n]) => `<div class="dist-row"><span>${esc(name.replaceAll("_", " "))}</span><div class="track"><div class="bar" style="width:${Math.max(3, (n / max) * 100)}%"></div></div><span class="dist-n">${n}</span></div>`).join("") || emptyMarkup("No data", "No records are available for this view.")}</div></section>`;
  };
  const daily = Object.entries(a.daily_volume || {}), peak = Math.max(1, ...daily.map(([, n]) => n));
  const resolution = a.average_resolution_hours == null ? "—" : `${a.average_resolution_hours}h`;
  return `${pageHead("SERVICE ANALYTICS", "Reports & trends", "Complaint volumes, outcomes, routing, service levels, and validation signals.", ["reviewer", "admin", "auditor"].includes(state.user.role) ? '<a class="btn" href="/api/export.csv">↓ Export CSV</a>' : "")}<div class="metrics">${[
    ["Total complaints", d.total || 0, "Authorized workspace records"],
    ["Repeat contacts", a.repeat_complaints || 0, "Duplicates or linked prior cases"],
    ["SLA at risk", a.sla_risk || 0, "Open cases past a configured target"],
    ["AI / Python disagreements", a.genai_python_disagreements || 0, "Field-level mismatches recorded"],
    ["Average resolution time", resolution, `${a.resolved_cases_with_timing || 0} resolved cases with timestamps`],
  ].map(([label, value, foot]) => `<article class="metric"><div class="metric-head">${label}</div><div class="metric-value">${typeof value === "number" ? value.toLocaleString() : esc(value)}</div><div class="metric-foot">${foot}</div></article>`).join("")}</div><div class="section-grid">${card("Complaint category", a.by_category)}${card("Department routing", a.by_department)}${card("Priority", a.by_priority)}${card("Sentiment", a.by_sentiment)}${card("Urgency", a.by_urgency)}${card("Escalation level", a.by_escalation)}</div><section class="panel" style="margin-top:15px"><div class="panel-head"><div><div class="panel-title">Daily complaint volume</div><div class="panel-subtitle">Rolling 30-day trend</div></div></div><div class="distribution">${daily.map(([day, count]) => `<div class="dist-row"><span>${esc(day.slice(5))}</span><div class="track"><div class="bar" style="width:${Math.max(count ? 2 : 0, count / peak * 100)}%"></div></div><span class="dist-n">${count}</span></div>`).join("")}</div></section><section class="panel" style="margin-top:15px"><div class="panel-head"><div><div class="panel-title">Policy source usage</div><div class="panel-subtitle">Traceable references attached to cases</div></div></div><div class="distribution">${Object.entries(a.policy_usage || {}).map(([id, count]) => `<div class="dist-row"><span>${esc(id)}</span><div class="track"><div class="bar" style="width:${Math.max(2, count / Math.max(1, ...Object.values(a.policy_usage || {})) * 100)}%"></div></div><span class="dist-n">${count}</span></div>`).join("") || emptyMarkup("No policy usage", "Analyzed cases have not referenced a policy yet.")}</div></section>`;
}
function findingCodeLabel(code) { return String(code || "").replace(/^GENAI_/, "NOVA_AI_"); }
function detailMarkup(t) {
  const customer = state.user.role === "customer",
    findings = parseJson(t.findings, []),
    refs = parseJson(t.policy_refs, []),
    events = t.events || [],
    reviewer = ["reviewer", "admin"].includes(state.user.role),
    agent = ["agent", "reviewer", "admin"].includes(state.user.role);
  return `<div class="detail-layout" data-action="close-detail"><section class="detail-panel"><header class="detail-top"><span class="detail-id">${esc(t.id)} <span style="padding:0 5px">·</span> Submitted ${fmtDate(t.created_at)}</span><button class="close-btn" data-action="close-detail">×</button></header><div class="detail-main"><div style="display:flex;gap:6px;flex-wrap:wrap">${badge(t.status)}${customer ? "" : badge(t.priority) + badge(t.verification)}</div><h2 class="detail-title">${esc(t.title)}</h2><div class="detail-grid"><section class="detail-card wide"><div class="card-label">Customer complaint</div><div class="card-value" style="white-space:pre-wrap">${esc(t.description)}</div>${customer ? "" : `<div class="ticket-below" style="margin-top:12px">${esc(t.product || "Product unspecified")} ${t.order_id ? "· " + esc(t.order_id) : ""} · ${esc(t.channel || "Web")}</div>`}</section>${customer ? `<section class="detail-card"><div class="card-label">Complaint category</div><div class="card-value">${esc(t.category || "Under review")}</div></section><section class="detail-card"><div class="card-label">Resolution status</div><div class="card-value">${esc(t.status)}<br>${esc(t.resolution || "We will share an update here when one is available.")}</div></section><section class="detail-card wide"><div class="card-label">Latest customer update</div><div class="card-value">${esc(t.response || "No customer update is available yet.")}</div></section>` : `<section class="detail-card"><div class="card-label">Issue classification</div><div class="card-value"><b>${esc(t.category)}</b> · ${esc(t.subcategory)}<br>${esc(t.department?.replaceAll("_", " "))}<br>${esc(t.sentiment)} sentiment · ${esc(t.urgency)} urgency</div></section><section class="detail-card"><div class="card-label">Resolution & escalation</div><div class="card-value">${esc(t.resolution || "Awaiting review")}<br><br><b>Escalation:</b> ${esc(t.escalation)}</div></section><section class="detail-card wide"><div class="card-label">Ground-truth validation findings</div>${findings.length ? findings.map((f) => `<div class="finding ${f.severity === "Critical" ? "critical" : ""}"><strong>${esc(findingCodeLabel(f.code))} · ${esc(f.severity)}</strong><p>${esc(f.message)} ${f.evidence ? `<br>Evidence: ${esc(f.evidence)}` : ""}</p></div>`).join("") : '<div class="card-value">No validation findings. Deterministic checks passed.</div>'}<div class="ticket-below" style="margin-top:9px">Policy sources: ${refs.map((x) => (typeof x === "string" ? x : [x.document_id, x.section_id, x.version, x.page && "page " + x.page].filter(Boolean).join(" · "))).join(", ") || "—"} · Rule checks are deterministic</div></section>${t.duplicate_of ? `<section class="detail-card wide"><div class="card-label">Repeat complaint signal</div><div class="card-value">Possible duplicate of ${esc(t.duplicate_of)}. This submission was retained for review.</div></section>` : ""}${t.injection ? `<section class="detail-card wide"><div class="card-label">Untrusted content indicator</div><div class="card-value">Instruction-like text was detected and treated as complaint content only.</div></section>` : ""}<section class="detail-card wide"><div class="card-label">Customer response draft</div>${agent ? `<textarea class="textarea response-edit" id="response-edit">${esc(t.response || "")}</textarea><div class="detail-actions"><button class="btn btn-soft" data-action="save-response" data-id="${esc(t.id)}">Save draft</button></div>` : `<div class="card-value">${esc(t.response || "—")}</div>`}</section><section class="detail-card wide"><div class="card-label">Audit history</div><div class="timeline">${events.map((e) => `<div class="event"><strong>${esc(e.action)} <small style="font-weight:400;color:#8591a4">by ${esc(e.actor)}</small></strong><span>${age(e.created_at)}</span><p>${esc(e.detail)}</p></div>`).join("") || '<div class="card-value">No events recorded.</div>'}</div></section>`}</div>${reviewer ? `<div class="detail-actions"><button class="btn btn-primary" data-review="approve" data-id="${esc(t.id)}">✓ Approve & assign</button><button class="btn" data-review="assign" data-id="${esc(t.id)}">Reassign owner</button><button class="btn" data-review="override" data-id="${esc(t.id)}">Edit decision</button><button class="btn btn-danger" data-review="reject" data-id="${esc(t.id)}">Reject recommendation</button><button class="btn btn-danger" data-review="escalate" data-id="${esc(t.id)}">⚑ Escalate</button></div><p class="hint" style="margin-top:9px">Overrides, rejections, and escalations require a reason and are permanently recorded.</p>` : agent ? `<div class="detail-actions"><button class="btn btn-soft" data-action="status" data-id="${esc(t.id)}">Update status</button><button class="btn" data-action="note" data-id="${esc(t.id)}">＋ Internal note</button></div>` : ""}</div></section></div>`;
}
function parseJson(s, d) {
  try {
    return typeof s === "string" ? JSON.parse(s) : s || d;
  } catch {
    return d;
  }
}
function bind() {
  document
    .querySelectorAll("[data-page]")
    .forEach((b) => b.addEventListener("click", () => go(b.dataset.page)));
  document
    .querySelectorAll('[data-action="logout"]')
    .forEach((b) => (b.onclick = logout));
  const organizationForm = $("#organization-form");
  if (organizationForm && state.user.role === "admin") organizationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(organizationForm));
    for (const key of ["products", "departments", "categories"]) data[key] = data[key].split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join("\n");
    data.fictional_confirmed = new FormData(organizationForm).has("fictional_confirmed");
    try {
      const result = await api("/api/organization", { method: "POST", body: JSON.stringify(data) });
      state.organization = result.organization;
      toast("Fictional organization saved");
      render();
    } catch (err) { $("#organization-error").textContent = err.message; }
  });
  $("[data-org-reset]")?.addEventListener("click", () => render());
  document
    .querySelectorAll('[data-action="new"]')
    .forEach((b) => (b.onclick = openNew));
  document
    .querySelectorAll('[data-action="new-policy"]')
    .forEach((b) => (b.onclick = openPolicy));
  document
    .querySelectorAll('[data-action="new-rule"]')
    .forEach((b) => (b.onclick = openRule));
  document
    .querySelectorAll('[data-action="upload-policy"]')
    .forEach((b) => (b.onclick = openPolicyUpload));
  document
    .querySelectorAll("[data-ticket]")
    .forEach((el) =>
      el.addEventListener("click", () => openTicket(el.dataset.ticket)),
    );
  document
    .querySelectorAll("[data-policy]")
    .forEach((el) =>
      el.addEventListener("click", () => showPolicy(el.dataset.policy)),
    );
  document
    .querySelectorAll("[data-toggle-rule]")
    .forEach((b) => (b.onclick = () => toggleRule(b.dataset.toggleRule)));
  document
    .querySelectorAll("[data-review]")
    .forEach(
      (b) => (b.onclick = () => reviewAction(b.dataset.review, b.dataset.id)),
    );
  document.querySelectorAll('[data-action="close-detail"]').forEach(
    (el) =>
    (el.onclick = () => {
      state.detail = null;
      render();
    }),
  );
  document.querySelector(".detail-panel")?.addEventListener("click", (e) => e.stopPropagation());
  const q = $("#filter-q");
  if (q)
    q.oninput = debounce(() => {
      state.filters.q = q.value;
      loadTickets();
    }, 250);
  const s = $("#filter-status");
  if (s)
    s.onchange = () => {
      state.filters.status = s.value;
      loadTickets();
    };
  const c = $("#filter-category");
  if (c)
    c.onchange = () => {
      state.filters.category = c.value;
      loadTickets();
    };
  const save = $('[data-action="save-response"]');
  if (save)
    save.onclick = () =>
      updateTicket(save.dataset.id, { response: $("#response-edit").value });
  document
    .querySelectorAll('[data-action="status"]')
    .forEach((b) => (b.onclick = () => openStatus(b.dataset.id)));
  document
    .querySelectorAll('[data-action="note"]')
    .forEach((b) => (b.onclick = () => openNote(b.dataset.id)));
  const exportLink = $('a[href="/api/export.csv"]');
  if (exportLink)
    exportLink.onclick = async (e) => {
      if (state.user.role === "customer" || state.user.role === "agent") {
        e.preventDefault();
        toast("Your role cannot export reports.", true);
      }
    };
}
function debounce(fn, ms) {
  let timer;
  return (...a) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...a), ms);
  };
}
async function go(page) {
  state.page = page;
  state.detail = null;
  await refreshPage();
  render();
}
async function refreshPage() {
  state.dashboard = await api("/api/dashboard");
  if (state.page === "organization") state.organization = (await api("/api/organization")).organization;
  if (state.page === "reports") state.analytics = await api("/api/analytics");
  if (["tickets", "review"].includes(state.page)) {
    await loadTickets();
  }
  if (state.page === "policies") {
    const p = await api("/api/policies");
    state.policies = p.policies;
    state.policyConflicts = p.conflicts || [];
  }
  if (state.page === "rules") state.rules = (await api("/api/rules")).rules;
  if (state.page === "admin") await reloadAdmin();
  if (state.page === "followups") await reloadFollowups();
}
async function loadTickets() {
  let p = new URLSearchParams();
  if (state.filters.q) p.set("q", state.filters.q);
  if (state.page === "review") p.set("review", "true");
  for (const key of [
    "status",
    "category",
    "department",
    "priority",
    "sentiment",
    "verification",
    "escalation",
    "created_from",
    "created_to",
  ])
    if (state.filters[key]) p.set(key, state.filters[key]);
  if (state.filters.sla_risk) p.set("sla_risk", "true");
  state.tickets = (await api("/api/tickets?" + p)).tickets;
  if ($("#ticket-results"))
    $("#ticket-results").innerHTML = ticketTable(state.tickets);
  document
    .querySelectorAll("[data-ticket]")
    .forEach((el) => (el.onclick = () => openTicket(el.dataset.ticket)));
  const n = $(".page-toolbar .badge");
  if (n) n.textContent = `${state.tickets.length} results`;
}
async function start() {
  const me = await api("/api/me");
  state.user = me.user;
  if (state.user) {
    state.organization = (await api("/api/organization")).organization;
    if (!state.organization && state.user.role === "admin") state.page = "organization";
    await refreshPage();
  }
  render();
}
async function logout() {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
  } catch { }
  state.user = null;
  state.detail = null;
  render();
}
async function openTicket(id) {
  try {
    state.detail = await api("/api/tickets/" + encodeURIComponent(id));
    render();
    enhanceProposal();
  } catch (e) {
    toast(e.message, true);
  }
}
function enhanceProposal() {
  const grid = $(".detail-grid");
  if (!grid) return;
  const files = state.detail?.attachments || [];
  if (files.length) {
    const card = document.createElement("section");
    card.className = "detail-card wide";
    const label = document.createElement("div");
    label.className = "card-label";
    label.textContent = `Supporting evidence · ${files.length} file${files.length === 1 ? "" : "s"}`;
    card.append(label);
    for (const f of files) {
      const link = document.createElement("a");
      link.className = "text-link";
      link.href = "/api/attachments/" + encodeURIComponent(f.id);
      link.textContent = `${f.filename} · ${(f.size / 1024).toFixed(0)} KB`;
      link.style.display = "block";
      link.style.marginTop = "8px";
      card.append(link);
    }
    grid.append(card);
  }
  const run = state.detail?.analysis_run;
  if (!run || state.user.role === "customer") return;
  const card = document.createElement("section");
  card.className = "detail-card wide";
  const label = document.createElement("div");
  label.className = "card-label";
  label.textContent = `Nova AI proposal · ${run.provider} · ${run.model} · ${run.outcome}`;
  card.append(label);
  const p = run.proposal;
  if (p) {
    const summary = document.createElement("div");
    summary.className = "card-value";
    summary.textContent = `${p.category} / ${p.subcategory} · ${p.department} · ${p.priority} · ${p.urgency}\n${p.summary}\n\nDraft: ${p.customer_response}`;
    card.append(summary);
  } else {
    const summary = document.createElement("div");
    summary.className = "card-value";
    summary.textContent = run.outcome === "disabled"
      ? "No external Nova AI provider is configured. Deterministic local analysis was used."
      : `The configured provider returned no valid proposal; the case requires human review.${run.error ? ` Provider details: ${run.error}` : ""}`;
    card.append(summary);
  }
  const meta = document.createElement("div");
  meta.className = "ticket-below";
  meta.style.marginTop = "9px";
  meta.textContent = `Prompt ${run.prompt_version} · Schema ${run.schema_version} · ${run.latency_ms} ms · independent Python comparison`;
  card.append(meta);
  if (run.comparison?.length) {
    const comp = document.createElement("div");
    comp.className = "tag-list";
    comp.style.marginTop = "9px";
    for (const item of run.comparison) {
      const tag = document.createElement("span");
      tag.className =
        "badge " + (item.agreement ? "badge-verified" : "badge-manual");
      tag.textContent = `${item.field}: ${item.agreement ? "agree" : "disagree"} (Python: ${item.validated})`;
      comp.append(tag);
    }
    card.append(comp);
  }
  grid.append(card);
}
function modal(title, copy, body, submit, label = "Save") {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<section class="modal"><header class="modal-head"><div><div class="modal-title">${title}</div><div class="modal-copy">${copy}</div></div><button type="button" class="close-btn" data-dismiss>×</button></header><form id="modal-form"><div class="modal-body">${body}</div><footer class="modal-foot"><button type="button" class="btn" data-dismiss>Cancel</button><button class="btn btn-primary" type="submit">${label}</button></footer></form></section>`;
  document.body.append(wrap);
  wrap
    .querySelectorAll("[data-dismiss]")
    .forEach((x) => (x.onclick = () => wrap.remove()));
  wrap.onclick = (e) => {
    if (e.target === wrap) wrap.remove();
  };
  wrap.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await submit(new FormData(e.currentTarget), wrap);
    } catch (err) {
      toast(err.message, true);
    }
  };
  return wrap;
}
const cats = [
  "Delivery",
  "Billing",
  "Product Quality",
  "Account Access",
  "Returns",
  "Service",
  "Privacy",
  "Safety",
  "Technical Issue",
  "Other",
];
function openNew() {
  modal(
    "Submit a complaint",
    "Add the details you have available. Sensitive concerns are routed for human review.",
    `<div class="form-grid"><div class="form-field full"><label>Complaint title *</label><input class="field" name="title" required maxlength="160" placeholder="Briefly describe the issue"></div><div class="form-field full"><label>What happened? *</label><textarea class="textarea" name="description" required minlength="20" placeholder="Include relevant details. Please do not enter passwords or authentication codes."></textarea><span class="hint">At least 20 characters. Complaint content is treated as untrusted data.</span></div><div class="form-field"><label>Product or service</label><input class="field" name="product" placeholder="e.g. Home device"></div><div class="form-field"><label>Order or transaction ID</label><input class="field" name="order_id" placeholder="e.g. ORD-12345"></div><div class="form-field"><label>Customer type</label><select class="select" name="customer_type" style="width:100%"><option>Standard</option><option>Business</option><option>VIP</option></select></div><div class="form-field"><label>Preferred contact channel</label><select class="select" name="channel" style="width:100%"><option>Web</option><option>Email</option><option>Phone</option><option>Chat</option></select></div><div class="form-field full"><label>What would help resolve this?</label><input class="field" name="requested_resolution" placeholder="Optional"></div><div class="form-field full"><label>Supporting evidence (optional)</label><input class="field" type="file" name="evidence" multiple accept=".pdf,.docx,.png,.jpg,.jpeg,.txt"><span class="hint">Up to 5 files, 10 MB each / 20 MB total. PDF, DOCX, PNG, JPG, or TXT.</span></div></div>`,
    async (fd, wrap) => {
      const files = fd.getAll("evidence").filter((f) => f.size);
      if (
        files.length > 5 ||
        files.some((f) => f.size > 10 * 1024 * 1024) ||
        files.reduce((n, f) => n + f.size, 0) > 20 * 1024 * 1024
      )
        throw new Error(
          "Choose up to 5 files, no more than 10 MB each or 20 MB total.",
        );
      const values = Object.fromEntries(
        [...fd.entries()].filter(([name]) => name !== "evidence"),
      );
      let res;
      try {
        res = await api("/api/tickets", {
          method: "POST",
          body: files.length ? fd : JSON.stringify(values),
        });
      } catch (err) {
        const order = String(values.order_id || "").trim();
        if (
          files.length ||
          !/^[0-9]+$/.test(order) ||
          !err.message.includes("format")
        )
          throw err;
        values.order_id = "REF-" + order;
        res = await api("/api/tickets", {
          method: "POST",
          body: JSON.stringify(values),
        });
      }
      wrap.remove();
      toast(`Complaint ${res.ticket.id} submitted`);
      state.filters = { q: "", status: "", category: "", review: false };
      state.page = "tickets";
      await refreshPage();
      await openTicket(res.ticket.id);
    },
    "Submit complaint",
  );
}
function openPolicy() {
  modal(
    "Add or update a policy source",
    "Create a versioned text record. Only Active policies support primary recommendations.",
    `<div class="form-grid"><div class="form-field"><label>Document ID *</label><input class="field" name="id" required placeholder="e.g. DEL-POL-08"></div><div class="form-field"><label>Version</label><input class="field" name="version" value="1.0"></div><div class="form-field full"><label>Title *</label><input class="field" name="title" required></div><div class="form-field"><label>Category *</label><input class="field" name="category" list="supportnova-category-list" required><datalist id="supportnova-category-list">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div><div class="form-field"><label>Status</label><select class="select" name="status" style="width:100%"><option>Draft</option><option>Active</option><option>Previous</option><option>Superseded</option></select></div><div class="form-field"><label>Effective date</label><input class="field" name="effective" type="date" value="${new Date().toISOString().slice(0, 10)}"></div><div class="form-field full"><label>Policy content *</label><textarea class="textarea" name="content" minlength="20" required placeholder="Requirements, eligibility conditions, and prohibited actions"></textarea></div></div>`,
    async (fd, wrap) => {
      await api("/api/policies", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(fd)),
      });
      wrap.remove();
      toast("Policy source saved");
      await refreshPage();
      render();
    },
  );
}
function openPolicyUpload() {
  modal(
    "Upload a policy document",
    "Supported formats: PDF or DOCX, up to 10 MB. Extracted chunks retain page or section references.",
    `<div class="form-grid"><div class="form-field"><label>Document ID *</label><input class="field" name="id" required placeholder="e.g. DEL-POL-08"></div><div class="form-field"><label>Version</label><input class="field" name="version" value="1.0"></div><div class="form-field full"><label>Title</label><input class="field" name="title" placeholder="Defaults to the file name"></div><div class="form-field"><label>Category *</label><input class="field" name="category" list="supportnova-category-list" required><datalist id="supportnova-category-list">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div><div class="form-field"><label>Lifecycle status</label><select class="select" name="status" style="width:100%"><option>Draft</option><option>Active</option><option>Previous</option><option>Superseded</option></select></div><div class="form-field"><label>Effective date</label><input class="field" name="effective" type="date" value="${new Date().toISOString().slice(0, 10)}"></div><div class="form-field"><label>PDF or DOCX *</label><input class="field" name="file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required></div></div>`,
    async (fd, w) => {
      const file = fd.get("file");
      if (!file || !file.size)
        throw new Error("Choose a non-empty PDF or DOCX file.");
      await api("/api/policies/upload", { method: "POST", body: fd });
      w.remove();
      toast("Policy parsed and saved with traceable chunks");
      await refreshPage();
      render();
    },
    "Upload document",
  );
}
function showPolicy(id) {
  const p = state.policies.find((x) => x.id === id);
  if (!p) return;
  modal(
    esc(p.title),
    `${esc(p.id)} · Version ${esc(p.version)} · ${esc(p.status)}`,
    `<div class="notice">Effective ${fmtDate(p.effective)}</div><p class="card-value" style="white-space:pre-wrap;line-height:1.7">${esc(p.content)}</p><div class="hint">Document history is retained by ID and version.</div>`,
    async (_, w) => w.remove(),
    "Close",
  );
}
async function toggleRule(id) {
  try {
    await api("/api/rules/" + encodeURIComponent(id), {
      method: "POST",
      body: "{}",
    });
    state.rules = (await api("/api/rules")).rules;
    render();
    toast("Rule status updated");
  } catch (e) {
    toast(e.message, true);
  }
}
function openRule() {
  const departments = ["LOGISTICS", "BILLING", "PRODUCT", "TECHNICAL_SUPPORT", "CUSTOMER_CARE", "RETURNS", "SECURITY", "COMPLIANCE"];
  modal(
    "Add complaint rule",
    "The rule will be saved to Firebase and applied independently by Python validation.",
    `<div class="form-grid"><div class="form-field"><label>Category</label><input class="field" name="category" list="supportnova-category-list" value="Other" required><datalist id="supportnova-category-list">${cats.map((x) => `<option value="${esc(x)}">`).join("")}</datalist><p class="hint">New categories need an explicit matching rule condition.</p></div><div class="form-field"><label>Department</label><input class="field" name="department" list="supportnova-departments" value="CUSTOMER_CARE" required><datalist id="supportnova-departments">${departments.map((x) => `<option value="${esc(x)}">`).join("")}</datalist></div><div class="form-field"><label>Priority</label><select class="select" name="priority">${["P1", "P2", "P3", "P4"].map((x) => `<option ${x === "P3" ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="form-field"><label>Escalation</label><select class="select" name="escalation">${["No Escalation", "Supervisor Review", "Department Manager", "Specialist Team", "Compliance Review", "Critical Management Escalation"].map((x) => `<option>${esc(x)}</option>`).join("")}</select></div><div class="form-field full"><label>Trigger description</label><input class="field" name="trigger" required maxlength="300"></div><div class="form-field full"><label>Required action</label><textarea class="textarea" name="action" required maxlength="2000"></textarea></div><div class="form-field full"><label>Match conditions (JSON, optional)</label><input class="field" name="conditions" value="{}" required><p class="hint">Example: {"contains":["order","delayed"]} · supported keys: contains, any_contains, regex.</p></div><div class="form-field"><label>Effective date</label><input class="field" name="effective_at" type="date"></div><div class="form-field"><label>Expiry date</label><input class="field" name="expires_at" type="date"></div></div>`,
    async (fd, w) => {
      await api("/api/rules", { method: "POST", body: JSON.stringify(Object.fromEntries(fd)) });
      w.remove();
      state.rules = (await api("/api/rules")).rules;
      render();
      toast("Rule saved");
    },
    "Create rule",
  );
}
async function reviewAction(action, id) {
  if (action === "approve" || action === "assign") {
    try {
      const assignees = (await api("/api/assignees")).users;
      modal(
        action === "approve" ? "Approve and assign complaint" : "Reassign complaint owner",
        "Choose an active support user. The assignment is saved in the case history.",
        `<div class="form-field"><label>Assigned user</label><select class="select" name="assigned_user_id" style="width:100%" required><option value="" disabled selected>Choose an active agent or reviewer</option>${assignees.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} · ${esc(u.role)} · ${esc(u.email)}</option>`).join("")}</select>${assignees.length ? "" : '<p class="hint">Create an active agent or reviewer account in Administration first.</p>'}</div>`,
        async (fd, w) => {
          await api(`/api/tickets/${encodeURIComponent(id)}/${action}`, {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(fd)),
          });
          w.remove();
          toast(action === "approve" ? "Recommendation approved and assigned" : "Complaint reassigned");
          state.detail = null;
          await refreshPage();
          render();
        },
        action === "approve" ? "Approve" : "Reassign",
      );
    } catch (e) {
      toast(e.message, true);
    }
    return;
  }
  const wording =
    action === "escalate"
      ? "Escalate case"
      : action === "reject"
        ? "Reject recommendation"
        : "Edit decision";
  modal(
    wording,
    "A reason is required and will be recorded in the audit history.",
    `<div class="form-field"><label>Reviewer reason *</label><textarea class="textarea" name="reason" required minlength="5" placeholder="Explain the review decision"></textarea></div>${action === "override" ? `<div class="form-grid" style="margin-top:13px"><div class="form-field"><label>Category override (optional)</label><input class="field" name="category" list="supportnova-category-list" placeholder="Keep current or type a category"><datalist id="supportnova-category-list">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div><div class="form-field"><label>Priority override (optional)</label><select class="select" name="priority"><option value="">Keep current</option>${["P1", "P2", "P3", "P4"].map((c) => `<option>${c}</option>`).join("")}</select></div></div>` : ""}`,
    async (fd, w) => {
      await api(`/api/tickets/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(fd)),
      });
      w.remove();
      toast(
        action === "override"
          ? "Override saved with audit reason"
          : action === "reject"
            ? "Recommendation rejected"
            : "Case escalated",
      );
      state.detail = null;
      await refreshPage();
      render();
    },
    action === "escalate"
      ? "Escalate"
      : action === "reject"
        ? "Reject recommendation"
        : "Save decision",
  );
}
async function updateTicket(id, data) {
  try {
    await api(`/api/tickets/${encodeURIComponent(id)}/update`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    toast("Ticket updated");
    await openTicket(id);
    await refreshPage();
    render();
  } catch (e) {
    toast(e.message, true);
  }
}
function openStatus(id) {
  modal(
    "Update complaint status",
    "Choose the next lifecycle status. Changes are recorded in the case history.",
    `<div class="form-field"><label>Status</label><select class="select" name="status" style="width:100%">${["New", "Analyzed", "Assigned", "In Progress", "Awaiting Customer", "Escalated", "Resolved", "Closed", "Reopened"].map((s) => `<option ${state.detail?.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>`,
    async (fd, w) => {
      await updateTicket(id, Object.fromEntries(fd));
      w.remove();
    },
    "Update status",
  );
}
function openNote(id) {
  modal(
    "Add an internal note",
    "Visible to authorized support users. Customers cannot see internal notes.",
    `<div class="form-field"><label>Note *</label><textarea class="textarea" name="note" required maxlength="2000"></textarea></div>`,
    async (fd, w) => {
      await api(`/api/tickets/${encodeURIComponent(id)}/note`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(fd)),
      });
      w.remove();
      toast("Internal note added");
      await openTicket(id);
    },
    "Add note",
  );
}
async function init() {
  try {
    await start();
  } catch (e) {
    $("#app").innerHTML =
      `<div class="boot"><div class="brand-mark">N</div><p>SupportNova could not connect to its local service.</p><button class="btn btn-primary" id="retry-app">Retry</button></div>`;
    $("#retry-app").onclick = () => location.reload();
  }
}
init();
async function reloadAdmin() {
  const [u, s, e, p] = await Promise.all([
    api("/api/users"),
    api("/api/sla"),
    api("/api/escalations"),
    api("/api/prompts"),
  ]);
  state.users = u.users;
  state.sla = s.rules;
  state.escalations = e.conditions;
  state.prompts = p.prompts;
}
async function reloadFollowups() {
  state.followups = (await api("/api/followups")).tasks;
}
function adminModal(kind, id) {
  const u = state.users.find((x) => x.id === id),
    s = state.sla.find((x) => x.id === id),
    ec = state.escalations.find((x) => x.id === id);
  if (kind === "add-user") {
    modal(
      "Add workspace user",
      "A unique email and a password of at least 12 characters are required.",
      `<div class="form-grid"><div class="form-field"><label>Name</label><input class="field" name="name" required></div><div class="form-field"><label>Email</label><input class="field" name="email" type="email" required></div><div class="form-field"><label>Role</label><select class="select" name="role" style="width:100%">${["customer", "agent", "reviewer", "admin", "auditor"].map((x) => `<option>${x}</option>`).join("")}</select><p class="hint">Customer: own cases. Agent: assigned cases. Reviewer/Manager: approve and escalate. Admin: users and settings. Auditor: read-only oversight.</p></div><div class="form-field"><label>Temporary password</label><input class="field" name="password" type="password" minlength="12" required autocomplete="new-password"></div></div>`,
      async (fd, w) => {
        await api("/api/users", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(fd)),
        });
        w.remove();
        await reloadAdmin();
        render();
        toast("User created");
      },
      "Create user",
    );
    return;
  }
  if (kind === "user" && u) {
    modal(
      "Edit user access",
      esc(u.email),
      `<div class="form-field"><label>Name</label><input class="field" name="name" value="${esc(u.name)}" required></div><div class="form-field"><label>Role</label><select class="select" name="role" style="width:100%">${["customer", "agent", "reviewer", "admin", "auditor"].map((x) => `<option ${u.role === x ? "selected" : ""}>${x}</option>`).join("")}</select><p class="hint">Customer: own cases. Agent: assigned cases. Reviewer: approve and escalate. Admin: users and settings. Auditor: read-only oversight.</p></div><div class="form-field"><label>Set temporary password (optional)</label><input class="field" name="password" type="password" minlength="12" autocomplete="new-password"><p class="hint">Leave blank to keep the current password. Share any temporary password securely and ask the user to change it.</p></div><div class="form-field"><label><input type="checkbox" name="active" value="true" ${u.active ? "checked" : ""}> Account active</label></div>`,
      async (fd, w) => {
        const v = Object.fromEntries(fd);
        v.active = fd.has("active");
        await api("/api/users/" + id, {
          method: "POST",
          body: JSON.stringify(v),
        });
        w.remove();
        await reloadAdmin();
        render();
        toast("User access updated");
      },
    );
    return;
  }
  if (kind === "sla" && s) {
    modal(
      "Edit service targets",
      `${esc(s.category)} · ${esc(s.priority)}`,
      `<div class="form-grid"><div class="form-field"><label>First response (hours)</label><input class="field" name="response_hours" type="number" min="1" max="8760" value="${s.response_hours}" required></div><div class="form-field"><label>Resolution (hours)</label><input class="field" name="resolution_hours" type="number" min="1" max="8760" value="${s.resolution_hours}" required></div><div class="form-field"><label><input type="checkbox" name="active" value="true" ${s.active ? "checked" : ""}> Active target</label></div></div>`,
      async (fd, w) => {
        const v = Object.fromEntries(fd);
        v.active = fd.has("active");
        await api("/api/sla/" + id, {
          method: "POST",
          body: JSON.stringify(v),
        });
        w.remove();
        await reloadAdmin();
        render();
        toast("SLA target updated");
      },
    );
    return;
  }
  if (kind === "escalation" && ec) {
    modal(
      "Edit escalation condition",
      "Regular expression is matched against complaint text.",
      `<div class="form-field"><label>Name</label><input class="field" name="name" value="${esc(ec.name)}" required></div><div class="form-field"><label>Match pattern</label><input class="field" name="match_text" value="${esc(ec.match_text)}" required></div><div class="form-grid"><div class="form-field"><label>Escalation level</label><select class="select" name="level" style="width:100%">${["No Escalation", "Specialist Team", "Supervisor Review", "Compliance Review", "Critical Management Escalation"].map((x) => `<option ${ec.level === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="form-field"><label>Priority</label><select class="select" name="priority" style="width:100%">${["P1", "P2", "P3", "P4"].map((x) => `<option ${ec.priority === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="form-field"><label><input type="checkbox" name="active" value="true" ${ec.active ? "checked" : ""}> Active condition</label></div></div>`,
      async (fd, w) => {
        const v = Object.fromEntries(fd);
        v.active = fd.has("active");
        await api("/api/escalations/" + id, {
          method: "POST",
          body: JSON.stringify(v),
        });
        w.remove();
        await reloadAdmin();
        render();
        toast("Escalation condition updated");
      },
    );
    return;
  }
  if (kind === "prompt") {
    modal(
      "Create prompt version",
      "Activating a version makes it the prompt for new analysis runs.",
      `<div class="form-grid"><div class="form-field"><label>Version (for example 1.2)</label><input class="field" name="version" pattern="[0-9]+\\.[0-9]+" required></div><div class="form-field"><label><input type="checkbox" name="activate" value="true" checked> Activate immediately</label></div><div class="form-field full"><label>Prompt text (100–20,000 characters)</label><textarea class="textarea" name="content" minlength="100" maxlength="20000" required></textarea></div></div>`,
      async (fd, w) => {
        const v = Object.fromEntries(fd);
        v.activate = fd.has("activate");
        await api("/api/prompts", { method: "POST", body: JSON.stringify(v) });
        w.remove();
        await reloadAdmin();
        render();
        toast("Prompt version saved");
      },
      "Save version",
    );
  }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest(
    "[data-admin],[data-user-edit],[data-sla-edit],[data-escalation-edit],[data-followup-respond],[data-followup-complete]",
  );
  if (!b) return;
  try {
    if (b.dataset.admin) {
      adminModal(b.dataset.admin === "add-user" ? "add-user" : "prompt");
      return;
    }
    if (b.dataset.userEdit) {
      adminModal("user", b.dataset.userEdit);
      return;
    }
    if (b.dataset.slaEdit) {
      adminModal("sla", b.dataset.slaEdit);
      return;
    }
    if (b.dataset.escalationEdit) {
      adminModal("escalation", b.dataset.escalationEdit);
      return;
    }
    if (b.dataset.followupRespond) {
      const id = b.dataset.followupRespond;
      modal(
        "Respond to information request",
        "Your response will be added to the case history.",
        `<div class="form-field"><label>Response</label><textarea class="textarea" name="response" required minlength="5" maxlength="4000"></textarea></div>`,
        async (fd, w) => {
          await api("/api/followups/" + id + "/respond", {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(fd)),
          });
          w.remove();
          await reloadFollowups();
          render();
          toast("Response sent");
        },
        "Send response",
      );
      return;
    }
    if (b.dataset.followupComplete) {
      await api("/api/followups/" + b.dataset.followupComplete + "/complete", {
        method: "POST",
        body: "{}",
      });
      await reloadFollowups();
      render();
      toast("Follow-up completed");
    }
  } catch (err) {
    toast(err.message, true);
  }
});
function adminMarkup() {
  return `${pageHead("WORKSPACE SETTINGS", "Administration", "Manage access, service targets, escalation controls, and the active AI prompt.", '<button class="btn btn-primary" data-admin="add-user">＋ Add user</button>')}<section class="panel"><div class="panel-head"><div><div class="panel-title">Users and access</div><div class="panel-subtitle">Deactivate accounts or change their workspace role.</div></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>State</th><th>Action</th></tr></thead><tbody>${state.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.active ? "Active" : "Inactive"}</td><td><button class="btn" data-user-edit="${esc(u.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div></section><section class="panel" style="margin-top:15px"><div class="panel-head"><div><div class="panel-title">Service level targets</div><div class="panel-subtitle">Response and resolution hours by category and priority.</div></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Category</th><th>Priority</th><th>First response</th><th>Resolution</th><th>State</th><th></th></tr></thead><tbody>${state.sla.map((s) => `<tr><td>${esc(s.category)}</td><td>${esc(s.priority)}</td><td>${s.response_hours} h</td><td>${s.resolution_hours} h</td><td>${s.active ? "Active" : "Paused"}</td><td><button class="btn" data-sla-edit="${esc(s.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div></section><section class="panel" style="margin-top:15px"><div class="panel-head"><div><div class="panel-title">Escalation conditions</div><div class="panel-subtitle">Mandatory escalation matching runs in the deterministic pipeline.</div></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Condition</th><th>Match pattern</th><th>Level</th><th>Priority</th><th>State</th><th></th></tr></thead><tbody>${state.escalations.map((e) => `<tr><td>${esc(e.name)}<div class="mono">${esc(e.id)} · v${e.version}</div></td><td class="rule-desc">${esc(e.match_text)}</td><td>${esc(e.level)}</td><td>${esc(e.priority)}</td><td>${e.active ? "Active" : "Paused"}</td><td><button class="btn" data-escalation-edit="${esc(e.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div></section><section class="panel" style="margin-top:15px"><div class="panel-head"><div><div class="panel-title">Prompt versions</div><div class="panel-subtitle">The active prompt is recorded with each analysis run.</div></div><button class="btn" data-admin="new-prompt">＋ New prompt version</button></div><div class="panel-body">${state.prompts.map((p) => `<span class="badge ${p.status === "Active" ? "badge-verified" : "badge-muted"}" style="margin:0 8px 8px 0">v${esc(p.version)} · ${esc(p.status)}</span>`).join("")}</div></section>`;
}
function followupsMarkup() {
  return `${pageHead("CASE MANAGEMENT", "Follow-ups", "Open tasks, customer information requests, and resolution confirmations.", "")}<div class="panel table-wrap"><table class="table"><thead><tr><th>Task</th><th>Complaint</th><th>Description</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${state.followups.map((f) => `<tr><td>${esc(f.task_type)}</td><td><button class="text-link" data-ticket="${esc(f.ticket_id)}">${esc(f.ticket_id)} · ${esc(f.title)}</button></td><td>${esc(f.description)}</td><td>${fmtDate(f.due_at)}</td><td>${badge(f.status)}</td><td>${f.status === "Open" && state.user.role === "customer" && f.task_type === "Information Request" ? `<button class="btn btn-primary" data-followup-respond="${esc(f.id)}">Respond</button>` : f.status === "Open" && state.user.role !== "customer" ? `<button class="btn" data-followup-complete="${esc(f.id)}">Complete</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="6">No follow-up tasks to show.</td></tr>'}</tbody></table></div>`;
}
