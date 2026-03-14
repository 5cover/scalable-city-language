# Scalable City Language

SCL is a TypeScript library for describing Cities: Skylines road layouts as shapes instead of manually authored nodes.

You add line roads, rays, circles, and Archimedean spirals to a canvas. SCL resolves intersections, creates nodes, splits long geometry into valid segments, and compiles the result to Move It selection XML.

## Current Scope

This repository currently implements:

- a strict TypeScript library package
- figure authoring through a small canvas API
- line, ray, circle, and Archimedean spiral roads
- automatic intersection detection for line/line, line/circle, circle/circle, line/spiral, and circle/spiral
- automatic node derivation from endpoints, intersections, and max-length subdivision
- Move It XML export in the stripped format documented in [`docs/Format.md`](docs/Format.md)
- tests with `node:test`

This repository does not currently include:

- a CLI
- a browser playground
- a DSL

## Install

```sh
pnpm install
```

## Usage

```ts
import {
  compileToMoveIt,
  createCanvas,
  polarPoint
} from 'scalable-city-language';

const canvas = createCanvas({
  maxSegmentLength: 96,
  defaultRoad: {
    prefabName: 'Gravel Road',
    flags: 'Created End Moveable OnGround OneWayOut OneWayIn'
  }
});

canvas.addCircleRoad({
  center: { x: 0, z: 0 },
  radius: 10
});

canvas.addArchimedeanSpiralRoad({
  center: { x: 0, z: 0 },
  startRadius: 20,
  pitch: 82.3,
  direction: 'clockwise',
  startAngleDeg: 0,
  arcLength: 900
});

for (let index = 0; index < 5; index += 1) {
  const angleDeg = (360 / 5) * index;
  canvas.addLineRoad({
    start: { x: 0, z: 0 },
    end: polarPoint({ x: 0, z: 0 }, 180, angleDeg)
  });
}

const network = canvas.build();
const xml = compileToMoveIt(network);
```

## API Notes

- `createCanvas(options)` creates the authoring surface and stores declarative figures.
- `canvas.addLineRoad(...)`, `canvas.addRayRoad(...)`, `canvas.addCircleRoad(...)`, and `canvas.addArchimedeanSpiralRoad(...)` add shapes only. Users never create nodes directly.
- `canvas.build()` resolves the figure set into a network IR containing nodes, three-point segments `(start, control, end)`, and a computed center.
- `compileToMoveIt(network)` turns that IR into Move It XML with deterministic node and segment IDs, writing segment `control` to `<position>` and deriving Hermite directions from it.
- Coordinates are meters.
- `x` is east/west, `z` is north/south, and optional `y` is elevation.
- If `y` is omitted, SCL omits `<y>` in XML so Move It can snap that position to terrain height.

## Vocabulary

- Input : API parameters to create a figure.
- Figure : high level shape representation
- Shape : parametric shape IR

## Running Checks

```sh
pnpm run build
pnpm run lint
pnpm run test
```

## What Is Implemented Now

- shared parametric shape handling for lines, circles, and spirals
- one segmentation pipeline for intersections and max segment length splitting
- configurable canvas-level defaults and per-shape overrides for prefab name, flags, and junction flags
- deterministic Move It XML output using a single root `xmlns:xsi` declaration

## Known Limitations

This is a v1 geometry engine. Current limitations are intentional:

- overlapping or collinear duplicate geometry is rejected for supported exact cases instead of being merged
- spiral intersections are found with sampled root scans plus refinement, not a symbolic curve-curve solver
- spiral/spiral intersections are not implemented yet
- node prefab and flag resolution at mixed-prefab intersections currently follows the first shape that creates the node
- circles are exported as segmented network geometry, not native arc primitives

## Move It Notes

Move It XML generation follows [`docs/Format.md`](docs/Format.md) as the source of truth and uses the sample exports in [`docs/sample moveit exports`](docs/sample%20moveit%20exports) for serializer shape checks.

The compiler currently emits only the stripped fields needed for road networks:

- `Selection`
- `center`
- `version`
- `NodeState`
- `SegmentState`

## Development

The codebase is organized into:

- `src/api`
- `src/domain`
- `src/geometry`
- `src/compiler/moveit`
- `src/utils`
- `test`
