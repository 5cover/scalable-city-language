import { createCurve } from '../geometry/curves.js';
import { intersectCurves } from '../geometry/intersections.js';
import { PARAMETER_EPSILON } from '../utils/constants.js';
import { invariant } from '../utils/assert.js';
import { negate2, positionKey } from '../utils/math.js';
import type {
  BuildResult,
  BuildSettings,
  NetworkNode,
  NetworkSegment,
  Point3,
  ResolvedRoadStyle,
  RoadShape
} from './types.js';

interface NodeAccumulator {
  readonly key: string;
  readonly position: Point3;
  readonly style: ResolvedRoadStyle;
  readonly segmentKeys: string[];
}

interface CurveState {
  readonly shape: RoadShape;
  readonly curve: ReturnType<typeof createCurve>;
  readonly splitParameters: number[];
}

const uniqueSortedParameters = (parameters: readonly number[], isClosed: boolean): number[] => {
  const normalized = parameters
    .map((value) => {
      if (!isClosed) {
        return Math.min(1, Math.max(0, value));
      }

      const wrapped = ((value % 1) + 1) % 1;
      return wrapped >= 1 - PARAMETER_EPSILON ? 0 : wrapped;
    })
    .sort((left, right) => left - right);

  const deduped: number[] = [];
  for (const value of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous === undefined || Math.abs(previous - value) > PARAMETER_EPSILON) {
      deduped.push(value);
    }
  }

  return deduped;
};

const averageCenter = (nodes: readonly NetworkNode[]): Point3 | undefined => {
  if (nodes.length === 0) {
    return undefined;
  }

  const total = nodes.reduce(
    (accumulator, node) => {
      return {
        x: accumulator.x + node.position.x,
        z: accumulator.z + node.position.z,
        y:
          accumulator.y === undefined || node.position.y === undefined
            ? undefined
            : accumulator.y + node.position.y
      };
    },
    {
      x: 0,
      y: 0 as number | undefined,
      z: 0
    }
  );

  return total.y === undefined
    ? { x: total.x / nodes.length, z: total.z / nodes.length }
    : { x: total.x / nodes.length, y: total.y / nodes.length, z: total.z / nodes.length };
};

const buildNetwork = (settings: BuildSettings): BuildResult => {
  const curveStates: CurveState[] = settings.shapes.map((shape) => {
    const curve = createCurve(shape);
    return {
      shape,
      curve,
      splitParameters: curve.isClosed ? [0] : [0, 1]
    };
  });

  for (let leftIndex = 0; leftIndex < curveStates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < curveStates.length; rightIndex += 1) {
      const left = curveStates[leftIndex];
      const right = curveStates[rightIndex];
      if (left === undefined || right === undefined) {
        continue;
      }
      const intersections = intersectCurves(left.curve, right.curve);

      for (const intersection of intersections) {
        left.splitParameters.push(intersection.leftT);
        right.splitParameters.push(intersection.rightT);
      }
    }
  }

  const nodeMap = new Map<string, NodeAccumulator>();
  const segments: NetworkSegment[] = [];

  const getOrCreateNode = (position: Point3, style: ResolvedRoadStyle): NodeAccumulator => {
    const key = positionKey(position);
    const existing = nodeMap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const created: NodeAccumulator = {
      key: `node-${nodeMap.size}`,
      position,
      style,
      segmentKeys: []
    };
    nodeMap.set(key, created);
    return created;
  };

  const appendSegment = (
    shape: RoadShape,
    curve: ReturnType<typeof createCurve>,
    startT: number,
    endT: number,
    startLength: number,
    endLength: number
  ): void => {
    if (Math.abs(endLength - startLength) <= PARAMETER_EPSILON) {
      return;
    }

    const start = curve.pointAt(startT);
    const end = curve.pointAt(endT);
    const startNode = getOrCreateNode(start, shape.road);
    const endNode = getOrCreateNode(end, shape.road);
    const key = `segment-${segments.length}`;
    const midpointLength = (startLength + endLength) / 2;
    const midpoint = curve.pointAt(curve.parameterAtLength(midpointLength));
    const startDirection = curve.tangentAt(startT);
    const endDirection = negate2(curve.tangentAt(endT));

    segments.push({
      key,
      prefabName: shape.road.prefabName,
      startNodeKey: startNode.key,
      endNodeKey: endNode.key,
      start,
      end,
      midpoint,
      startDirection,
      endDirection,
      sourceShapeId: shape.id
    });

    startNode.segmentKeys.push(key);
    endNode.segmentKeys.push(key);
  };

  for (const state of curveStates) {
    const splitParameters = uniqueSortedParameters(state.splitParameters, state.curve.isClosed);
    const maxSegmentLength = state.shape.maxSegmentLength ?? settings.maxSegmentLength;
    invariant(maxSegmentLength > 0, `Shape ${state.shape.id} must have a positive maxSegmentLength.`);

    if (state.curve.isClosed) {
      const intervals =
        splitParameters.length === 1
          ? [[0, 1]]
          : splitParameters.flatMap<[number, number]>((start, index) => {
              const next = splitParameters[(index + 1) % splitParameters.length];
              if (next === undefined) {
                return [];
              }

              return [[start, index === splitParameters.length - 1 ? next + 1 : next]];
            });

      for (const [startParam, endParam] of intervals) {
        if (startParam === undefined || endParam === undefined) {
          continue;
        }
        const startLength = state.curve.totalLength * startParam;
        const endLength = state.curve.totalLength * endParam;
        const intervalLength = endLength - startLength;
        const pieceCount = Math.max(1, Math.ceil(intervalLength / maxSegmentLength));

        for (let pieceIndex = 0; pieceIndex < pieceCount; pieceIndex += 1) {
          const pieceStartLength = startLength + (intervalLength * pieceIndex) / pieceCount;
          const pieceEndLength = startLength + (intervalLength * (pieceIndex + 1)) / pieceCount;
          appendSegment(
            state.shape,
            state.curve,
            state.curve.parameterAtLength(pieceStartLength),
            state.curve.parameterAtLength(pieceEndLength),
            pieceStartLength,
            pieceEndLength
          );
        }
      }

      continue;
    }

    for (let index = 0; index < splitParameters.length - 1; index += 1) {
      const startT = splitParameters[index];
      const endT = splitParameters[index + 1];
      if (startT === undefined || endT === undefined) {
        continue;
      }
      const startLength = state.curve.lengthAt(startT);
      const endLength = state.curve.lengthAt(endT);
      const intervalLength = endLength - startLength;
      const pieceCount = Math.max(1, Math.ceil(intervalLength / maxSegmentLength));

      for (let pieceIndex = 0; pieceIndex < pieceCount; pieceIndex += 1) {
        const pieceStartLength = startLength + (intervalLength * pieceIndex) / pieceCount;
        const pieceEndLength = startLength + (intervalLength * (pieceIndex + 1)) / pieceCount;
        appendSegment(
          state.shape,
          state.curve,
          state.curve.parameterAtLength(pieceStartLength),
          state.curve.parameterAtLength(pieceEndLength),
          pieceStartLength,
          pieceEndLength
        );
      }
    }
  }

  const nodes: NetworkNode[] = Array.from(nodeMap.values()).map((node) => {
    const flags = node.segmentKeys.length > 1 ? node.style.junctionFlags : node.style.flags;

    return {
      key: node.key,
      position: node.position,
      prefabName: node.style.prefabName,
      flags
    };
  });

  return {
    center: averageCenter(nodes),
    nodes,
    segments,
    shapes: settings.shapes
  };
};

export { buildNetwork };
