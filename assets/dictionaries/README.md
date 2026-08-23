# Hunspell dictionaries

Vendored rather than imported from `node_modules`, for two reasons.

**They cannot be imported.** The `dictionary-*` packages read their data with
`await fs.readFile()` from `node:fs` at module scope. That works in Node and
fails outright in a webview, and their `exports` map does not expose the raw
`.aff`/`.dic` files either. Copying them in is the only way to bundle them.

**The cost should be visible.** Persian spell checking adds 2.5 MB to the
repository and the executable, and building the checker at runtime takes about
172 MB of heap and 2.3 seconds — measured, not estimated. B mark otherwise runs
in roughly 100–150 MB, so this roughly triples the footprint while it is on.
That is inherent to a Hunspell dictionary with Persian's affix complexity.

Which is why the feature is **off by default** and loaded lazily: nobody who
leaves it off pays anything, and the settings panel states the cost rather than
letting the user discover it in Task Manager.

| File | Source | Licence |
|---|---|---|
| `fa.aff`, `fa.dic` | [dictionary-fa](https://github.com/wooorm/dictionaries) v2.0.0 | Apache-2.0 — see `fa-LICENSE.txt` |
| `en.aff`, `en.dic` | [dictionary-en](https://github.com/wooorm/dictionaries) v4.0.0 | MIT AND BSD-3-Clause — see `en-LICENSE.txt` |

Re-vendor with:

```bash
cp node_modules/dictionary-fa/index.aff assets/dictionaries/fa.aff
cp node_modules/dictionary-fa/index.dic assets/dictionaries/fa.dic
cp node_modules/dictionary-en/index.aff assets/dictionaries/en.aff
cp node_modules/dictionary-en/index.dic assets/dictionaries/en.dic
```
