[فارسی](CONTRIBUTING.fa.md)

# Contributing to B mark

Thanks for considering it. A few things worth knowing before you start.

## The one rule that matters most

**Direction bugs are the highest-priority class of bug in this project.** If
you find a Markdown snippet that renders with the wrong direction, that is not
a cosmetic issue — it is the thing B mark exists to get right. Please open an
issue with the exact source text, copy-pasted rather than screenshotted.

## Setup

```bash
npm ci
npm run dev      # http://localhost:1420, no Rust needed
npm test
```

You do **not** need Windows or Rust to work on the Markdown pipeline, the
direction engine, themes, fonts or layout. Only the final `.exe` needs those.
See [BUILD.md](BUILD.md).

## Before you open a pull request

```bash
npm run typecheck   # must be clean; the project is TypeScript strict
npm test            # all tests must pass
```

## Adding a direction case

If you fix a direction bug, add the case to `tests/direction.spec.ts` or
`tests/pipeline.spec.ts` *first*, watch it fail, then fix it. Write the test so that it *fails* against the current code before you fix it.
This is not ceremony: the right-click-menu regression test passed against the
broken implementation on the first attempt, because jsdom dispatches `click`
at a detached node and a real browser does not. A test that passes against
the bug is not a test.

If the case is visually interesting, add it to `tests/fixtures/stress.md` too
so it is exercised by eye during manual review.

## Code style

- TypeScript strict, no `any` without a comment explaining why.
- No new runtime dependency without discussion. KaTeX and Mermaid are the two
  large ones we accepted, and only because both are loaded lazily — a document
  containing neither maths nor a diagram fetches neither. Anything that would
  grow the *entry* chunk needs a good reason.
- Comments explain *why*, not *what*. If a line encodes a non-obvious fact
  about Unicode, Windows or a library's behaviour, say so — the carve-out
  table in `src/direction/unicode.ts` is the model.
- CSS rules that exist to contain overflow are marked `/* OVERFLOW */`. Keep
  that convention; `tests/overflow.spec.ts` asserts several of them still
  exist.

## Licensing of contributions

By contributing you agree your work is licensed under the [MIT](LICENSE)
licence.

**Do not paste code from other projects.** In particular, Zettlr is GPL-3.0 and
incompatible with this project. Studying a design and implementing it
independently is fine and encouraged; copying source is not. If a project
influenced your work, add it to the credits table in both READMEs.
