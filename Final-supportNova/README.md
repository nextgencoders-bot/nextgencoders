# SupportNova | ResponseX Intelligence

SupportNova is a complaint-management application based on the supplied Product Requirements Document (PRD/SRS). Firebase mode is the default: Firebase Authentication manages identities and sign-in, and Cloud Firestore stores application records and file data. Cloud Storage is optional. The local SQLite layer is an in-memory working cache in Firebase mode; it is not the durable database. Set <code>SUPPORTNOVA_STORAGE=sqlite</code> only when you deliberately want the standalone local demo.

## Firebase setup

1. Create or select a Firebase project on Spark (free). Enable **Email/Password** in Authentication and create a Cloud Firestore database. Cloud Storage is not needed for the free configuration.
2. Register a Firebase web app and copy its Web API key. Create/download a service account credential for this trusted Python server. Keep the credential private and never put it in browser code.
3. Copy <code>.env.example</code> to <code>.env</code> or append the Firebase settings to your existing <code>.env</code>. Fill in <code>FIREBASE_PROJECT_ID</code>, <code>FIREBASE_SERVICE_ACCOUNT</code>, and <code>FIREBASE_WEB_API_KEY</code>. Leave <code>FIREBASE_STORAGE_BUCKET</code> unset on Spark. Preserve existing AI-provider settings.
4. Install dependencies: <code>python -m pip install -r requirements.txt</code>.
5. Deploy the restrictive Firestore client rules from the project root using Firebase CLI after selecting your Firebase project: <code>firebase deploy --only firestore:rules</code>. The application uses the trusted Admin SDK on the server; its own role checks control access.
6. **Preserve and migrate demo data before creating the first Firebase user.** With <code>data/supportnova.db</code> still present, run <code>python server.py</code>. On an empty Firestore database, startup migrates the local application records and synthetic seed data, then keeps the server running. Wait for the “SupportNova is ready” message and stop it with <code>Ctrl+C</code>.
7. Run <code>python firebase_bootstrap_admin.py</code> and create the first administrator. If that email already exists in Firebase Authentication, the script completes its SupportNova admin profile and lets you keep or reset its password. Run <code>python server.py</code> again. It hydrates the in-memory cache from Firebase; open <code>http://127.0.0.1:8000/manage</code> and sign in with the administrator account you created. The root page is the customer storefront; the administrator can create additional support users in the Administration screen.

For a new project without existing local data, use the same sequence: start the app once to seed Firestore, stop it with <code>Ctrl+C</code>, create the first administrator with the bootstrap script, then start the app again. The local <code>serviceAccountKey.json</code> filename is ignored by Git. Prefer Application Default Credentials in a managed Google Cloud runtime; locally set <code>FIREBASE_SERVICE_ACCOUNT</code> to the credential path.

**Free-plan file storage:** With no Storage bucket configured, SupportNova stores attachments and uploaded policy source files as 500 KB binary chunks in Firestore. Each Firestore document stays under its 1 MiB document-size limit, but file activity consumes Firestore reads, writes, and stored data. Firebase free quotas are limited; heavy use can require billing. Existing per-file limits still apply. If you later choose Blaze and configure <code>FIREBASE_STORAGE_BUCKET</code>, files use Cloud Storage instead. [Firestore quotas and limits](https://firebase.google.com/docs/firestore/quotas) [Firebase Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)

## Run locally

After Firebase is configured and the administrator is created, run <code>./start-local.ps1</code> in PowerShell. The customer storefront is at [http://127.0.0.1:8000](http://127.0.0.1:8000) and the agent/admin workspace is at [http://127.0.0.1:8000/manage](http://127.0.0.1:8000/manage). Requires Python 3.10 or newer.

## Storefront orders and complaints

Customers create or sign in to a customer account during checkout (12-character minimum password). An active customer session is reused for later checkouts for 12 hours, so the customer name, email, and password are not requested again during that session. Orders are priced and saved server-side in Firestore's <code>orders</code> collection, and each signed-in customer sees only their own order history. Complaints require an order belonging to that account, are analyzed by the configured GenAI pipeline and independent Python validation, then routed automatically. Verified cases go to the least-loaded active agent; cases verified with agent review go to an agent with that flag. High-risk, uncertain, disagreed, or AI-failed cases go to the reviewer queue. If no active agent is available, the case waits in that queue. Reviewers can still reassign cases manually. Agents do not make intake validity/rejection decisions. Checkout records the selected payment method but does not process or charge payments.

To use only the local SQLite demo instead, set <code>SUPPORTNOVA_STORAGE=sqlite</code> in <code>.env</code>. Local demo accounts are <code>admin@supportnova.demo</code> / <code>NovaDemo2026!</code> plus the other role addresses shown on the sign-in screen. Do not use those demo credentials in Firebase or a hosted environment.

Optional PDF/DOCX policy parsers are included in <code>requirements.txt</code>. Administrators can upload policy PDF and DOCX files, which are parsed into versioned and traceable chunks.

## Verify the running server and AI provider

- The current application build reports `1.0.4` at `http://127.0.0.1:8000/api/health`. It also reports whether Firebase or SQLite is active. If the browser still shows `/api/assignees` as 404, the browser is connected to an older server process or another copy of the project. Stop that process with `Ctrl+C`, launch this folder with `python -u server.py`, confirm health reports `1.0.4`, then refresh the browser (static files are served with `no-store`).
- The workspace status text means the most recent saved GenAI run succeeded, failed, or has not run. It is not a live provider health check. Submit a synthetic complaint to make a fresh run, then inspect its analysis details for the provider outcome.
- Set `GROQ_API_KEY` in your local `.env` to a GroqCloud API key and keep `GROQ_MODEL=openai/gpt-oss-120b`. Never paste the key into chat, Firestore, or frontend code. Install dependencies with `python -m pip install -r requirements.txt`, restart the server, and submit a synthetic complaint to confirm a successful analysis. If no valid key is configured, Python rules still run and GenAI is marked disabled or failed with a provider diagnostic.
- Keep Firebase credentials separate from the GenAI API key. Firebase Web API keys identify the Firebase web app and do not authorize Groq model calls.
## How the two AI pipelines work

1. **Intake and retrieval:** The backend validates complaint fields and files, retains the submitted text, makes a normalized processing copy, checks for likely duplicates, requests missing facts, and retrieves relevant active policy chunks.
2. **Pipeline 1 - GenAI proposal:** If an AI key is configured, the server sends complaint context and retrieved sources to the configured OpenAI-compatible provider. A central versioned prompt requests structured output using <code>config/complaint-schema.json</code>. The provider call has a bounded retry. Provider, model, prompt/schema versions, latency, outcome, proposal, and comparison are recorded.
3. **Pipeline 2 - Python validation:** Python independently applies the rule matrix, active policy/source checks, eligibility conditions, escalation triggers, injection detection, and response safety checks. It does not call GenAI to approve or repair a result.
4. **Comparison and human review:** The system records field-by-field agreement and flags disagreement, missing evidence, unsafe content, sensitive cases, and provider failure for staff review. A generated response remains a draft until an authorized staff member publishes it.

Without an AI key, the deterministic path remains available and GenAI is reported as disabled. The current classifier is an inspectable demo baseline; the SRS still calls for broader evaluation and configurable taxonomy/rule coverage before production.

When a provider rejects a request, the analysis record now reports a safe diagnostic such as HTTP 401 (key invalid), 402 (provider account credits/billing), 403 (access), 404 (endpoint/model), 429 (rate/capacity), or 400 (request/model JSON-output compatibility). It never writes the API key to the case record or logs. A `GENAI_FAILED` finding means that case used the deterministic fallback and did not complete the full dual-pipeline flow.

### AI provider settings

Groq is the default AI provider:

<pre>GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-120b</pre>

Legacy OpenRouter/OpenAI-compatible configuration remains supported when no Groq key is configured. Complaint and selected policy text is sent to the configured provider. Review provider privacy, retention, and data-processing terms before using real customer information.

## Firebase data and access model

- Firebase Authentication stores and verifies email/password credentials. It does not expose passwords in Firestore. A matching Firestore <code>users</code> document contains the Firebase UID as <code>id</code>, plus <code>email</code>, <code>name</code>, <code>role</code>, and <code>active</code>.
- The five single-account roles are <code>customer</code> (submit and see own cases), <code>agent</code> (work assigned cases), <code>reviewer</code> (approve, reject, override with a reason, and escalate), <code>admin</code> (user and configuration management), and <code>auditor</code> (read-only oversight). A role is not a complaint rule: rules govern case handling and are global policy configuration, not personal permissions.
- Create users from **Administration → Add user** while signed in as an admin. Choose a role and a temporary password of 12 or more characters. Edit a user there to change their role, deactivate their account, or set a temporary password. Role changes, password changes, and deactivation revoke existing Firebase sessions. The application prevents removing the last active administrator.
- When a reviewer approves a case, they must select an active agent or reviewer. Reviewers/admins can also reassign an existing case from its detail panel. The assignment stores both the display name (<code>assigned_to</code>) and stable Firebase UID (<code>assigned_user_id</code>); agent case access is checked against the UID. Old cases with name-only assignments remain readable to their matching account and can be reassigned.
- Case rules are configured separately under **Rule matrix → Add rule**. A rule can select category, department, priority, escalation, effective/expiry dates, required action, and optional conditions (<code>contains</code>, <code>any_contains</code>, or <code>regex</code>). These records affect new complaint analysis; adding a rule does not grant a person access. Keep the mandatory safety/security/privacy checks in place and have an authorized policy owner approve rule content.
- Administrators can add a category and department in the rule matrix without editing Python. A new category rule must include match conditions; matching rules determine its department, priority, escalation, and optional subcategory. Add an approved policy under that category to enable source-grounded recommendations. The structured GenAI schema extends its allowed category, department, and subcategory values from active rules.
- The Reports screen and <code>/api/analytics</code> provide role-scoped category, product, department, priority, urgency, sentiment, escalation, status, rolling daily volume, repeat-contact, SLA-risk, policy-usage, and GenAI/Python disagreement aggregates. Agent analytics are limited to assigned cases. Average resolution duration currently uses case creation-to-last-update time as a proxy because the ticket schema has no dedicated resolution timestamp.
- Typical case flow: customer submits a complaint → the server validates and saves it → GenAI proposes analysis if configured → Python runs separate deterministic checks → the comparison and sources are saved → risk, conflict, missing evidence, or provider failure sends it to review → reviewer approves and assigns an active support user (or rejects/overrides/escalates with a reason) → agent works the assigned case and drafts a response → an authorized staff member publishes a customer update → status, follow-ups, and audit events remain attached to the case.
- Firestore collection guide:

| Collection | Records |
| --- | --- |
| <code>users</code> | SupportNova user profile, role, and active state; no plaintext passwords |
| <code>orders</code> | Customer-owned storefront orders, item snapshots, server-calculated totals, payment-method selection, and shipping details |
| <code>tickets</code> | Complaint text and intake fields, classification, workflow status, SLA dates, assignment UID/name, response draft, validation findings, and policy references |
| <code>analysis_runs</code> | Each GenAI proposal, provider/model, prompt/schema versions, latency, outcome, and comparison with Python checks |
| <code>events</code> | Sign-in, complaint, assignment, review, status, note, and configuration audit events |
| <code>rules</code> | Admin-managed complaint category, route, priority, escalation, conditions, action, effective dates, and version |
| <code>escalation_conditions</code> | Active text patterns and their escalation level/priority |
| <code>policies</code>, <code>policy_versions</code>, <code>policy_chunks</code>, <code>policy_conflicts</code>, <code>policy_files</code> | Policy records, lifecycle/version history, source sections, conflicts, and upload metadata |
| <code>attachments</code> | Evidence metadata and storage path; file bytes are in Storage or <code>_supportnova_blobs</code> chunks |
| <code>sla_rules</code> | Response and resolution targets by category and priority |
| <code>followups</code>, <code>customer_updates</code> | Follow-up tasks and published customer updates |
| <code>prompt_versions</code> | Versioned prompts used for AI analysis |
| <code>_supportnova_meta</code>, <code>legacy_user_profiles</code> | Migration state and metadata for old local accounts; old password hashes are never migrated |

- Firestore stores binary attachments and uploaded policy source files as bounded chunks when Cloud Storage is not configured. With an optional Storage bucket, file bytes use Cloud Storage instead. Firestore stores application records and the references needed to retrieve files.
- Login exchanges credentials with Firebase Authentication, then creates an HTTP-only Firebase session cookie. Protected API routes verify the cookie and enforce the user's active role on the server.
- Firestore and Storage client rules deny direct browser access. The server uses the Admin SDK with trusted credentials and performs read/write authorization.
- In Firebase mode, SQLite is shared in-memory working state only. Committed changes are written to Firebase before the server acknowledges the request; restarting the app rebuilds the cache from Firebase.

Do not commit service-account credentials, expose Admin SDK credentials or provider API keys in client code, or allow users to set their own privileged role.

## SRS coverage and remaining release work

### Implemented in this codebase

- Firebase Authentication sign-in, Firestore-backed application records, role profiles, server-side permission checks, and admin user provisioning for the five roles listed above.
- Complaint intake, duplicate hints, attachments, active-policy retrieval and references, deterministic routing/escalation checks, structured GenAI proposals when a provider is configured, a separate Python validation path, comparison records, reviewer decisions, event history, follow-up tasks, SLA fields, dashboards, and CSV export.
- Stable Firebase UID case assignment. Reviewers now choose an active agent/reviewer when approving; an arbitrary demo name is no longer selected by the approval action.

### Still required before claiming full SRS completion

- The runtime SQLite demo seed still contains repeated base scenarios. A separate, reproducible synthetic evaluation dataset is supplied at <code>data/sample_complaints.csv</code>: 500 unique descriptions, 10 categories, 50 subcategories, 8 departments, 30 multi-issue, 25 policy-conflict, 25 prompt-injection, 20 unsupported-refund, and 250 linked repeat-contact records. Rebuild it with <code>python data/build_sample_dataset.py</code>, check its SRS minimums with <code>python data/validate_sample_dataset.py</code>, and compare deterministic output with <code>python data/evaluate_sample_dataset.py</code>. Its expected labels are synthetic regression fixtures, not policy-owner-approved ground truth. Business owners must review them; a separate blind comparison of at least 100 unseen cases is still needed before claiming measured accuracy.
- The classifier and validator are still a baseline, not a complete data-driven, field-by-field implementation of all SRS policy, eligibility, prohibited-action, and multi-issue requirements. The seeded rule matrix includes repetitive records; replace/validate it against approved business rules.
- Analytics need the full SRS dimensions and trend/search/export coverage; only the current dashboard and CSV workflow are implemented. Background SLA notification delivery is not configured.
- Run documented acceptance, security, privacy, adversarial, and load evaluations; configure production hosting, monitoring, backups, retention, and incident procedures. These depend on your Firebase project/provider settings and organization approval and cannot be completed or certified from source code alone.

Therefore this repository is a working prototype with the listed features, **not yet a verified SRS-complete or production-ready system**. A configured provider key alone does not demonstrate a successful or safe production AI service. Continue to use synthetic data until the evaluation and provider data-handling approvals are complete.

## Project layout

<pre>server.py                    HTTP API and complaint workflow
firebase_store.py            Firestore persistence and in-memory cache bridge
firebase_auth.py             Firebase sign-in and session-cookie helpers
firebase_bootstrap_admin.py  First administrator setup
static/                      Browser UI and styles
config/                      Prompt, response schema, escalation conditions
data/                        Local SQLite DB only in explicit sqlite mode
tests/                       Isolated API workflow checks (SQLite mode)
firestore.rules               Deny direct browser access to Firestore
storage.rules                 Deny direct browser access if optional Storage is enabled</pre>

## Local workflow checks

Run the isolated SQLite-mode API workflow checks with <code>python -m unittest discover -s tests -v</code>. Run the dataset coverage check with <code>python data/validate_sample_dataset.py</code> and deterministic fixture comparison with <code>python data/evaluate_sample_dataset.py</code>. The API tests and evaluator blank AI provider keys before server import, so they exercise the offline deterministic path and never call a configured provider from <code>.env</code>.
