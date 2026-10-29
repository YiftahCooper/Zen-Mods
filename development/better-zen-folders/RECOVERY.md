# Development recovery checkpoint — 29 October 2026

The runtime remains 0.3.26 from commit
`56789780f376021d276634967961252954f5eee6`. This checkpoint adds development
material without changing the installable package, preferences or other mods.

The development test project was assembled from the current public package and
the inputs in this directory, without the original developer layout. Dependency
installation used the checked-in lockfile and a local npm installation, rather
than depending on Codex libraries. The full suite, with installed-Zen qualification
explicitly enabled, passed **1,373 checks**, zero failures, one unavailable private
historical-screenshot skip. All **16** Python package/documentation checks passed.
The installed-source qualification used Zen 1.23.4b/Gecko158.0.1. A separate run
with nonexistent archive paths and installed qualification disabled passed its
38 checks and explicitly skipped the two installed-archive checks.

The public native wrapper also passed seven folder-plus creation cases in a new
synthetic Zen 1.23.4b profile, including collapsed/nested folders, pin defaults,
unrelated background opens, cancellation and stock Sine reload. This verifies
the wrapper on Windows; other operating systems have path-guard checks rather
than equivalent native execution proof. No everyday profile was used.

Independent bounded review checked privacy, licensing, portable input resolution,
source/fixture separation, historical/current evidence boundaries and documentation
links. Findings were repaired and rechecked. It found no confirmed private-data
leak. Synthetic redaction fixtures intentionally contain reserved private/test values.

Useful technical knowledge, tests and selected implementation inputs are retained
here. Old synthetic browser profiles, staging fixtures, test caches and tool caches
are reproducible outputs, not required development inputs. Original private evidence,
source history and configured test profiles remain local where they cannot safely
be made public or independently reconstructed. Do not interpret this checkpoint
as permission to upload their contents or as final user acceptance of the alpha.
