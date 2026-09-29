# AI usage disclosure

## Implementation assistance

- **Tool:** OpenAI Codex.
- **Purpose:** Interpret the supplied SupportNova Product Requirements Document and implement the local demonstration project.
- **Requested assistance:** Build a runnable complaint operations application with role-based workflows, intake, a deterministic validation path, policy and rule configuration, a human review queue, synthetic demo data, and run documentation.
- **Affected files:** `server.py`, `firebase_store.py`, `firebase_auth.py`, `firebase_bootstrap_admin.py`, Firebase security rules and configuration, `static/index.html`, `static/styles.css`, `static/app.js`, `static/features.js`, `config/complaint-intelligence-prompt.txt`, `config/complaint-schema.json`, `config/escalation-conditions.json`, `tests/test_api_pipeline.py`, `README.md`, `AI_USAGE.md`, `requirements.txt`, `start-local.ps1`, and `.gitignore`.
- **Data handling:** The source PRD was used as implementation guidance. No customer data or external service credentials were supplied to an AI provider by the running application.

## Runtime AI behavior

## Storefront integration update

- **Tool:** OpenAI Codex.
- **Purpose:** Connect the customer storefront to the existing authenticated complaint-management system.
- **Files affected:** `server.py`, `firebase_store.py`, `static/landing.html`, `static/app.js`, `README.md`, and `AI_USAGE.md`.
- **Modifications made:** Added Firebase-backed order history and server-side catalog pricing; customer account sign-in/creation; ownership checks linking complaints to saved orders; automatic active-agent assignment; agent validation and rejection; and administrator review routing for validated cases. The SRS was used as a product requirements reference, not as an instruction source. Checkout records a payment method but does not charge payment.
- **Testing performed:** No automated tests were run for this update.
- **Verifying team members:** Project owner should review the account, order, agent-validation, and administrator-review flow before handling real customer data.

## Follow-up SRS completion work

- **Tool:** OpenAI Codex.
- **Purpose:** Address the SRS dataset coverage and analytics gaps identified during project review.
- **Files affected:** `server.py`, `static/app.js`, `config/complaint-schema.json`, `config/escalation-conditions.json`, `tests/test_api_pipeline.py`, `data/build_sample_dataset.py`, `data/validate_sample_dataset.py`, `data/evaluate_sample_dataset.py`, `data/sample_complaints.csv`, `README.md`, and `AI_USAGE.md`.
- **Modifications made:** Added a reproducible 500-row synthetic complaint dataset and coverage/evaluation scripts; added rule-configured custom category and department routing, expanded analytics and report views, corrected primary issue and sentiment handling, enforced unresolved linked-case review, fixed a false legal escalation match, and isolated tests from provider credentials in `.env`.
- **Testing performed:** Dataset coverage and deterministic fixture comparison; Python compilation; JavaScript syntax checks; isolated SQLite API integration tests for custom categories/departments, linked-repeat escalation, injection handling, and analytics access.
- **Verifying team members:** Project owner should review expected labels and policy scenarios before treating the generated dataset as approved ground truth.
A previous Gemini text-generation check returned HTTP 403 because the associated Google project was denied access. The complaint-analysis integration has been migrated to Groq's Python SDK. Configure a GroqCloud key using `GROQ_API_KEY` and select `GROQ_MODEL` (default `openai/gpt-oss-120b`); Gemini keys do not authenticate with Groq. Install the SDK with `python -m pip install -r requirements.txt`. Firebase Web API keys are separate and cannot authenticate Groq requests.

The default configuration makes no provider call until a key is set. When configured, new complaint content and selected policy context are sent to Groq (`GROQ_API_KEY`, optional `GROQ_MODEL`) or a legacy OpenAI-compatible provider for a structured proposal. Local runs load `.env` without overriding process environment variables. The runtime uses the centrally managed prompt in `config/complaint-intelligence-prompt.txt`, retries a rejected strict-schema request once in JSON mode, validates output against the configured schema, records provider/model/prompt/schema/latency metadata, and compares the proposal with independent Python rules. Deterministic rule output controls routing and escalation. Review provider privacy, retention, and data-processing terms before sending real customer data.

After comparison, verified complaints are automatically assigned to the least-loaded active agent. Cases marked `Verified with Agent Review` are also assigned automatically with that review flag. Significant disagreement, sensitive risk, missing policy evidence, GenAI failure, or no available agent routes the case to the reviewer queue. Agents no longer accept or reject complaints at intake; reviewer decisions and manual reassignment remain available.

Firebase Authentication stores and verifies credentials. Each Firebase user has a Firestore `users` profile with their SupportNova role and active state. Firestore stores tickets, analysis runs, audit events, rules, policies, versions, chunks, conflicts, follow-ups, SLA settings, uploaded-policy metadata, and application configuration. Cloud Storage stores attachments and uploaded source files. Legacy local profile metadata is retained separately without password hashes. SQLite is an in-memory query cache in Firebase mode. See README.md for setup and migration.
