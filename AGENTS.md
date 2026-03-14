# Repository Instructions

## Scope

This repository contains the `scl` TypeScript library for authoring road shapes, resolving them into a network, and exporting Move It XML for Cities: Skylines.

## Working Rules

- Treat `docs/Format.md` as the authoritative Move It export specification.
- Use files in `docs/sample moveit exports/` to validate XML structure and serializer quirks.
- Keep the implementation focused on the library only. Do not add a CLI, browser playground, or YAML DSL.
- Users define shapes only. Nodes must always be derived from endpoints, intersections, and automatic subdivision.
- Prefer strict, idiomatic TypeScript with immutable data and pure geometry functions.
- Keep geometry logic centralized to avoid duplicated sampling, tangent, and subdivision behavior.

## Recommended Layout

- `src/api/`: public authoring API and exports
- `src/domain/`: shapes, network IR, and shared types
- `src/geometry/`: parameterized curve logic, intersections, subdivision
- `src/compiler/moveit/`: Move It XML compilation
- `src/utils/`: constants, tolerances, ids, and helpers
- `test/`: `node:test` coverage

## Validation

- Run tests after each major milestone.
- Prefer deterministic outputs and deterministic test fixtures.
- Document v1 limitations explicitly instead of silently approximating unsupported overlap cases.
