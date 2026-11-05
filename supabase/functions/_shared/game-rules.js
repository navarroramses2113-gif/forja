// Edge Functions keep importing this path. The real file (the one the app
// also loads) lives at /shared/game-rules.js so it isn't buried in the
// server folder. Deno bundles that file when this module is imported.
import "../../../shared/game-rules.js";
