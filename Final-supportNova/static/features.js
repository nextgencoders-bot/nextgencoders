// Completes detail and governance actions that are attached to rendered workspace views.
(() => {
  const categories = [
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
  const departments = [
    "LOGISTICS",
    "BILLING",
    "PRODUCT",
    "TECHNICAL_SUPPORT",
    "CUSTOMER_CARE",
    "RETURNS",
    "SECURITY",
    "COMPLIANCE",
  ];
  const addField = (root, label, name, type = "text", value = "") => {
    const wrap = document.createElement("div");
    wrap.className = "form-field";
    const l = document.createElement("label");
    l.textContent = label;
    const i = document.createElement("input");
    i.className = "field";
    i.name = name;
    i.type = type;
    i.value = value;
    wrap.append(l, i);
    root.append(wrap);
  };
  function enrich() {
    const grid = document.querySelector(".detail-grid"),
      ticket = state.detail;
    if (!grid || !ticket || !state.user || grid.dataset.srsEnriched) return;
    grid.dataset.srsEnriched = "1";
    const customer = state.user.role === "customer";
    const card = document.createElement("section");
    card.className = "detail-card wide";
    const label = document.createElement("div");
    label.className = "card-label";
    label.textContent = "Case details and service targets";
    card.append(label);
    const p = document.createElement("div");
    p.className = "card-value";
    const list = (v) => {
      if (typeof v === "string") {
        try {
          v = JSON.parse(v);
        } catch {
          v = [];
        }
      }
      return Array.isArray(v) ? v.join(", ") : "";
    };
    const eligibility =
      typeof ticket.eligibility === "string"
        ? (() => {
            try {
              return JSON.parse(ticket.eligibility);
            } catch {
              return {};
            }
          })()
        : ticket.eligibility || {};
    const lines = customer
      ? [
          `Submitted ${fmtDate(ticket.created_at)}`,
          `Status: ${ticket.status}`,
          ticket.response ? `Latest update: ${ticket.response}` : "",
        ]
      : [
          `Priority: ${ticket.priority} · Urgency: ${ticket.urgency} · Sentiment: ${ticket.sentiment}`,
          `Secondary issues: ${list(ticket.secondary_issues) || "None identified"}`,
          `Supporting departments: ${list(ticket.supporting_departments) || "None"}`,
          `Emotion indicators: ${list(ticket.emotion_indicators) || "None"}`,
          `Eligibility: ${
            Object.entries(eligibility)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ") || "No conditional remedy identified"
          }`,
          `Clarification needed: ${list(ticket.clarification_questions) || "None"}`,
          `Response due: ${fmtDate(ticket.response_due_at)} · Resolution due: ${fmtDate(ticket.resolution_due_at)}`,
          `SLA state: ${ticket.sla_status || "On Track"}`,
        ].filter(Boolean);
    p.textContent = lines.join("\n");
    p.style.whiteSpace = "pre-wrap";
    card.append(p);
    const tasks = Array.isArray(ticket.followups) ? ticket.followups : [];
    if (tasks.length && !customer) {
      const taskline = document.createElement("div");
      taskline.className = "ticket-below";
      taskline.style.marginTop = "10px";
      taskline.textContent = `Follow-up tasks: ${tasks.map((x) => `${x.task_type} (${x.status}, due ${fmtDate(x.due_at)})`).join(" · ")}`;
      card.append(taskline);
    }
    grid.append(card);
    const actor = ["agent", "reviewer", "admin"].includes(state.user.role);
    if (actor) {
      const actions = document.createElement("div");
      actions.className = "detail-actions";
      actions.style.margin = "0 0 14px";
      const publish = document.createElement("button");
      publish.className = "btn btn-primary";
      publish.textContent = "Publish customer update";
      publish.dataset.caseAction = "publish";
      actions.append(publish);
      const task = document.createElement("button");
      task.className = "btn";
      task.textContent = "＋ Create follow-up";
      task.dataset.caseAction = "followup";
      actions.append(task);
      grid.parentElement.insertBefore(actions, grid);
    }
  }
  const observer = new MutationObserver(enrich);
  observer.observe(document.getElementById("app") || document.body, {
    childList: true,
    subtree: true,
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-case-action]");
    if (!b) return;
    const ticket = state.detail;
    if (!ticket) return;
    if (b.dataset.caseAction === "publish") {
      const reviewer = ["reviewer", "admin"].includes(state.user.role);
      modal(
        "Publish customer update",
        "This message will appear in the customer portal and case history.",
        `<div class="form-field"><label>Customer update *</label><textarea class="textarea" name="message" required maxlength="4000">${esc(ticket.response || "")}</textarea></div>${reviewer ? '<div class="form-field"><label>Reviewer reason *</label><input class="field" name="reason" required minlength="5"></div>' : ""}`,
        async (fd, w) => {
          await api(`/api/tickets/${encodeURIComponent(ticket.id)}/publish`, {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(fd)),
          });
          w.remove();
          await openTicket(ticket.id);
          toast("Customer update published");
        },
        "Publish update",
      );
      return;
    }
    if (b.dataset.caseAction === "followup") {
      modal(
        "Create follow-up task",
        "Assign a due date and action to this complaint.",
        `<div class="form-grid"><div class="form-field"><label>Task type</label><select class="select" name="task_type" style="width:100%">${["Information Request", "Resolution Update", "Escalation Acknowledgment", "Closure Confirmation"].map((x) => `<option>${x}</option>`).join("")}</select></div><div class="form-field"><label>Due date and time</label><input class="field" name="due_at" type="datetime-local" required></div><div class="form-field full"><label>Description</label><textarea class="textarea" name="description" maxlength="1000" required></textarea></div></div>`,
        async (fd, w) => {
          const v = Object.fromEntries(fd);
          v.due_at = new Date(v.due_at).toISOString();
          await api(`/api/tickets/${encodeURIComponent(ticket.id)}/followups`, {
            method: "POST",
            body: JSON.stringify(v),
          });
          w.remove();
          await openTicket(ticket.id);
          toast("Follow-up task created");
        },
        "Create task",
      );
      return;
    }
  });
  document.addEventListener("click", (e) => {
    const heading = document.querySelector(".heading-row");
    if (!heading || state.page !== "rules" || state.user.role !== "admin")
      return;
    if (e.target.closest("[data-create-rule]")) {
      modal(
        "Add resolution rule",
        "This rule joins the deterministic category matrix. Optional conditions must use JSON.",
        `<div class="form-grid"><div class="form-field"><label>Category</label><select class="select" name="category" style="width:100%">${categories.map((x) => `<option>${x}</option>`).join("")}</select></div><div class="form-field"><label>Subcategory (optional)</label><input class="field" name="subcategory"></div><div class="form-field"><label>Department</label><select class="select" name="department" style="width:100%">${departments.map((x) => `<option>${x}</option>`).join("")}</select></div><div class="form-field"><label>Priority</label><select class="select" name="priority" style="width:100%">${["P1", "P2", "P3", "P4"].map((x) => `<option>${x}</option>`).join("")}</select></div><div class="form-field"><label>Escalation</label><select class="select" name="escalation" style="width:100%">${["No Escalation", "Supervisor Review", "Department Manager", "Specialist Team", "Compliance Review", "Critical Management Escalation"].map((x) => `<option>${x}</option>`).join("")}</select></div><div class="form-field"><label>Effective date</label><input class="field" name="effective_at" type="date"></div><div class="form-field"><label>Expiry date</label><input class="field" name="expires_at" type="date"></div><div class="form-field full"><label>Trigger</label><input class="field" name="trigger" required></div><div class="form-field full"><label>Required action</label><textarea class="textarea" name="action" required></textarea></div><div class="form-field full"><label>Conditions JSON (optional)</label><input class="field" name="conditions" value="{}"></div></div>`,
        async (fd, w) => {
          await api("/api/rules", {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(fd)),
          });
          w.remove();
          state.rules = (await api("/api/rules")).rules;
          render();
          toast("Resolution rule added");
        },
        "Create rule",
      );
      return;
    }
  });
  const addRuleButton = () => {
    if (state.page !== "rules" || state.user?.role !== "admin") return;
    const actions = document.querySelector(".heading-row .actions");
    if (actions && !actions.querySelector("[data-create-rule]")) {
      const b = document.createElement("button");
      b.className = "btn btn-primary";
      b.textContent = "＋ Add rule";
      b.dataset.createRule = "1";
      actions.append(b);
    }
  };
  new MutationObserver(addRuleButton).observe(
    document.getElementById("app") || document.body,
    { childList: true, subtree: true },
  );
  function governViews() {
    if (!state.user) return;
    if (
      ["tickets", "review"].includes(state.page) &&
      state.user.role !== "customer"
    ) {
      const toolbar = document.querySelector(".page-toolbar");
      if (toolbar && !toolbar.dataset.srsFilters) {
        toolbar.dataset.srsFilters = "1";
        const filters = [
          ["department", "All departments", departments],
          ["priority", "All priorities", ["P1", "P2", "P3", "P4"]],
          ["sentiment", "All sentiment", ["Positive", "Neutral", "Negative", "Strongly Negative"]],
          [
            "verification",
            "All verification states",
            [
              "Verified",
              "Verified with Agent Review",
              "Manual Review Required",
            ],
          ],
          [
            "escalation",
            "All escalation levels",
            [
              "No Escalation",
              "Supervisor Review",
              "Department Manager",
              "Specialist Team",
              "Compliance Review",
              "Critical Management Escalation",
            ],
          ],
        ];
        for (const [key, label, values] of filters) {
          const s = document.createElement("select");
          s.className = "select";
          s.dataset.srsFilter = key;
          s.setAttribute("aria-label", label);
          s.innerHTML = `<option value="">${label}</option>${values.map((v) => `<option value="${esc(v)}">${esc(v.replaceAll("_", " "))}</option>`).join("")}`;
          s.value = state.filters[key] || "";
          toolbar.append(s);
        }
        for (const [key, label] of [
          ["created_from", "From"],
          ["created_to", "To"],
        ]) {
          const input = document.createElement("input");
          input.className = "field";
          input.type = "date";
          input.dataset.srsFilter = key;
          input.setAttribute("aria-label", label + " date");
          input.value = state.filters[key] || "";
          input.style.maxWidth = "145px";
          toolbar.append(input);
        }
        const risk = document.createElement("label");
        risk.className = "hint";
        risk.style.whiteSpace = "nowrap";
        risk.innerHTML =
          '<input type="checkbox" data-srs-filter="sla_risk"> SLA risk';
        risk.querySelector("input").checked = Boolean(state.filters.sla_risk);
        toolbar.append(risk);
        toolbar.addEventListener("change", (e) => {
          const el = e.target.closest("[data-srs-filter]");
          if (!el) return;
          state.filters[el.dataset.srsFilter] =
            el.type === "checkbox" ? el.checked : el.value;
          loadTickets();
        });
      }
    }
    if (state.page === "policies") {
      const content = document.querySelector("#view");
      if (content && !content.querySelector("[data-conflict-panel]")) {
        const actions = document.querySelector(".heading-row .actions");
        if (
          actions &&
          ["admin", "reviewer"].includes(state.user.role) &&
          !actions.querySelector("[data-conflict-new]")
        ) {
          const b = document.createElement("button");
          b.className = "btn";
          b.textContent = "Record policy conflict";
          b.dataset.conflictNew = "1";
          actions.append(b);
        }
        if (state.policyConflicts?.length) {
          const panel = document.createElement("section");
          panel.className = "panel";
          panel.style.marginTop = "15px";
          panel.dataset.conflictPanel = "1";
          panel.innerHTML =
            '<div class="panel-head"><div><div class="panel-title">Open policy conflicts</div><div class="panel-subtitle">Conflicted policy pairs are held for human review.</div></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Category</th><th>Documents</th><th>Description</th><th>Reported</th><th></th></tr></thead><tbody></tbody></table></div>';
          const body = panel.querySelector("tbody");
          for (const c of state.policyConflicts) {
            const tr = document.createElement("tr");
            for (const v of [
              c.category,
              `${c.document_a} / ${c.document_b}`,
              c.description,
              c.created_at,
            ]) {
              const td = document.createElement("td");
              td.textContent = v || "";
              tr.append(td);
            }
            const td = document.createElement("td");
            if (["admin", "reviewer"].includes(state.user.role)) {
              const b = document.createElement("button");
              b.className = "btn";
              b.textContent = "Resolve";
              b.dataset.conflictResolve = c.id;
              td.append(b);
            }
            tr.append(td);
            body.append(tr);
          }
          content.append(panel);
        }
      }
      for (const form of document.querySelectorAll("#modal-form")) {
        const title = document.querySelector(".modal-title")?.textContent,
          body = form.querySelector(".modal-body");
        if (!body) continue;
        if (
          [
            "Add or update a policy source",
            "Upload a policy document",
          ].includes(title) &&
          !form.dataset.expiry
        ) {
          form.dataset.expiry = "1";
          const f = document.createElement("div");
          f.className = "form-field";
          f.innerHTML =
            '<label>Expiry date (optional)</label><input class="field" name="expires" type="date">';
          body.querySelector(".form-grid")?.append(f);
        }
        const policy = state.policies?.find((x) => x.title === title);
        if (policy && !form.dataset.lifecycle) {
          form.dataset.lifecycle = "1";
          const box = document.createElement("div");
          box.className = "form-field";
          box.innerHTML =
            '<label>Policy lifecycle</label><select class="select" data-policy-status style="width:100%"><option>Draft</option><option>Active</option><option>Previous</option><option>Superseded</option><option>Expired</option><option>Archived</option></select><button type="button" class="btn" data-policy-save-status style="margin-top:8px">Update status</button><button type="button" class="btn" data-policy-history style="margin:8px 0 0 8px">View version history</button><div data-policy-history-result class="ticket-below" style="margin-top:8px"></div>';
          body.append(box);
          box.querySelector("[data-policy-status]").value = policy.status;
        }
      }
      if (state.rules?.length) {
        const tbody = document.querySelector("#view .table tbody");
        if (tbody)
          [...tbody.rows].forEach((tr, i) => {
            if (state.rules[i] && !tr.querySelector("[data-rule-edit]")) {
              const td = tr.cells[tr.cells.length - 1],
                b = document.createElement("button");
              b.className = "btn";
              b.textContent = "Edit";
              b.dataset.ruleEdit = state.rules[i].id;
              td.append(b);
            }
          });
      }
    }
  }
  new MutationObserver(governViews).observe(
    document.getElementById("app") || document.body,
    { childList: true, subtree: true },
  );
  document.addEventListener("click", async (e) => {
    const b = e.target.closest(
      "[data-conflict-new],[data-conflict-resolve],[data-policy-save-status],[data-policy-history],[data-rule-edit]",
    );
    if (!b) return;
    try {
      if (b.dataset.conflictNew) {
        modal(
          "Record policy conflict",
          "Record two existing sources that disagree on complaint handling.",
          `<div class="form-grid"><div class="form-field"><label>Category</label><select class="select" name="category" style="width:100%">${categories.map((x) => `<option>${x}</option>`).join("")}</select></div>${["document_a", "document_b"].map((key, i) => `<div class="form-field"><label>Policy ${i + 1}</label><select class="select" name="${key}" style="width:100%">${state.policies.map((p) => `<option value="${esc(p.id)}">${esc(p.id)} · ${esc(p.title)}</option>`).join("")}</select></div>`).join("")}<div class="form-field full"><label>Description</label><textarea class="textarea" name="description" required minlength="5"></textarea></div></div>`,
          async (fd, w) => {
            await api("/api/policy-conflicts", {
              method: "POST",
              body: JSON.stringify(Object.fromEntries(fd)),
            });
            w.remove();
            await go("policies");
            toast("Policy conflict recorded");
          },
          "Record conflict",
        );
        return;
      }
      if (b.dataset.conflictResolve) {
        const id = b.dataset.conflictResolve;
        modal(
          "Resolve policy conflict",
          "A documented reason is required.",
          `<div class="form-field"><label>Resolution reason</label><textarea class="textarea" name="reason" required minlength="5"></textarea></div>`,
          async (fd, w) => {
            await api("/api/policy-conflicts/resolve", {
              method: "POST",
              body: JSON.stringify({ id, reason: fd.get("reason") }),
            });
            w.remove();
            await go("policies");
            toast("Policy conflict resolved");
          },
          "Resolve conflict",
        );
        return;
      }
      if (b.dataset.policySaveStatus) {
        const form = b.closest("#modal-form"),
          policy = state.policies.find(
            (x) =>
              x.title === document.querySelector(".modal-title")?.textContent,
          );
        if (!policy) return;
        await api(`/api/policies/${encodeURIComponent(policy.id)}/status`, {
          method: "POST",
          body: JSON.stringify({
            status: form.querySelector("[data-policy-status]").value,
          }),
        });
        document.querySelector(".modal-backdrop")?.remove();
        await go("policies");
        toast("Policy lifecycle updated");
        return;
      }
      if (b.dataset.policyHistory) {
        const policy = state.policies.find(
          (x) =>
            x.title === document.querySelector(".modal-title")?.textContent,
        );
        if (!policy) return;
        const h = await api(
            `/api/policies/${encodeURIComponent(policy.id)}/versions`,
          ),
          root = b.parentElement.querySelector("[data-policy-history-result]");
        root.textContent =
          h.versions
            .map(
              (x) =>
                `v${x.version} · ${x.status} · ${x.actor} · ${fmtDate(x.created_at)}`,
            )
            .join(" | ") || "No earlier versions.";
        return;
      }
      if (b.dataset.ruleEdit) {
        const r = state.rules.find((x) => x.id === b.dataset.ruleEdit);
        if (!r) return;
        modal(
          "Edit resolution rule",
          `${esc(r.id)} · version ${r.version}`,
          `<div class="form-grid"><div class="form-field"><label>Category</label><select class="select" name="category" style="width:100%">${categories.map((x) => `<option ${r.category === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="form-field"><label>Subcategory</label><input class="field" name="subcategory" value="${esc(r.subcategory || "")}"></div><div class="form-field"><label>Department</label><select class="select" name="department" style="width:100%">${departments.map((x) => `<option ${r.department === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="form-field"><label>Priority</label><select class="select" name="priority" style="width:100%">${["P1", "P2", "P3", "P4"].map((x) => `<option ${r.priority === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="form-field"><label>Escalation</label><select class="select" name="escalation" style="width:100%">${["No Escalation", "Supervisor Review", "Department Manager", "Specialist Team", "Compliance Review", "Critical Management Escalation"].map((x) => `<option ${r.escalation === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="form-field"><label>Effective date</label><input class="field" name="effective_at" type="date" value="${esc(r.effective_at || "")}"></div><div class="form-field"><label>Expiry date</label><input class="field" name="expires_at" type="date" value="${esc(r.expires_at || "")}"></div><div class="form-field full"><label>Trigger</label><input class="field" name="trigger" value="${esc(r.trigger)}" required></div><div class="form-field full"><label>Action</label><textarea class="textarea" name="action" required>${esc(r.action)}</textarea></div><div class="form-field full"><label>Conditions JSON</label><input class="field" name="conditions" value="${esc(r.conditions || "{}")}"></div></div>`,
          async (fd, w) => {
            await api(`/api/rules/${encodeURIComponent(r.id)}`, {
              method: "POST",
              body: JSON.stringify(Object.fromEntries(fd)),
            });
            w.remove();
            state.rules = (await api("/api/rules")).rules;
            render();
            toast("Rule updated");
          },
          "Save rule",
        );
        return;
      }
    } catch (err) {
      toast(err.message, true);
    }
  });
  const intakeObserver = new MutationObserver(() => {
    const form = document.querySelector("#modal-form");
    if (!form || form.dataset.srsFields) return;
    const title = document.querySelector(".modal-title");
    if (title?.textContent !== "Submit a complaint") return;
    form.dataset.srsFields = "1";
    const target = form.querySelector(".modal-body .form-grid");
    if (!target) return;
    const a = document.createElement("div");
    a.className = "form-field";
    a.innerHTML =
      '<label>Transaction date</label><input class="field" name="transaction_date" type="date">';
    const b = document.createElement("div");
    b.className = "form-field";
    b.innerHTML =
      '<label>Previous complaint ID (optional)</label><input class="field" name="previous_complaint_id" placeholder="SN-...">';
    const anchor = target.querySelector(
      'input[name="customer_type"]',
    )?.parentElement;
    anchor?.after(a, b);
  });
  intakeObserver.observe(document.body, { childList: true, subtree: true });
  const passwordObserver = new MutationObserver(() => {
    const form = document.querySelector("#modal-form"),
      title = document.querySelector(".modal-title");
    if (
      !form ||
      title?.textContent !== "Edit user access" ||
      form.dataset.passwordReset
    )
      return;
    form.dataset.passwordReset = "1";
    const f = document.createElement("div");
    f.className = "form-field";
    f.innerHTML =
      '<label>Reset password (optional, minimum 12 characters)</label><input class="field" name="password" type="password" minlength="12" autocomplete="new-password">';
    form.querySelector(".modal-body")?.append(f);
  });
  passwordObserver.observe(document.body, { childList: true, subtree: true });
})();
