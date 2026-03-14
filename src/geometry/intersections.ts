import type { Figure } from '../domain/types.js';
import { invariant } from '../utils/assert.js';
import {
    INTERSECTION_SAMPLE_SPACING,
    MAX_INTERSECTION_SAMPLE_COUNT,
    MAX_ROOT_ITERATIONS,
    MIN_INTERSECTION_SAMPLE_COUNT,
    PARAMETER_EPSILON,
    POSITION_EPSILON,
} from '../utils/constants.js';
import { clamp, cross2, distance2, dot2, nearlyEqual, wrapClosedParam, point2, subtract2 } from '../utils/math.js';
import type { Shape } from './shapes.js';

export interface ShapeIntersection {
    readonly leftFigId: number;
    readonly rightFigId: number;
    readonly leftT: number;
    readonly rightT: number;
}

const dedupeIntersections = (
    intersections: readonly ShapeIntersection[],
    leftClosed: boolean,
    rightClosed: boolean
): ShapeIntersection[] => {
    const deduped: ShapeIntersection[] = [];

    for (const intersection of intersections) {
        const candidate = {
            ...intersection,
            leftT: leftClosed ? wrapClosedParam(intersection.leftT) : clamp(intersection.leftT, 0, 1),
            rightT: rightClosed ? wrapClosedParam(intersection.rightT) : clamp(intersection.rightT, 0, 1),
        };
        const exists = deduped.some(entry => {
            return (
                Math.abs(entry.leftT - candidate.leftT) <= PARAMETER_EPSILON &&
                Math.abs(entry.rightT - candidate.rightT) <= PARAMETER_EPSILON
            );
        });

        if (!exists) {
            deduped.push(candidate);
        }
    }

    return deduped;
};

const createIntersection = (left: Shape, right: Shape, leftT: number, rightT: number): ShapeIntersection => {
    return {
        leftFigId: left.figure.id,
        rightFigId: right.figure.id,
        leftT,
        rightT,
    };
};

const intersectLineLine = (left: Shape, right: Shape): ShapeIntersection[] => {
    const leftFig = left.figure as Extract<Figure, { kind: 'line' }>;
    const rightFig = right.figure as Extract<Figure, { kind: 'line' }>;
    const p = point2(leftFig.start.x, leftFig.start.z);
    const q = point2(rightFig.start.x, rightFig.start.z);
    const r = point2(leftFig.end.x - leftFig.start.x, leftFig.end.z - leftFig.start.z);
    const s = point2(rightFig.end.x - rightFig.start.x, rightFig.end.z - rightFig.start.z);
    const rxs = cross2(r, s);
    const qMinusP = subtract2(q, p);
    const qpxr = cross2(qMinusP, r);

    if (Math.abs(rxs) <= POSITION_EPSILON && Math.abs(qpxr) <= POSITION_EPSILON) {
        const rDotR = dot2(r, r);
        const t0 = dot2(qMinusP, r) / rDotR;
        const t1 = t0 + dot2(s, r) / rDotR;
        const overlapStart = Math.max(0, Math.min(t0, t1));
        const overlapEnd = Math.min(1, Math.max(t0, t1));

        invariant(
            overlapEnd - overlapStart <= POSITION_EPSILON,
            `Overlapping collinear line roads are not supported (${left.figure.id}, ${right.figure.id}).`
        );

        return [];
    }

    if (Math.abs(rxs) <= POSITION_EPSILON) {
        return [];
    }

    const t = cross2(qMinusP, s) / rxs;
    const u = cross2(qMinusP, r) / rxs;

    if (t < -PARAMETER_EPSILON || t > 1 + PARAMETER_EPSILON || u < -PARAMETER_EPSILON || u > 1 + PARAMETER_EPSILON) {
        return [];
    }

    return [createIntersection(left, right, clamp(t, 0, 1), clamp(u, 0, 1))];
};

const intersectLineCircle = (left: Shape, right: Shape): ShapeIntersection[] => {
    const line = left.figure.kind === 'line' ? left.figure : (right.figure as Extract<Figure, { kind: 'line' }>);
    const circle = left.figure.kind === 'circle' ? left.figure : (right.figure as Extract<Figure, { kind: 'circle' }>);
    const lineIsLeft = left.figure.kind === 'line';
    const start = point2(line.start.x, line.start.z);
    const end = point2(line.end.x, line.end.z);
    const center = point2(circle.center.x, circle.center.z);
    const direction = subtract2(end, start);
    const offset = subtract2(start, center);
    const a = dot2(direction, direction);
    const b = 2 * dot2(offset, direction);
    const c = dot2(offset, offset) - circle.radius * circle.radius;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < -POSITION_EPSILON) {
        return [];
    }

    const roots: number[] = [];
    if (Math.abs(discriminant) <= POSITION_EPSILON) {
        roots.push(-b / (2 * a));
    } else {
        const root = Math.sqrt(Math.max(discriminant, 0));
        roots.push((-b - root) / (2 * a), (-b + root) / (2 * a));
    }

    return dedupeIntersections(
        roots
            .filter(value => value >= -PARAMETER_EPSILON && value <= 1 + PARAMETER_EPSILON)
            .map(lineT => {
                const clamped = clamp(lineT, 0, 1);
                const point = lineIsLeft ? left.pointAt(clamped) : right.pointAt(clamped);
                const angle = Math.atan2(point.z - circle.center.z, point.x - circle.center.x);
                const circleT = wrapClosedParam(angle / (Math.PI * 2));

                return lineIsLeft
                    ? createIntersection(left, right, clamped, circleT)
                    : createIntersection(left, right, circleT, clamped);
            }),
        left.isClosed,
        right.isClosed
    );
};

const intersectCircleCircle = (left: Shape, right: Shape): ShapeIntersection[] => {
    const a = left.figure as Extract<Figure, { kind: 'circle' }>;
    const b = right.figure as Extract<Figure, { kind: 'circle' }>;
    const centerA = point2(a.center.x, a.center.z);
    const centerB = point2(b.center.x, b.center.z);
    const distance = distance2(centerA, centerB);

    invariant(
        !(distance <= POSITION_EPSILON && nearlyEqual(a.radius, b.radius)),
        `Overlapping circles are not supported (${a.id}, ${b.id}).`
    );

    if (distance > a.radius + b.radius + POSITION_EPSILON) {
        return [];
    }
    if (distance < Math.abs(a.radius - b.radius) - POSITION_EPSILON) {
        return [];
    }
    if (distance <= POSITION_EPSILON) {
        return [];
    }

    const baseDistance = (a.radius * a.radius - b.radius * b.radius + distance * distance) / (2 * distance);
    const heightSquared = a.radius * a.radius - baseDistance * baseDistance;
    const height = Math.sqrt(Math.max(heightSquared, 0));
    const axis = point2((centerB.x - centerA.x) / distance, (centerB.z - centerA.z) / distance);
    const perpendicular = point2(-axis.z, axis.x);
    const basePoint = point2(centerA.x + axis.x * baseDistance, centerA.z + axis.z * baseDistance);
    const points =
        height <= POSITION_EPSILON
            ? [basePoint]
            : [
                  point2(basePoint.x + perpendicular.x * height, basePoint.z + perpendicular.z * height),
                  point2(basePoint.x - perpendicular.x * height, basePoint.z - perpendicular.z * height),
              ];

    return dedupeIntersections(
        points.map(point => {
            const leftAngle = Math.atan2(point.z - a.center.z, point.x - a.center.x);
            const rightAngle = Math.atan2(point.z - b.center.z, point.x - b.center.x);

            return createIntersection(
                left,
                right,
                wrapClosedParam(leftAngle / (Math.PI * 2)),
                wrapClosedParam(rightAngle / (Math.PI * 2))
            );
        }),
        true,
        true
    );
};

const shapeSampleCount = (shape: Shape): number => {
    return clamp(
        Math.ceil(shape.totalLength / INTERSECTION_SAMPLE_SPACING),
        MIN_INTERSECTION_SAMPLE_COUNT,
        MAX_INTERSECTION_SAMPLE_COUNT
    );
};

const bisectRoot = (fn: (value: number) => number, start: number, end: number): number => {
    let low = start;
    let high = end;
    let lowValue = fn(low);

    for (let iteration = 0; iteration < MAX_ROOT_ITERATIONS; iteration += 1) {
        const mid = (low + high) / 2;
        const midValue = fn(mid);
        if (Math.abs(midValue) <= POSITION_EPSILON) {
            return mid;
        }

        if (Math.sign(lowValue) === Math.sign(midValue)) {
            low = mid;
            lowValue = midValue;
        } else {
            high = mid;
        }
    }

    return (low + high) / 2;
};

const scanRoots = (fn: (value: number) => number, sampleCount: number): number[] => {
    const roots: number[] = [];
    let previousT = 0;
    let previousValue = fn(0);

    for (let index = 1; index <= sampleCount; index += 1) {
        const currentT = index / sampleCount;
        const currentValue = fn(currentT);

        if (Math.abs(currentValue) <= POSITION_EPSILON) {
            roots.push(currentT);
        } else if (Math.abs(previousValue) <= POSITION_EPSILON) {
            roots.push(previousT);
        } else if (Math.sign(previousValue) !== Math.sign(currentValue)) {
            roots.push(bisectRoot(fn, previousT, currentT));
        }

        previousT = currentT;
        previousValue = currentValue;
    }

    return roots;
};

const intersectLineSpiral = (left: Shape, right: Shape): ShapeIntersection[] => {
    const line = left.figure.kind === 'line' ? left.figure : (right.figure as Extract<Figure, { kind: 'line' }>);
    const spiral = left.figure.kind === 'spiral' ? left : right;
    const lineIsLeft = left.figure.kind === 'line';
    const start = point2(line.start.x, line.start.z);
    const direction = point2(line.end.x - line.start.x, line.end.z - line.start.z);
    const directionLengthSquared = dot2(direction, direction);
    const roots = scanRoots(t => {
        const point = spiral.pointAt(t);
        return cross2(subtract2(point2(point.x, point.z), start), direction);
    }, shapeSampleCount(spiral));

    return dedupeIntersections(
        roots
            .map(spiralT => {
                const point = spiral.pointAt(spiralT);
                const lineT = dot2(subtract2(point2(point.x, point.z), start), direction) / directionLengthSquared;
                return { lineT, spiralT };
            })
            .filter(({ lineT }) => lineT >= -PARAMETER_EPSILON && lineT <= 1 + PARAMETER_EPSILON)
            .map(({ lineT, spiralT }) =>
                lineIsLeft
                    ? createIntersection(left, right, clamp(lineT, 0, 1), spiralT)
                    : createIntersection(left, right, spiralT, clamp(lineT, 0, 1))
            ),
        left.isClosed,
        right.isClosed
    );
};

const intersectCircleSpiral = (left: Shape, right: Shape): ShapeIntersection[] => {
    const circle = left.figure.kind === 'circle' ? left.figure : (right.figure as Extract<Figure, { kind: 'circle' }>);
    const spiral = left.figure.kind === 'spiral' ? left : right;
    const circleIsLeft = left.figure.kind === 'circle';
    const center = point2(circle.center.x, circle.center.z);
    const roots = scanRoots(t => {
        const point = spiral.pointAt(t);
        return distance2(point2(point.x, point.z), center) - circle.radius;
    }, shapeSampleCount(spiral));

    return dedupeIntersections(
        roots.map(spiralT => {
            const point = spiral.pointAt(spiralT);
            const circleT = wrapClosedParam(
                Math.atan2(point.z - circle.center.z, point.x - circle.center.x) / (Math.PI * 2)
            );

            return circleIsLeft
                ? createIntersection(left, right, circleT, spiralT)
                : createIntersection(left, right, spiralT, circleT);
        }),
        left.isClosed,
        right.isClosed
    );
};

export const intersectShapes = (left: Shape, right: Shape): ShapeIntersection[] => {
    if (left.figure.kind === 'line' && right.figure.kind === 'line') {
        return intersectLineLine(left, right);
    }
    if (
        (left.figure.kind === 'line' && right.figure.kind === 'circle') ||
        (left.figure.kind === 'circle' && right.figure.kind === 'line')
    ) {
        return intersectLineCircle(left, right);
    }
    if (left.figure.kind === 'circle' && right.figure.kind === 'circle') {
        return intersectCircleCircle(left, right);
    }
    if (
        (left.figure.kind === 'line' && right.figure.kind === 'spiral') ||
        (left.figure.kind === 'spiral' && right.figure.kind === 'line')
    ) {
        return intersectLineSpiral(left, right);
    }
    if (
        (left.figure.kind === 'circle' && right.figure.kind === 'spiral') ||
        (left.figure.kind === 'spiral' && right.figure.kind === 'circle')
    ) {
        return intersectCircleSpiral(left, right);
    }

    return [];
};
