import type { Shape } from '../geometry/shapes.js';
import { PARAMETER_EPSILON } from '../utils/constants.js';
import { clamp, dot2 } from '../utils/math.js';
import type { Span } from './types.js';

const createSpanIdFactory = (): (() => string) => {
    let nextId = 1;
    return () => `span-${nextId++}`;
};

const nextSpanId = createSpanIdFactory();

const shapeLengthAt = (shape: Shape, parameter: number): number => {
    if (!shape.isClosed) {
        return shape.lengthAt(clamp(parameter, 0, 1));
    }

    const turns = Math.floor(parameter);
    const remainder = parameter - turns;
    return turns * shape.totalLength + shape.lengthAt(remainder);
};

const shapeParameterAtLength = (shape: Shape, length: number): number => {
    if (!shape.isClosed) {
        return shape.parameterAtLength(length);
    }

    const turns = Math.floor(length / shape.totalLength);
    const remainder = length - turns * shape.totalLength;
    return turns + shape.parameterAtLength(remainder);
};

const normalizeParameterForSpan = (span: Span, parameter: number): number => {
    if (!span.shape.isClosed || parameter >= span.t0 - PARAMETER_EPSILON) {
        return parameter;
    }

    return parameter + 1;
};

export const mkspan = (shape: Shape, t0 = 0, t1 = 1): Span => {
    return { id: nextSpanId(), shape, t0, t1 };
};

export const spanStart = (span: Span) => span.shape.pointAt(span.t0);
export const spanEnd = (span: Span) => span.shape.pointAt(span.t1);

export const spanLength = (span: Span): number => {
    return shapeLengthAt(span.shape, span.t1) - shapeLengthAt(span.shape, span.t0);
};

export const spanTurnAngle = (span: Span): number => {
    if (span.shape.figure.kind === 'circle') {
        return Math.PI * 2 * (span.t1 - span.t0);
    }

    const startDirection = span.shape.tangentAt(span.t0);
    const endDirection = span.shape.tangentAt(span.t1);
    const cosine = clamp(dot2(startDirection, endDirection), -1, 1);
    return Math.acos(cosine);
};

export const parameterInsideSpan = (span: Span, parameter: number): number | undefined => {
    const normalized = normalizeParameterForSpan(span, parameter);
    if (normalized <= span.t0 + PARAMETER_EPSILON || normalized >= span.t1 - PARAMETER_EPSILON) {
        return undefined;
    }

    return normalized;
};

export const splitSpanAtParameters = (span: Span, parameters: readonly number[]): Span[] => {
    const cuts = parameters
        .map(parameter => parameterInsideSpan(span, parameter))
        .filter((value): value is number => value !== undefined)
        .sort((left, right) => left - right);

    if (cuts.length === 0) {
        return [span];
    }

    const boundaries = [span.t0, ...cuts, span.t1];
    const spans: Span[] = [];

    for (let index = 0; index < boundaries.length - 1; index += 1) {
        const t0 = boundaries[index];
        const t1 = boundaries[index + 1];
        if (t0 === undefined || t1 === undefined || t1 - t0 <= PARAMETER_EPSILON) {
            continue;
        }

        spans.push(mkspan(span.shape, t0, t1));
    }

    return spans;
};

export const subdivideSpan = (span: Span, pieceCount: number): Span[] => {
    if (pieceCount <= 1) {
        return [span];
    }

    const startLength = shapeLengthAt(span.shape, span.t0);
    const totalLength = spanLength(span);

    return Array.from({ length: pieceCount }, (_, pieceIndex) => {
        const pieceStartLength = startLength + (totalLength * pieceIndex) / pieceCount;
        const pieceEndLength = startLength + (totalLength * (pieceIndex + 1)) / pieceCount;
        return {
            id: nextSpanId(),
            shape: span.shape,
            t0: shapeParameterAtLength(span.shape, pieceStartLength),
            t1: shapeParameterAtLength(span.shape, pieceEndLength),
        };
    });
};
