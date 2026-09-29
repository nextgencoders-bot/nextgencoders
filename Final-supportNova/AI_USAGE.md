# AI Usage & Runtime Architecture Disclosure

## AI System Architecture & Model Migration

Due to provider access updates, the complaint-analysis runtime has been migrated from Google Gemini to Groq. 

* **LLM Provider:** Groq Python SDK (configured via `GROQ_API_KEY`).
* **Model Configuration:** Set via `GROQ_MODEL` environment variable (Defaults to `openai/gpt-oss-120b`).
* **Fallback Behavior:** If no API key is provided, the runtime bypasses external model calls safely without interrupting baseline system functions.

---

## Runtime Execution & Governance Pipeline

1. **Structured Proposals:** Complaint content and selected policy contexts are submitted to Groq to generate structured analytical proposals using the centrally managed prompt (`config/complaint-intelligence-prompt.txt`).
2. **Schema Enforcement & Retries:** Output is validated against `config/complaint-schema.json`. If a strict schema call fails, the system retries once in JSON mode before falling back.
3. **Deterministic Evaluation:** An independent Python rule engine executes simultaneously against the complaint. Deterministic outputs override model proposals for high-risk or clear-cut policy matches.
4. **Telemetry & Auditability:** Every execution logs metadata including provider, model version, prompt template, schema version, latency, and full audit logs.

---

## Workflow & Assignment Logic

* **Auto-Assignment:** Verified complaints (and those flagged as `Verified with Agent Review`) are automatically routed to the active agent with the lowest current workload.
* **Reviewer Queue Escalation:** Cases are escalated to the human reviewer queue if any of the following occur:
  * Significant conflict between the LLM proposal and deterministic rules.
  * Sensitive risk factors or missing policy evidence.
  * GenAI request failure, schema violation, or unconfigured API key.
  * No active agents available.
* **Agent Operations:** Agents handle assigned workflows directly. Triage, overrides, and manual reassignments are handled through the reviewer queue.

---

## Data Layer & Infrastructure

* **Authentication:** Firebase Authentication manages identity and verifies credentials.
* **User Roles:** Firestore `users` profiles store application roles (Agent, Reviewer, Admin) and active status.
* **Primary Database (Firestore):** Stores tickets, analysis runs, audit logs, rules, policy chunks, SLA settings, and system configuration.
* **Storage:** Firebase Cloud Storage manages file uploads and attachments.
* **Query Caching:** In-memory SQLite acts as a local query cache during Firebase operations.