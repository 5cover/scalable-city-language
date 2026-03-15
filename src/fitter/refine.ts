import type { Shape } from '../geometry/shapes.js';
import { degreesToRadians } from '../utils/geometry.js';
import { intersectSpans } from './intersections.js';
import { splitSpanAtParameters, spanLength, spanTurnAngle, subdivideSpan, mkspan } from './spans.js';
import type { FitterOptions, Span } from './types.js';

const splitAllIntersections = (spans: readonly Span[], options: FitterOptions): { changed: boolean; spans: Span[] } => {
    const cutParameters = new Map<string, number[]>();

    for (let leftIndex = 0; leftIndex < spans.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < spans.length; rightIndex += 1) {
            const left = spans[leftIndex];
            const right = spans[rightIndex];
            if (left === undefined || right === undefined || left.shape.figure.id === right.shape.figure.id) {
                continue;
            }

            const intersections = intersectSpans(left, right, options);
            for (const intersection of intersections) {
                cutParameters.set(intersection.leftSpanId, [
                    ...(cutParameters.get(intersection.leftSpanId) ?? []),
                    intersection.leftT,
                ]);
                cutParameters.set(intersection.rightSpanId, [
                    ...(cutParameters.get(intersection.rightSpanId) ?? []),
                    intersection.rightT,
                ]);
            }
        }
    }

    if (cutParameters.size === 0) {
        return { changed: false, spans: [...spans] };
    }

    return {
        changed: true,
        spans: spans.flatMap(span => splitSpanAtParameters(span, cutParameters.get(span.id) ?? [])),
    };
};

const splitAllConstraintViolations = (
    spans: readonly Span[],
    options: FitterOptions
): { changed: boolean; spans: Span[] } => {
    let changed = false;
    const maxTurnAngle = degreesToRadians(options.maxTurnAngleDeg);

    return {
        changed,
        spans: spans.flatMap(span => {
            const maxSegmentLength = span.shape.figure.options.maxSegmentLength;
            const piecesByLength = Math.ceil(spanLength(span) / maxSegmentLength);
            const piecesByTurn = Math.ceil(spanTurnAngle(span) / maxTurnAngle);
            const pieceCount = Math.max(1, piecesByLength, piecesByTurn);

            if (pieceCount <= 1) {
                return [span];
            }

            changed = true;
            return subdivideSpan(span, pieceCount);
        }),
    };
};

export const fitShapesToSpans = (shapes: readonly Shape[], options: FitterOptions): Span[] => {
    let spans = shapes.flatMap(shape => mkspan(shape));

    for (let iteration = 0; iteration < 32; iteration += 1) {
        let changed = false;

        const intersectionPass = splitAllIntersections(spans, options);
        spans = intersectionPass.spans;
        changed ||= intersectionPass.changed;

        const constraintPass = splitAllConstraintViolations(spans, options);
        spans = constraintPass.spans;
        changed ||= constraintPass.changed;

        if (!changed) {
            break;
        }
    }

    return spans;
};
