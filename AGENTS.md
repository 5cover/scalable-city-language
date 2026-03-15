# Repository Instructions

## Scope

This repository contains the `scl` TypeScript library for authoring road shapes, resolving them into a network, and exporting Move It XML for Cities: Skylines.

## Working Rules

- Treat `docs/Format.md` as the authoritative Move It export specification.
- Use files in `docs/sample moveit exports/` to validate XML structure and serializer quirks.
- Users define shapes only. Nodes must always be derived from endpoints, intersections, and automatic subdivision.
- Prefer strict, idiomatic TypeScript with immutable data and pure geometry functions.
- Keep geometry logic centralized to avoid duplicated sampling, tangent, and subdivision behavior.
- Write JSDoc comments.
- Make commits regularly.
- Write code in reverse topological order : constructs are followed by the constructs they depend on (such as the functions a function calls, the types referenced in an interface...). This is more intuitive and readable than topological order.
- Avoid arbitrary limitations and empirical choices unless strictly necessary, and even then inform the user in your recap.
- Include comments to explain non-trivial pieces of code. Why is this done a certain why.
- Do not use outdated TypeScript constructs such as `Array<T>`, instead use modern versions: `T[]`

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
