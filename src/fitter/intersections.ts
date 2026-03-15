import { invariant } from '../utils/assert.js';
import { MAX_ROOT_ITERATIONS, PARAMETER_EPSILON, POSITION_EPSILON } from '../utils/constants.js';
import { clamp, cross2, distance2, point2, subtract2 } from '../utils/math.js';
import { degreesToRadians } from '../utils/geometry.js';
import { parameterInsideSpan, spanTurnAngle } from './spans.js';
import type { FitterOptions, Span, SpanIntersection } from './types.js';

interface Bounds {
    readonly minX: number;
    readonly minZ: number;
    readonly maxX: number;
    readonly maxZ: number;
}

interface FlatIntersectionCandidate {
    readonly leftU: number;
    readonly rightV: number;
}

const spanParameterAt = (span: Span, u: number): number => span.t0 + (span.t1 - span.t0) * u;

const spanPointAt = (span: Span, u: number) => span.shape.pointAt(spanParameterAt(span, u));

const spanDerivativeAt = (span: Span, u: number) => {
    const tangent = span.shape.tangentAt(spanParameterAt(span, u));
    const scale = span.t1 - span.t0;
    return point2(tangent.x * scale, tangent.z * scale);
};

const spanBounds = (span: Span): Bounds => {
    const samples = [0, 0.25, 0.5, 0.75, 1].map(u => spanPointAt(span, u));
    return samples.reduce<Bounds>(
        (bounds, point) => ({
            minX: Math.min(bounds.minX, point.x),
            minZ: Math.min(bounds.minZ, point.z),
            maxX: Math.max(bounds.maxX, point.x),
            maxZ: Math.max(bounds.maxZ, point.z),
        }),
        {
            minX: Number.POSITIVE_INFINITY,
            minZ: Number.POSITIVE_INFINITY,
            maxX: Number.NEGATIVE_INFINITY,
            maxZ: Number.NEGATIVE_INFINITY,
        }
    );
};

const boundsOverlap = (left: Bounds, right: Bounds): boolean => {
    return !(
        left.maxX < right.minX - POSITION_EPSILON ||
        right.maxX < left.minX - POSITION_EPSILON ||
        left.maxZ < right.minZ - POSITION_EPSILON ||
        right.maxZ < left.minZ - POSITION_EPSILON
    );
};

const distancePointToChord = (
    point: { x: number; z: number },
    start: { x: number; z: number },
    end: { x: number; z: number }
): number => {
    const numerator = Math.abs(
        (end.z - start.z) * point.x - (end.x - start.x) * point.z + end.x * start.z - end.z * start.x
    );
    const denominator = Math.hypot(end.z - start.z, end.x - start.x);
    return denominator <= POSITION_EPSILON
        ? distance2(point2(point.x, point.z), point2(start.x, start.z))
        : numerator / denominator;
};

const isFlatEnough = (span: Span, options: FitterOptions): boolean => {
    const start = spanPointAt(span, 0);
    const mid = spanPointAt(span, 0.5);
    const end = spanPointAt(span, 1);
    return (
        distancePointToChord(mid, start, end) <= options.intersectionFlatnessDistanceTolerance &&
        spanTurnAngle(span) <= degreesToRadians(options.intersectionFlatnessTurnAngleDeg)
    );
};

const splitSpanMid = (span: Span): [Span, Span] => {
    const tm = spanParameterAt(span, 0.5);
    return [
        { id: `${span.id}:0`, shape: span.shape, t0: span.t0, t1: tm },
        { id: `${span.id}:1`, shape: span.shape, t0: tm, t1: span.t1 },
    ];
};

const intersectChordSegments = (left: Span, right: Span): FlatIntersectionCandidate[] => {
    const p = point2(spanPointAt(left, 0).x, spanPointAt(left, 0).z);
    const p2 = point2(spanPointAt(left, 1).x, spanPointAt(left, 1).z);
    const q = point2(spanPointAt(right, 0).x, spanPointAt(right, 0).z);
    const q2 = point2(spanPointAt(right, 1).x, spanPointAt(right, 1).z);
    const r = subtract2(p2, p);
    const s = subtract2(q2, q);
    const rxs = cross2(r, s);
    const qMinusP = subtract2(q, p);
    const qpxr = cross2(qMinusP, r);

    if (Math.abs(rxs) <= POSITION_EPSILON && Math.abs(qpxr) <= POSITION_EPSILON) {
        invariant(false, `Overlapping spans are not supported (${left.shape.figure.id}, ${right.shape.figure.id}).`);
    }

    if (Math.abs(rxs) <= POSITION_EPSILON) {
        return [];
    }

    const t = cross2(qMinusP, s) / rxs;
    const u = cross2(qMinusP, r) / rxs;

    if (t < -PARAMETER_EPSILON || t > 1 + PARAMETER_EPSILON || u < -PARAMETER_EPSILON || u > 1 + PARAMETER_EPSILON) {
        return [];
    }

    return [{ leftU: clamp(t, 0, 1), rightV: clamp(u, 0, 1) }];
};

const refineIntersection = (
    left: Span,
    right: Span,
    initialLeftU: number,
    initialRightV: number,
    options: FitterOptions
): SpanIntersection | undefined => {
    let u = clamp(initialLeftU, 0, 1);
    let v = clamp(initialRightV, 0, 1);

    for (let iteration = 0; iteration < MAX_ROOT_ITERATIONS; iteration += 1) {
        const leftPoint = spanPointAt(left, u);
        const rightPoint = spanPointAt(right, v);
        const delta = point2(rightPoint.x - leftPoint.x, rightPoint.z - leftPoint.z);

        if (Math.hypot(delta.x, delta.z) <= options.intersectionPointTolerance) {
            const leftT = parameterInsideSpan(left, spanParameterAt(left, u));
            const rightT = parameterInsideSpan(right, spanParameterAt(right, v));

            if (leftT === undefined || rightT === undefined) {
                return undefined;
            }

            return {
                leftSpanId: left.id,
                rightSpanId: right.id,
                leftT,
                rightT,
            };
        }

        const leftDerivative = spanDerivativeAt(left, u);
        const rightDerivative = spanDerivativeAt(right, v);
        const determinant = cross2(leftDerivative, rightDerivative);

        if (Math.abs(determinant) <= POSITION_EPSILON) {
            break;
        }

        const du = cross2(delta, rightDerivative) / determinant;
        const dv = cross2(leftDerivative, delta) / determinant;

        u = clamp(u + du, 0, 1);
        v = clamp(v + dv, 0, 1);
    }

    const leftPoint = spanPointAt(left, u);
    const rightPoint = spanPointAt(right, v);
    if (
        distance2(point2(leftPoint.x, leftPoint.z), point2(rightPoint.x, rightPoint.z)) >
        options.intersectionPointTolerance
    ) {
        return undefined;
    }

    const leftT = parameterInsideSpan(left, spanParameterAt(left, u));
    const rightT = parameterInsideSpan(right, spanParameterAt(right, v));

    if (leftT === undefined || rightT === undefined) {
        return undefined;
    }

    return {
        leftSpanId: left.id,
        rightSpanId: right.id,
        leftT,
        rightT,
    };
};

const dedupeIntersections = (intersections: readonly SpanIntersection[]): SpanIntersection[] => {
    const deduped: SpanIntersection[] = [];

    for (const intersection of intersections) {
        const exists = deduped.some(existing => {
            return (
                Math.abs(existing.leftT - intersection.leftT) <= PARAMETER_EPSILON &&
                Math.abs(existing.rightT - intersection.rightT) <= PARAMETER_EPSILON
            );
        });

        if (!exists) {
            deduped.push(intersection);
        }
    }

    return deduped;
};

export const intersectSpans = (left: Span, right: Span, options: FitterOptions): SpanIntersection[] => {
    const pending: { left: Span; right: Span; depth: number }[] = [{ left, right, depth: 0 }];
    const intersections: SpanIntersection[] = [];

    while (pending.length > 0) {
        const current = pending.pop();
        if (current === undefined) {
            continue;
        }

        if (!boundsOverlap(spanBounds(current.left), spanBounds(current.right))) {
            continue;
        }

        const leftFlat = isFlatEnough(current.left, options);
        const rightFlat = isFlatEnough(current.right, options);

        if ((leftFlat && rightFlat) || current.depth >= options.maxIntersectionSubdivisionDepth) {
            for (const candidate of intersectChordSegments(current.left, current.right)) {
                const refined = refineIntersection(
                    current.left,
                    current.right,
                    candidate.leftU,
                    candidate.rightV,
                    options
                );
                if (refined !== undefined) {
                    intersections.push(refined);
                }
            }
            continue;
        }

        if (!leftFlat && (rightFlat || spanTurnAngle(current.left) >= spanTurnAngle(current.right))) {
            const [leftA, leftB] = splitSpanMid(current.left);
            pending.push({ left: leftA, right: current.right, depth: current.depth + 1 });
            pending.push({ left: leftB, right: current.right, depth: current.depth + 1 });
            continue;
        }

        const [rightA, rightB] = splitSpanMid(current.right);
        pending.push({ left: current.left, right: rightA, depth: current.depth + 1 });
        pending.push({ left: current.left, right: rightB, depth: current.depth + 1 });
    }

    return dedupeIntersections(intersections);
};
