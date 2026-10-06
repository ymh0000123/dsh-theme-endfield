
/** The two spellings a reachable Schemastery builder can have on disk. */
const SCHEMA_SPECS = ['@deepseek-ai/schemastery', 'schemastery'];

/* Where a usable builder came from, for the diagnostics apply() logs. Set by
   loadSchemastery; stays null while nothing was found. */
let SCHEMA_SOURCE = null;

/* HOW the chosen builder marks a field editable — also for the diagnostics.
   'native'      the builder carries schemastery's own `.volatile()`;
   'synthesized' it predates `.volatile()`, so the marker is set through the
                 generic `.extra('volatile', true)` that `.volatile()` is
                 implemented on top of;
   'plain'       the builder marks nothing; only ever chosen for the pre-0.1.7
                 registration, which persisted whole namespaces;
   null          no usable builder was found at all, so this entry exports no
                 Config and every preference stays page-local. */
let SCHEMA_MODE = null;
