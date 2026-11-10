# ARMUT interface design

Codex has the Impeccable design skill installed. Use it for requested UI review/refinement together with these ARMUT constraints. Local Ollama ARMUT can read this guide but cannot execute Codex skills or inherit plugin connections. Keep fonts, icons and required assets local so panel operation does not depend on external CDNs. Impeccable installation alone does not constitute a completed panel audit.

Keep chat prominent, camera previews compact and the Hub first among devices. Use the existing local icon system and shared color/spacing conventions. Device details stay in sheets; component buttons open that component's measurements, not generic ESP details. Right-aligned three-dot menus and compact window headers remain consistent.

Start with the requested interaction, remove duplicate controls, and retain visible offline/loading/error states. Confirm keyboard labels, touch targets and 360/768/1280px layouts. Do not redesign unrelated pages. Preserve presence switch, device controls, job recovery and source-versus-publication distinctions.

For ordinary Codex UI work, follow AGENTS.md and edit the canonical armut-hub/data sources. Local ARMUT uses read_source/development_plan/apply_development through its existing guarded workflow. Publish only to authorized targets: tools/update_shared_ui.py currently verifies Hub assets while phone updates remain paused; the Android package is unchanged. A shared source does not prove Android delivery. Check SHARED_UI.md for the fixed Android asset contract before planning a phone release. Local review does not equal opening or modifying a Figma file. A separate Figma account connection and scoped API/bridge are needed for direct local Armut access; never copy Codex OAuth credentials.
