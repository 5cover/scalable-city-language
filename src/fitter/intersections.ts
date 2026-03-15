import type { Figure } from '../domain/types.js';
import type { Shape } from '../geometry/shapes.js';
import { invariant } from '../utils/assert.js';
import {
    INTERSECTION_SAMPLE_SPACING,
    MAX_INTERSECTION_SAMPLE_COUNT,
    MAX_ROOT_ITERATIONS,
    MIN_INTERSECTION_SAMPLE_COUNT,
    PARAMETER_EPSILON,
    POSITION_EPSILON,
} from '../utils/constants.js';
import { clamp, cross2, distance2, dot2, nearlyEqual, point2, subtract2 } from '../utils/math.js';
import { parameterInsideSpan } from './spans.js';
import type { Span, SpanIntersection } from './types.js';

interface ShapeIntersection {
    readonly leftT: number;
    readonly rightT: number;
}

const createIntersection = (leftT: number, rightT: number): ShapeIntersection => ({ leftT, rightT });

const sampleCountForShape = (shape: Shape): number => {
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

const intersectLineLine = (left: Shape, right: Shape): ShapeIntersection[] => {
    const a = (left.figure as Extract<Figure, { kind: 'line' }>).params;
    const b = (right.figure as Extract<Figure, { kind: 'line' }>).params;
    const p = point2(a.start.x, a.start.z);
    const q = point2(b.start.x, b.start.z);
    const r = point2(a.end.x - a.start.x, a.end.z - a.start.z);
    const s = point2(b.end.x - b.start.x, b.end.z - b.start.z);
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

    return [createIntersection(clamp(t, 0, 1), clamp(u, 0, 1))];
};

const intersectLineCircle = (left: Shape, right: Shape): ShapeIntersection[] => {
    const line = (left.figure.kind === 'line' ? left.figure : (right.figure as Extract<Figure, { kind: 'line' }>)).params;
    const circle = (left.figure.kind === 'circle'
        ? left.figure
        : (right.figure as Extract<Figure, { kind: 'circle' }>)).params;
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

    return roots
        .filter(value => value >= -PARAMETER_EPSILON && value <= 1 + PARAMETER_EPSILON)
        .map(lineT => {
            const clamped = clamp(lineT, 0, 1);
            const point = lineIsLeft ? left.pointAt(clamped) : right.pointAt(clamped);
            const angle = Math.atan2(point.z - circle.center.z, point.x - circle.center.x);
            const circleT = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
            return lineIsLeft ? createIntersection(clamped, circleT) : createIntersection(circleT, clamped);
        });
};

const intersectCircleCircle = (left: Shape, right: Shape): ShapeIntersection[] => {
    const a = (left.figure as Extract<Figure, { kind: 'circle' }>).params;
    const b = (right.figure as Extract<Figure, { kind: 'circle' }>).params;
    const centerA = point2(a.center.x, a.center.z);
    const centerB = point2(b.center.x, b.center.z);
    const distance = distance2(centerA, centerB);

    invariant(
        !(distance <= POSITION_EPSILON && nearlyEqual(a.radius, b.radius)),
        `Overlapping circles are not supported (${left.figure.id}, ${right.figure.id}).`
    );

    if (distance > a.radius + b.radius + POSITION_EPSILON) {
        return [];
    }
    if (distance < Math.abs(a.radius - b.radius) - POSITION_EPSILON || distance <= POSITION_EPSILON) {
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

    return points.map(point => {
        const leftAngle = Math.atan2(point.z - a.center.z, point.x - a.center.x);
        const rightAngle = Math.atan2(point.z - b.center.z, point.x - b.center.x);
        return createIntersection(
            ((leftAngle / (Math.PI * 2)) % 1 + 1) % 1,
            ((rightAngle / (Math.PI * 2)) % 1 + 1) % 1
        );
    });
};

const intersectLineSpiral = (left: Shape, right: Shape): ShapeIntersection[] => {
    const line = (left.figure.kind === 'line' ? left.figure : (right.figure as Extract<Figure, { kind: 'line' }>)).params;
    const spiral = left.figure.kind === 'spiral' ? left : right;
    const lineIsLeft = left.figure.kind === 'line';
    const start = point2(line.start.x, line.start.z);
    const direction = point2(line.end.x - line.start.x, line.end.z - line.start.z);
    const directionLengthSquared = dot2(direction, direction);
    const roots = scanRoots(t => {
        const point = spiral.pointAt(t);
        return cross2(subtract2(point2(point.x, point.z), start), direction);
    }, sampleCountForShape(spiral));

    return roots
        .map(spiralT => {
            const point = spiral.pointAt(spiralT);
            const lineT = dot2(subtract2(point2(point.x, point.z), start), direction) / directionLengthSquared;
            return { lineT, spiralT };
        })
        .filter(({ lineT }) => lineT >= -PARAMETER_EPSILON && lineT <= 1 + PARAMETER_EPSILON)
        .map(({ lineT, spiralT }) =>
            lineIsLeft ? createIntersection(clamp(lineT, 0, 1), spiralT) : createIntersection(spiralT, clamp(lineT, 0, 1))
        );
};

const intersectCircleSpiral = (left: Shape, right: Shape): ShapeIntersection[] => {
    const circle = (left.figure.kind === 'circle'
        ? left.figure
        : (right.figure as Extract<Figure, { kind: 'circle' }>)).params;
    const spiral = left.figure.kind === 'spiral' ? left : right;
    const circleIsLeft = left.figure.kind === 'circle';
    const center = point2(circle.center.x, circle.center.z);
    const roots = scanRoots(t => {
        const point = spiral.pointAt(t);
        return distance2(point2(point.x, point.z), center) - circle.radius;
    }, sampleCountForShape(spiral));

    return roots.map(spiralT => {
        const point = spiral.pointAt(spiralT);
        const circleT = ((Math.atan2(point.z - circle.center.z, point.x - circle.center.x) / (Math.PI * 2)) % 1 + 1) % 1;
        return circleIsLeft ? createIntersection(circleT, spiralT) : createIntersection(spiralT, circleT);
    });
};

const intersectShapes = (left: Shape, right: Shape): ShapeIntersection[] => {
    if (left.figure.kind === 'line' && right.figure.kind === 'line') {
        return intersectLineLine(left, right);
    }
    if ((left.figure.kind === 'line' && right.figure.kind === 'circle') || (left.figure.kind === 'circle' && right.figure.kind === 'line')) {
        return intersectLineCircle(left, right);
    }
    if (left.figure.kind === 'circle' && right.figure.kind === 'circle') {
        return intersectCircleCircle(left, right);
    }
    if ((left.figure.kind === 'line' && right.figure.kind === 'spiral') || (left.figure.kind === 'spiral' && right.figure.kind === 'line')) {
        return intersectLineSpiral(left, right);
    }
    if ((left.figure.kind === 'circle' && right.figure.kind === 'spiral') || (left.figure.kind === 'spiral' && right.figure.kind === 'circle')) {
        return intersectCircleSpiral(left, right);
    }

    return [];
};

export const intersectSpans = (left: Span, right: Span): SpanIntersection[] => {
    return intersectShapes(left.shape, right.shape)
        .map(intersection => {
            const leftT = parameterInsideSpan(left, intersection.leftT);
            const rightT = parameterInsideSpan(right, intersection.rightT);

            if (leftT === undefined || rightT === undefined) {
                return undefined;
            }

            return {
                leftSpanId: left.id,
                rightSpanId: right.id,
                leftT,
                rightT,
            };
        })
        .filter((value): value is SpanIntersection => value !== undefined);
};
