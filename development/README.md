# Development sources and recovery notes

Each mod's source, tests and build tools. The installable mod folders at the repository
root are generated from these.

- [Better Zen Folders](better-zen-folders/README.md): architecture, current status,
  complete regression suite, versioned fixture inputs and disposable native probes.
- [Context Menu Editor](context-menu-editor/DEVELOPMENT.md): source modules, unit and native
  tests, and the build that produces the published `context-menu-editor/` folder.
- [Zen Icons](zen-icons/README.md): source, icon catalogue, build and test suite. The
  Lucide icon assets are regenerated from the pinned `lucide-static` package.
- [Define Word](define-word/README.md): source, build (`npm run build`, `npm run check`)
  and tests (`npm test`, plus native probes in `tests/native/`).
- [Better Pins](better-pins/README.md): preserved candidate source and fixtures; not
  currently published as a mod.
- [Sports sidebar investigation](sports-sidebar/README.md): diagnosis, later native
  verification and links to the independently published SuperPins repair.

Glance Controls keeps its tests in `glance-controls/development/`.

These are development materials. Install individual mod folders from the repository
root through Sine; do not install this directory. No saved browser profiles, private
diagnostics or personal recordings belong in this public repository.
