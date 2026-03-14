Use the existing repository as the starting point.

Repository context:

- package manager: `pnpm`
- existing files:
  - `README.md`
  - `docs/Format.md`
  - `docs/sample moveit exports/*`
- goal: create a working SCL library, no CLI yet
- target language: strict, idiomatic TypeScript
- test runner: built-in `node:test`
- priorities:
  - clean API surface
  - single source of truth
  - readable code
  - small, composable geometry primitives
  - no duplicated geometry logic
  - no premature DSL

Project concept:
SCL = Scalable City Language.
This is a geometry library plus a Move It compiler for Cities: Skylines.
Users define shapes, not nodes.
Nodes and segments are derived automatically from shape intersections and segment splitting rules.

Core functional requirements:

1. Create a library API for authoring road shapes on a 2D/2.5D canvas.
2. Support, at minimum:
   - circle roads
   - Archimedean spiral roads
   - straight roads / rays / line segments
3. Support overlaying shapes on the same canvas and automatically:
   - finding intersections between shapes
   - inserting nodes at those intersections
   - splitting geometry into valid network segments
   - splitting long segments so they do not exceed a configurable segment length limit
4. Support exporting to Move It XML using the documented stripped format in `docs/Format.md` and the sample exports in `docs/sample moveit exports/*`
5. Support configuring prefab names, flags, defaults, and optional `y` coordinates
6. Include tests that validate:
   - geometry behavior
   - segmentation behavior
   - intersection behavior
   - Move It XML output shape
   - a realistic "Smith St spiral" composition

Important modeling rule:

- users define shapes only
- users do not manually define nodes
- nodes are derived from:
  - shape endpoints
  - shape intersections
  - automatic subdivision of long geometry
- all units are meters
- coordinates:
  - `x` = east/west
  - `z` = north/south
  - optional `y` = elevation
  - omitted `y` means "snap to terrain height" in output, so Move It XML should omit `<y>` in those places

Default game knowledge to encode:

- default max segment length = 96 meters
- this must be configurable at canvas level and optionally overridable per shape if the design naturally supports it

Move It compiler constraints:

- follow `docs/Format.md` as source of truth
- use root namespace declaration once, not repeated on every state
- emit `xsi:type` form rather than repeated local namespace declarations
- generate valid typed IDs for NodeState and SegmentState
- use deterministic sequential IDs
- derive short IDs from low 16 bits
- generate proper `segmentsList`, `startNode`, `endNode`
- include only fields required by the stripped format unless a test proves otherwise
- preserve semantic correctness of omitted `y`

Implementation style requirements:

- TypeScript strict mode enabled
- avoid classes unless they clearly improve the API
- prefer immutable data and pure functions for geometry logic
- centralize numeric tolerances and constants
- separate:
  - public API
  - geometry engine
  - IR / domain model
  - Move It compiler
- keep the public API small and pleasant
- avoid "god objects"
- do not add a CLI yet
- do not add a browser playground yet
- do not invent a YAML DSL yet

What I want you to build first:
A minimal but solid library that lets me express something like this, though you should refine it into a more realistic API if needed:

Example intended usage, but feel free to improve it while keeping the spirit:

```typescript
import { createCanvas, compileToMoveIt, polarPoint } from 'scl';

const canvas = createCanvas({
    maxSegmentLength: 96,
    defaultRoad: {
        prefabName: 'Gravel Road',
        flags: 'Created End Moveable OnGround OneWayOut OneWayIn',
    },
});

canvas.addCircleRoad({
    center: { x: 0, z: 0 },
    radius: 10,
});

canvas.addArchimedeanSpiralRoad({
    center: { x: 0, z: 0 },
    startRadius: 20,
    pitch: 82.3,
    direction: 'clockwise',
    startAngleDeg: 0,
    arcLength: 2000,
});

const serviceRoadCount = 5;
const serviceRoadLength = 500;

for (let i = 0; i < serviceRoadCount; i++) {
    const angleDeg = (360 / serviceRoadCount) * i;
    canvas.addLineRoad({
        start: { x: 0, z: 0 },
        end: polarPoint({ x: 0, z: 0 }, serviceRoadLength, angleDeg),
    });
}

const result = canvas.build();
const xml = compileToMoveIt(result);
```

API design guidance:

- it is okay if `Canvas` is a class, but only if that makes the user API clearer
- shapes should probably be stored as declarative input objects
- then one build step resolves them into a network IR
- good likely phases:
  1. authoring shapes
  2. resolving intersections and split points
  3. generating nodes and segments
  4. compiling to Move It XML
- support future extensibility for more shapes later:
  - arcs
  - polylines
  - clothoids
  - offsets
  - roundabouts
  - interchange generators

Please propose and implement a realistic API rather than mechanically copying my sketch.
Before coding, briefly explain the API you choose and why.

Shape/intersection expectations:

- circle + line should intersect correctly
- spiral + line should intersect correctly
- circle + spiral should intersect correctly if they cross
- shape endpoints should also become nodes
- if two shapes overlap exactly or near-exactly in difficult ways, it is acceptable in this first version to either:
  - reject them with a clear error, or
  - document that collinear/overlapping geometry is not yet supported
- numerical tolerance should be explicit and tested

Geometry expectations:

- circle roads may be internally represented as parametric curves and then sampled/split into segments
- Archimedean spiral roads should be represented from actual spiral math, not fake approximations baked into constants
- line roads should be straightforward
- segment splitting should respect both:
  - geometric split points from intersections/endpoints
  - max segment length
- use a single source of truth for path parameterization and segment sampling

Move It export expectations:

- output valid XML as a string
- tests should verify important fragments and structure
- use the stripped format docs as the ground truth
- no unnecessary TMPE blobs or serializer noise
- preserve root namespace cleanly

Testing requirements:
Use `node:test` only.
Add meaningful tests, not just smoke tests.

At minimum include tests for:

1. line road exports a valid simple network
2. circle road gets segmented and closes correctly
3. spiral road generates multiple segments and increasing radius behavior
4. line/circle intersection creates shared node(s)
5. line/spiral intersection creates shared node(s)
6. segment subdivision respects `maxSegmentLength`
7. omitted `y` does not emit `<y>` in XML
8. a Smith-St-style composition:
   - one central circle
   - one Archimedean spiral
   - five radial roads from the center
   - output compiles to Move It XML
   - all intersections are resolved into a connected network

Project setup requirements:
Set up a clean TypeScript library package with:

- `pnpm`
- `typescript`
- `node:test`
- `eslint`
- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`
- `prettier`
- useful package.json fields for a library
- strict tsconfig
- export map if appropriate
- clear source layout, likely under `src/`

Please structure the code cleanly, for example:

- `src/api/`
- `src/domain/`
- `src/geometry/`
- `src/compiler/moveit/`
- `src/utils/`
- `test/`

Documentation requirements:

- update `README.md` so the repo becomes usable
- include:
  - what SCL is
  - current scope
  - example usage
  - how to run tests
  - what is implemented now
  - limitations of the current geometry engine

Git workflow requirement:
Make multiple commits along the way, not one giant commit.
Use sensible commit boundaries, for example:

1. chore: initialize typescript library tooling
2. feat: add core domain model and public api skeleton
3. feat: add line and circle geometry
4. feat: add archimedean spiral geometry
5. feat: add intersection and subdivision engine
6. feat: add moveit xml compiler
7. test: add coverage for geometry and moveit export
8. docs: update readme and usage examples

Execution instructions:

- write an AGENTS.md file for this repository based on this prompt.
- inspect the existing docs before implementing
- treat `docs/Format.md` as authoritative for Move It export
- inspect `docs/sample moveit exports/*` and use them to shape tests
- after each major milestone, run tests
- keep the implementation focused and minimal
- do not add features beyond scope unless they are required for correctness
- if you need to make a design tradeoff, prefer correctness and clarity over cleverness

Final deliverable:

- working library
- passing tests
- updated README
- clean commit history
- no CLI yet

Also, before making the first code changes, print a short implementation plan listing:

- chosen public API
- internal module layout
- main geometry strategy
- known limitations for v1
