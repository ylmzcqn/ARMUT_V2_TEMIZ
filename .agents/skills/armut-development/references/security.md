# Local security review

For local ARMUT reviews, use read_source for affected allowed sources; specialist_review provides optional local coder advice. For Codex, inspect relevant current code and use the requested review workflow under AGENTS.md. A second model review is not mandatory for every edit. Review authentication/session isolation, SSRF/redirect handling, source path containment, current-hash checks, OTA target identity and secret exposure as relevant to the user's request.

Validate a suspected vulnerability with a concrete source path and failure conditions; use a bounded reproducer when authorized and feasible. State remaining uncertainty when reproduction is unavailable. Scanner or model findings alone are not confirmation. Use a narrow development_plan when working through ARMUT's guarded tools; ordinary Codex fixes follow AGENTS.md. Retain recovery evidence and run relevant checks before authorized publication. Never print credentials or send private source/frames/chat to public web research. Search only generic technical terms and read official documentation with web_search/read_web_page.

This is a local review method, not the Codex Security service. Codex's installed plugin, account session and external scanning tools are not inherited by Ollama. Do not claim an external security scan ran without its actual report.
