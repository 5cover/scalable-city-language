import {
  DEFAULT_JUNCTION_FLAGS,
  DEFAULT_MAX_SEGMENT_LENGTH
} from '../utils/constants.js';
import { buildNetwork } from '../domain/build.js';
import { polarPoint } from '../utils/geometry.js';
import type {
  ArchimedeanSpiralRoadInput,
  BuildResult,
  Canvas,
  CanvasOptions,
  CircleRoadInput,
  CircleRoadShape,
  LineRoadInput,
  LineRoadShape,
  RayRoadInput,
  ResolvedRoadStyle,
  RoadShape,
  ShapeId
} from '../domain/types.js';
import type { SpiralRoadShape } from '../domain/types.js';

const createShapeIdFactory = (): (() => ShapeId) => {
  let nextId = 1;

  return () => `shape-${nextId++}`;
};

const resolveRoadStyle = (
  defaults: CanvasOptions['defaultRoad'] | undefined,
  overrides: CircleRoadInput['road'] | undefined
): ResolvedRoadStyle => {
  const prefabName =
    overrides?.prefabName ?? defaults?.prefabName ?? 'Gravel Road';
  const flags =
    overrides?.flags ??
    defaults?.flags ??
    'Created End Moveable OnGround OneWayOut OneWayIn';
  const junctionFlags =
    overrides?.junctionFlags ??
    defaults?.junctionFlags ??
    DEFAULT_JUNCTION_FLAGS;

  return {
    prefabName,
    flags,
    junctionFlags
  };
};

const createCanvas = (options: CanvasOptions = {}): Canvas => {
  const shapes: RoadShape[] = [];
  const nextShapeId = createShapeIdFactory();
  const canvasDefaults = {
    maxSegmentLength: options.maxSegmentLength ?? DEFAULT_MAX_SEGMENT_LENGTH,
    defaultRoad: resolveRoadStyle(options.defaultRoad, undefined)
  };

  const addShape = <TShape extends RoadShape>(
    shape: Omit<TShape, 'id' | 'road'>,
    road: CircleRoadInput['road']
  ): ShapeId => {
    const id = nextShapeId();
    const resolvedShape = {
      ...shape,
      id,
      road: resolveRoadStyle(canvasDefaults.defaultRoad, road)
    } as TShape;

    shapes.push(resolvedShape);

    return id;
  };

  const withOptionalMaxSegmentLength = <
    TShape extends { readonly maxSegmentLength?: number }
  >(
    shape: TShape,
    maxSegmentLength: number | undefined
  ): TShape => {
    return maxSegmentLength === undefined
      ? shape
      : { ...shape, maxSegmentLength };
  };

  return {
    addLineRoad(input: LineRoadInput): ShapeId {
      return addShape(
        withOptionalMaxSegmentLength<Omit<LineRoadShape, 'id' | 'road'>>(
          {
            kind: 'line',
            start: input.start,
            end: input.end
          },
          input.maxSegmentLength
        ),
        input.road
      );
    },
    addRayRoad(input: RayRoadInput): ShapeId {
      return addShape(
        withOptionalMaxSegmentLength<Omit<LineRoadShape, 'id' | 'road'>>(
          {
            kind: 'line',
            start: input.start,
            end: polarPoint(
              input.start,
              input.length,
              input.angleDeg,
              input.endY
            )
          },
          input.maxSegmentLength
        ),
        input.road
      );
    },
    addCircleRoad(input: CircleRoadInput): ShapeId {
      return addShape(
        withOptionalMaxSegmentLength<Omit<CircleRoadShape, 'id' | 'road'>>(
          {
            kind: 'circle',
            center: input.center,
            radius: input.radius
          },
          input.maxSegmentLength
        ),
        input.road
      );
    },
    addArchimedeanSpiralRoad(input: ArchimedeanSpiralRoadInput): ShapeId {
      return addShape(
        withOptionalMaxSegmentLength<Omit<SpiralRoadShape, 'id' | 'road'>>(
          {
            kind: 'spiral',
            center: input.center,
            startRadius: input.startRadius,
            pitch: input.pitch,
            direction: input.direction ?? 'counterclockwise',
            startAngleDeg: input.startAngleDeg ?? 0,
            arcLength: input.arcLength
          },
          input.maxSegmentLength
        ),
        input.road
      );
    },
    listShapes(): readonly RoadShape[] {
      return shapes;
    },
    build(): BuildResult {
      return buildNetwork({
        maxSegmentLength: canvasDefaults.maxSegmentLength,
        shapes
      });
    }
  };
};

export { createCanvas };
