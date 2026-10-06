
/**
 * Pick the builder to build `Config` with: the best of the reachable ones.
 *
 * The preference order is the whole point of this function.
 *
 *   1. a builder with schemastery's OWN `.volatile()` — highest fidelity, the
 *      exact copy DSH validates against;
 *   2. a builder that only has `.extra()`, with the marker synthesized.
 *
 * Step 2 exists because "no `.volatile()` anywhere" used to mean "no Config",
 * and a missing Config is NOT a degraded theme — it is no persistence at all.
 * DSH projects no settings form for an entry without a volatile Config, so
 * every switch the user flips stays page-local and resets on the next reload:
 * the panel opens, the switches move, and nothing is ever written down. That is
 * exactly what happened on a host whose only *loadable* schemastery was the
 * unscoped 3.18.0 (no `.volatile()`), while the 3.18.4 copy that does have it
 * resolved from the profile but could not be required. Marking through
 * `.extra()` builds the same node shape (`.meta.volatile === true`), which is
 * all DSH's projection reads.
 *
 * @param candidates - `{ z, source }` records, closest require path first.
 * @param requireVolatile - when true only an editable (volatile) schema is
 *   acceptable, because DSH drops a non-volatile field and suppresses the whole
 *   form; when false any usable builder does (the pre-0.1.7 registration
 *   persisted whole namespaces instead of a volatile Config).
 * @returns `{ z, source, mode }`, or undefined when nothing is usable. */
function selectBuilder(candidates, requireVolatile) {
  const usable = [];
  for (const candidate of candidates) {
    const z = candidate.z;
    if (!z || typeof z.object !== 'function' || typeof z.string !== 'function') continue;
    usable.push(candidate);
  }
  if (!requireVolatile) {
    const first = usable[0];
    if (!first) return undefined;
    /* 'plain' unconditionally: this call site deliberately marks NOTHING, so
       naming the builder's own capability here would misdescribe the schema. */
    return { z: first.z, source: first.source, mode: 'plain' };
  }
  for (const candidate of usable) {
    if (hasVolatile(candidate.z)) return { z: candidate.z, source: candidate.source, mode: 'native' };
  }
  for (const candidate of usable) {
    if (hasVolatileMarker(candidate.z)) return { z: candidate.z, source: candidate.source, mode: 'synthesized' };
  }
  return undefined;
}

/**
 * @param requireVolatile - when true only a builder that can produce an
 *   editable (volatile) schema is acceptable (needed for DSH 0.1.7's Config).
 * @returns a usable builder, or undefined when none is reachable. On success
 *   SCHEMA_SOURCE records the root it came from and SCHEMA_MODE how it marks a
 *   field editable.
 */
function loadSchemastery(requireVolatile) {
  const chosen = selectBuilder(schemasteryCandidates(), requireVolatile);
  if (!chosen) return undefined;
  SCHEMA_SOURCE = chosen.source;
  SCHEMA_MODE = chosen.mode;
  return chosen.z;
}

/** Build the object schema over FIELD_DEFAULTS with an EXPLICIT builder.
 *
 *  Split out of {@link buildSchema} so the field contract — one string field per
 *  FIELD_DEFAULTS entry, each carrying its shipped default and, when asked, the
 *  volatile marker — can be asserted against a stand-in builder instead of
 *  whatever schemastery the test machine happens to have. A Host check that
 *  silently skips on a schemastery-free machine is precisely how
 *  "settings won't save" shipped green.
 *
 *  @param z - a schemastery builder.
 *  @param volatileFields - mark every field editable.
 *  @returns the object schema. */
function buildSchemaWith(z, volatileFields) {
  const fields = {};
  for (const [field, fallback] of Object.entries(FIELD_DEFAULTS)) {
    let leaf = z.string().default(fallback);
    if (volatileFields) leaf = volatileField(leaf);
    fields[field] = leaf;
  }
  return z.object(fields);
}

/**
 * Build one schemastery object schema over FIELD_DEFAULTS with the best
 * reachable builder.
 *
 * @param volatileFields - when true every field is marked editable (volatile),
 *   which is what makes it user-editable through DSH 0.1.7's settings service
 *   (only volatile paths are projected into a form and accepted by a write).
 *   The legacy pre-0.1.7 registration used the same schema shape without the
 *   flag, because that generation persisted whole namespaces instead of a
 *   Config.
 * @returns the schema, or undefined when no usable schemastery builder is
 *   reachable (the theme then stays a no-op instead of crashing the host half).
 */
function buildSchema(volatileFields) {
  try {
    const z = loadSchemastery(volatileFields === true);
    if (z === undefined || typeof z.object !== 'function' || typeof z.string !== 'function') return undefined;
    return buildSchemaWith(z, volatileFields === true);
  } catch (e) {
    // A schema we cannot build must never take the entry (and the theme) down.
    return undefined;
  }
}

/**
 * The Config DSH 0.1.7 projects into a settings form for this entry. It is
 * read off the plugin module namespace (`entry.fiber.runtime.Config`) when the
 * loader mounts the row, so it must exist at module evaluation time.
 *
 * `ctx.settings` refuses a write to any path that is not volatile, and it
 * suppresses the whole form when NO field is volatile — hence `true` here.
 * When no schemastery is reachable the property is omitted entirely, which is
 * exactly "this plugin has nothing to configure" and not an error — but it is
 * also the one failure that silently costs the user every preference on every
 * reload, so apply() reports it instead of staying quiet.
 */
const Config = buildSchema(true);

