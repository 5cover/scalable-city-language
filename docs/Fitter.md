# Fitter

The fitter converts authored SCL geometry into a valid Cities: Skylines network.

Authored geometry is idealized:

- circles are mathematically perfect
- spirals are continuous curves
- lines are exact
- intersections may occur at arbitrary points

The game does not consume that directly. It consumes a constrained network of:

- nodes
- road segments
- spline control geometry

The fitter is the translation layer between the two.

## Why it exists

The game imposes hard and soft constraints on road geometry that authored shapes do not naturally respect.

Examples:

- segments cannot be arbitrarily long
- segments cannot turn too sharply
- nodes cannot have arbitrary degree
- intersections that are too close together create unusable tiny segments
- roads that pass too close to each other look broken or overlap visually

The fitter takes a set of authored figures and produces a network that:

- preserves the intended shape as closely as possible
- respects the engine's constraints
- fails clearly when the layout cannot be represented safely

## Responsibilities

The fitter is responsible for:

1. Converting shapes into internal spans
2. Detecting intersections
3. Splitting spans at required cut points
4. Enforcing segment length and curvature limits
5. Building nodes and segments
6. Validating the resulting network against engine constraints
7. Producing warnings or errors when constraints cannot be satisfied

It is not responsible for:

- XML serialization
- prefab lookup
- mod integration such as TMPE
- interactive editing

## Inputs

The fitter accepts:

- a list of authored figures
- fitter configuration

Figures are high-level geometric objects such as:

- line
- circle
- spiral

Each figure provides:

- geometry
- road style
- optional per-figure overrides such as maximum segment length

## Output

The fitter emits a network description consisting of:

- nodes
- segments
- build warnings
- build errors

Each node includes:

- position
- road style / prefab
- node flags

Each segment includes:

- start node
- end node
- spline control geometry
- road style / prefab
- source figure reference

The emitted network is the source of truth for later compilation to Move It XML or direct in-game placement.

## Core internal concept: spans

The fitter does not work directly on final game segments at first.

Instead, each figure is represented internally as one or more spans.

A span is a parameter interval on a shape:

- a line may begin as one span
- a spiral may begin as one span
- a circle may begin as one closed span or a small set of canonical spans

Spans are repeatedly split until all constraints are satisfied.

Only after that are span endpoints turned into nodes and spans turned into final segments.

## Processing model

The fitter operates in stages.

### 1. Shape expansion

Each authored figure is converted into an internal shape representation that can provide:

- point at parameter
- tangent at parameter
- length over an interval
- turning angle over an interval

### 2. Initial spans

Each shape is seeded with one or more initial spans.

Typical initial spans:

- line: one span
- spiral: one span
- circle: one or more spans, depending on shape policy

### 3. Intersection detection

Spans are checked for intersections.

When an intersection is found:

- both spans receive a cut at the intersection parameter
- future processing treats the resulting pieces separately

Intersections are topological cuts. They are mandatory.

### 4. Constraint splitting

Each span is checked against geometric constraints.

If a span violates:

- maximum segment length
- maximum turning angle

it is split into smaller spans.

Splitting uses the larger subdivision count required by the active constraints so both are satisfied in a single pass.

### 5. Node and segment construction

After all required cuts are known:

- unique span endpoints become nodes
- each span becomes one segment

### 6. Network validation

The resulting graph is validated against node- and road-level constraints such as:

- minimum segment length
- maximum node degree
- minimum intersection angle
- minimum road clearance

If the network cannot satisfy these constraints, the fitter produces warnings or errors according to configuration.

## Constraint order

Constraints are applied in this order:

1. intersection cuts
2. maximum segment length
3. maximum turning angle
4. node and segment construction
5. minimum segment length
6. maximum node degree
7. minimum intersection angle
8. minimum road clearance

This order matters.

Why:

- intersections define topology and must happen first
- length and curvature are refinement constraints and are resolved by splitting
- minimum segment length can only be evaluated after spans are finalized
- node degree and angle constraints depend on the final node graph
- clearance is most meaningful on the final fitted network

## Constraints

### Maximum segment length

A segment may not exceed the configured maximum length.

This prevents:

- invalid long network segments
- poor spline approximation
- unstable rendering

If a span is too long, it is split evenly.

### Maximum turning angle

A segment may not turn more than the configured maximum angle.

This prevents:

- overshooting splines
- visibly distorted curves
- poor circular and spiral approximation

A practical default is 90°.

If a span turns more than the limit, it is split.

### Minimum segment length

A segment may not be shorter than the configured minimum length.

This is an engine-feasibility constraint, not a quality constraint.

Typical causes:

- two intersections too close together
- numerical noise
- aggressive refinement creating tiny spans

Segments under the length limit are rejected.

v2: Space out nearby nodes or cut points to relax short segments while preserving topology.
v3: Merge nearby nodes or cut points to eliminate short segments, accepting some geometric deformation.

### Maximum node degree

A node may not connect to more than the configured maximum number of segments.

A practical default is 8.

This is a hard engine constraint.

Nodes above the degree limit are rejected.

v2: Split overloaded nodes into multiple nearby nodes connected by short linking segments.

### Minimum intersection angle

The inner angle between incident segments at a node may not be below the configured minimum.

This prevents:

- broken textures
- visually collapsed intersections
- extremely sharp and ugly joins

We do not check this constraints for now. v2 may warn on very sharp angles but typically sharp angles are intended and can be dealt with Node Controller

### Minimum road clearance

Road centerlines must maintain a minimum clearance from one another unless they intentionally intersect or share a node.

A practical baseline is:

- at least half the road width around the segment centerline

This prevents:

- duplicate overlapping geometry
- nearly parallel roads placed too close together
- accidental shape duplication with tiny offsets

Clearance violations are rejected.

v2: Detect and deduplicate near-identical overlapping spans before fitting.
v3: Relax nearby spans geometrically to recover clearance.

## Segment start<>end

A segment may not start and end on the same point.

This is already enforced by the turning angle constraint since to start and end on a same point a segment would have to turn 360°.

## Geometry quantization

The fitter operates on quantized coordinates.

Only coordinates are quantized:

- x
- y
- z

A branded type storing the quantization unit as an integer is used.

Derived values are not quantized:

- tangents
- angles
- parameters
- lengths

This keeps spatial reasoning deterministic while preserving continuous math where it matters.

Benefits:

- stable node merging
- predictable intersection points
- fewer microscopic segments
- deterministic serialization
- easier debugging

## Heuristics

The fitter uses a small number of explicit heuristics.

### Span subdivision

When both length and turning-angle constraints apply, subdivision count is the maximum required by either constraint.

This ensures both are satisfied in one refinement step.

### Closed shapes

Closed shapes may be seeded with one or more canonical spans so that the fitter starts from a representation the game can render safely.

### Node identity

Nodes are identified by quantized position, not by floating-point epsilon comparisons scattered around the codebase.

### Unsupported overlap cases

Exact or near-exact overlap of authored shapes is treated as invalid input unless explicitly handled.

Examples:

- duplicate lines at the same location
- almost identical circles
- long collinear overlaps

They can rejected or deduplicated.

## Configuration

The fitter exposes configuration for geometry and validation.

- `maxSegmentLength` = 96
- `minSegmentLength` = road width * 0.5 + 4
- `maxTurnAngleDeg` = 90
- `maxNodeDegree` = 8
- `minRoadClearance` = road width * 0.5
- `quantizationStep` = 0.01m

It also exposes policy toggles for how to handle unsatisfied constraints.

Typical policy values:

- error
- warn

Policies are conservative by default.

## Error handling

The fitter is designed to fail clearly.

It should produce:

- deterministic results
- explicit warnings
- explicit hard errors for invalid layouts

Errors should identify:

- the violated constraint
- the affected figure or node/segment
- enough geometry context to reproduce the issue

Examples:

- segment shorter than minimum
- node degree exceeds maximum
- intersection angle below minimum
- clearance violated
- unsupported overlapping shapes

Warnings are appropriate for:

- suspicious but still representable geometry
- future relaxed policies that preserve output but degrade fidelity

## Non-goals

The fitter does not:

- guess user intent from invalid geometry
- silently merge unrelated intersections
- silently alter topology
- silently deform geometry to satisfy constraints

If a layout cannot be represented safely, it should be rejected instead of producing a broken network that looks valid until the game explodes in some ugly little corner.

## Future work

### v2

- short-segment relaxation by spacing out nearby cut points
- overloaded node splitting
- minimum-angle relaxation
- duplicate-shape deduplication
- overlap-aware cleanup before fitting

### v3

- topology-altering repair strategies
- node merging for irrecoverably short spans
- geometric relaxation solver across multiple neighboring spans
- mod-aware fitting hints
- smarter overlap and clearance recovery

## Summary

The fitter exists because authored geometry is continuous and ideal, while the game's road system is discrete and constrained.

Its job is to:

- preserve shape
- enforce constraints
- produce a valid graph
- fail loudly when that is impossible
