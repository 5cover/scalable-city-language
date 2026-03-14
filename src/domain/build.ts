import { createShape, type Shape } from '../geometry/shapes.js';
import { intersectShapes } from '../geometry/intersections.js';
import { invariant } from '../utils/assert.js';
import { NODE_MERGE_EPSILON, PARAMETER_EPSILON } from '../utils/constants.js';
import { negate2, wrapClosedParam } from '../utils/math.js';
import type {
    BuildResult,
    BuildSettings,
    NetworkNode,
    NetworkSegment,
    Point3,
    RoadStyle,
    Figure,
    Flag,
} from './types.js';

interface NodeAccumulator {
    readonly key: string;
    readonly position: Point3;
    readonly style: RoadStyle;
    readonly segmentKeys: string[];
}

interface ShapeState {
    readonly figure: Figure;
    readonly shape: Shape;
    readonly splitParameters: number[];
}

const uniqueSortedParameters = (parameters: readonly number[], isClosed: boolean): number[] => {
    const normalized = parameters
        .map(value => {
            if (!isClosed) {
                return Math.min(1, Math.max(0, value));
            }

            const wrapped = wrapClosedParam(value);
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
                        : accumulator.y + node.position.y,
            };
        },
        {
            x: 0,
            y: 0 as number | undefined,
            z: 0,
        }
    );

    return total.y === undefined
        ? { x: total.x / nodes.length, z: total.z / nodes.length }
        : {
              x: total.x / nodes.length,
              y: total.y / nodes.length,
              z: total.z / nodes.length,
          };
};

export const buildNetwork = (settings: BuildSettings): BuildResult => {
    const shapeStates: ShapeState[] = settings.figures.map(figure => {
        const shape = createShape(figure);
        return {
            figure,
            shape,
            splitParameters: shape.isClosed ? [0] : [0, 1],
        };
    });

    for (let leftIndex = 0; leftIndex < shapeStates.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < shapeStates.length; rightIndex += 1) {
            const left = shapeStates[leftIndex];
            const right = shapeStates[rightIndex];
            if (left === undefined || right === undefined) {
                continue;
            }
            const intersections = intersectShapes(left.shape, right.shape);

            for (const intersection of intersections) {
                left.splitParameters.push(intersection.leftT);
                right.splitParameters.push(intersection.rightT);
            }
        }
    }

    const nodeMap = new Map<string, NodeAccumulator>();
    const segments: NetworkSegment[] = [];

    const samePosition = (left: Point3, right: Point3): boolean => {
        if (Math.abs(left.x - right.x) > NODE_MERGE_EPSILON || Math.abs(left.z - right.z) > NODE_MERGE_EPSILON) {
            return false;
        }

        if (left.y === undefined && right.y === undefined) {
            return true;
        }
        if (left.y === undefined || right.y === undefined) {
            return false;
        }

        return Math.abs(left.y - right.y) <= NODE_MERGE_EPSILON;
    };

    const getOrCreateNode = (position: Point3, style: RoadStyle): NodeAccumulator => {
        for (const existing of nodeMap.values()) {
            if (samePosition(existing.position, position)) {
                return existing;
            }
        }

        const created: NodeAccumulator = {
            key: `node-${nodeMap.size}`,
            position,
            style,
            segmentKeys: [],
        };
        nodeMap.set(created.key, created);
        return created;
    };

    const appendSegment = (
        figure: Figure,
        shape: Shape,
        startT: number,
        endT: number,
        startLength: number,
        endLength: number
    ): void => {
        if (Math.abs(endLength - startLength) <= PARAMETER_EPSILON) {
            return;
        }

        const start = shape.pointAt(startT);
        const end = shape.pointAt(endT);
        const startNode = getOrCreateNode(start, figure.options.road);
        const endNode = getOrCreateNode(end, figure.options.road);
        const key = `segment-${segments.length}`;
        const midpointLength = (startLength + endLength) / 2;
        const midpoint = shape.pointAt(shape.parameterAtLength(midpointLength));
        const startDirection = shape.tangentAt(startT);
        const endDirection = negate2(shape.tangentAt(endT));

        segments.push({
            key,
            prefabName: figure.options.road.prefabName,
            startNodeKey: startNode.key,
            endNodeKey: endNode.key,
            start,
            end,
            midpoint,
            startDirection,
            endDirection,
            sourceFigId: figure.id,
        });

        startNode.segmentKeys.push(key);
        endNode.segmentKeys.push(key);
    };

    for (const state of shapeStates) {
        const splitParameters = uniqueSortedParameters(state.splitParameters, state.shape.isClosed);
        const maxSegmentLength = state.figure.options.maxSegmentLength;
        invariant(maxSegmentLength > 0, `Shape ${state.figure.id} must have a positive maxSegmentLength.`);

        // todo: smarter calculation for minimum piece count
        // any segment's tangeants may not meet at an angle greater than 90°

        if (state.shape.isClosed) {
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
                const startLength = state.shape.totalLength * startParam;
                const endLength = state.shape.totalLength * endParam;
                const intervalLength = endLength - startLength;
                // 4 segments is the minimum for a precise circle in CS. 2 is buggy, 3 becomes ovoid.
                const pieceCount = Math.max(4, Math.ceil(intervalLength / maxSegmentLength));

                for (let pieceIndex = 0; pieceIndex < pieceCount; pieceIndex += 1) {
                    const pieceStartLength = startLength + (intervalLength * pieceIndex) / pieceCount;
                    const pieceEndLength = startLength + (intervalLength * (pieceIndex + 1)) / pieceCount;
                    appendSegment(
                        state.figure,
                        state.shape,
                        state.shape.parameterAtLength(pieceStartLength),
                        state.shape.parameterAtLength(pieceEndLength),
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
            const startLength = state.shape.lengthAt(startT);
            const endLength = state.shape.lengthAt(endT);
            const intervalLength = endLength - startLength;
            const pieceCount = Math.max(1, Math.ceil(intervalLength / maxSegmentLength));

            for (let pieceIndex = 0; pieceIndex < pieceCount; pieceIndex += 1) {
                const pieceStartLength = startLength + (intervalLength * pieceIndex) / pieceCount;
                const pieceEndLength = startLength + (intervalLength * (pieceIndex + 1)) / pieceCount;
                appendSegment(
                    state.figure,
                    state.shape,
                    state.shape.parameterAtLength(pieceStartLength),
                    state.shape.parameterAtLength(pieceEndLength),
                    pieceStartLength,
                    pieceEndLength
                );
            }
        }
    }

    const nodes: NetworkNode[] = Array.from(nodeMap.values()).map(node => {
        const flags: Flag[] =
            node.segmentKeys.length > 2
                ? ['Junction']
                : node.segmentKeys.length > 1
                  ? ['Middle', 'Moveable', 'OnGround']
                  : [];

        return {
            key: node.key,
            position: node.position,
            prefabName: node.style.prefabName,
            flags: [...flags, ...node.style.flags],
        };
    });

    return {
        center: averageCenter(nodes),
        nodes,
        segments,
        figs: settings.figures,
    };
};
