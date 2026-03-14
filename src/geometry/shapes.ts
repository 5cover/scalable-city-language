import type { CircleRoadFigure, LineRoadFigure, Point2, Point3, Figure, SpiralRoadFigure } from '../domain/types.js';
import { invariant } from '../utils/assert.js';
import { MAX_ROOT_ITERATIONS, PARAMETER_EPSILON, POSITION_EPSILON } from '../utils/constants.js';
import { degreesToRadians } from '../utils/geometry.js';
import { clamp, lerpOptional, normalize2, point2, point3 } from '../utils/math.js';

export interface Shape<T extends Figure = Figure> {
    readonly figure: T;
    readonly isClosed: boolean;
    readonly totalLength: number;
    pointAt(t: number): Point3;
    tangentAt(t: number): Point2;
    lengthAt(t: number): number;
    parameterAtLength(length: number): number;
}

const spiralArcLengthPrimitive = (startRadius: number, radialStep: number, theta: number): number => {
    const u = startRadius + radialStep * theta;
    const root = Math.hypot(u, radialStep);

    return (u * root + radialStep * radialStep * Math.log(u + root)) / (2 * radialStep);
};

const createLineShape = (figure: LineRoadFigure): Shape => {
    const deltaX = figure.end.x - figure.start.x;
    const deltaZ = figure.end.z - figure.start.z;
    const totalLength = Math.hypot(deltaX, deltaZ);

    invariant(totalLength > POSITION_EPSILON, `Line road ${figure.id} must have non-zero length.`);

    return {
        figure,
        isClosed: false,
        totalLength,
        pointAt(t): Point3 {
            const clamped = clamp(t, 0, 1);
            if (clamped <= PARAMETER_EPSILON) {
                return figure.start;
            }
            if (clamped >= 1 - PARAMETER_EPSILON) {
                return figure.end;
            }

            return point3(
                figure.start.x + deltaX * clamped,
                figure.start.z + deltaZ * clamped,
                lerpOptional(figure.start.y, figure.end.y, clamped)
            );
        },
        tangentAt(): Point2 {
            return normalize2(point2(deltaX, deltaZ));
        },
        lengthAt(t): number {
            return totalLength * clamp(t, 0, 1);
        },
        parameterAtLength(length): number {
            return clamp(length / totalLength, 0, 1);
        },
    };
};

const createCircleShape = (figure: CircleRoadFigure): Shape => {
    invariant(figure.radius > POSITION_EPSILON, `Circle road ${figure.id} must have a positive radius.`);

    const totalLength = 2 * Math.PI * figure.radius;

    return {
        figure,
        isClosed: true,
        totalLength,
        pointAt(t): Point3 {
            const wrapped = ((t % 1) + 1) % 1;
            const angle = wrapped * Math.PI * 2;

            return point3(
                figure.center.x + Math.cos(angle) * figure.radius,
                figure.center.z + Math.sin(angle) * figure.radius,
                figure.center.y
            );
        },
        tangentAt(t): Point2 {
            const wrapped = ((t % 1) + 1) % 1;
            const angle = wrapped * Math.PI * 2;
            return normalize2(point2(-Math.sin(angle), Math.cos(angle)));
        },
        lengthAt(t): number {
            const wrapped = ((t % 1) + 1) % 1;
            return wrapped * totalLength;
        },
        parameterAtLength(length): number {
            return (((length / totalLength) % 1) + 1) % 1;
        },
    };
};

const createSpiralShape = (figure: SpiralRoadFigure): Shape => {
    invariant(figure.startRadius >= 0, `Spiral road ${figure.id} must have a non-negative start radius.`);
    invariant(figure.pitch > POSITION_EPSILON, `Spiral road ${figure.id} must have a positive pitch.`);
    invariant(figure.arcLength > POSITION_EPSILON, `Spiral road ${figure.id} must have a positive arc length.`);

    const startAngle = degreesToRadians(figure.startAngleDeg);
    const directionSign = figure.direction === 'clockwise' ? -1 : 1;
    const radialStep = figure.pitch / (2 * Math.PI);
    const startArc = spiralArcLengthPrimitive(figure.startRadius, radialStep, 0);

    const solveThetaForLength = (targetLength: number): number => {
        let low = 0;
        let high = Math.max(targetLength / Math.max(figure.startRadius, radialStep), 1);

        while (spiralArcLengthPrimitive(figure.startRadius, radialStep, high) - startArc < targetLength) {
            high *= 2;
        }

        for (let iteration = 0; iteration < MAX_ROOT_ITERATIONS; iteration += 1) {
            const mid = (low + high) / 2;
            const length = spiralArcLengthPrimitive(figure.startRadius, radialStep, mid) - startArc;

            if (Math.abs(length - targetLength) <= POSITION_EPSILON) {
                return mid;
            }

            if (length < targetLength) {
                low = mid;
            } else {
                high = mid;
            }
        }

        return (low + high) / 2;
    };

    const totalTheta = solveThetaForLength(figure.arcLength);

    const pointAndDerivativeAt = (t: number): { point: Point3; derivative: Point2 } => {
        const clamped = clamp(t, 0, 1);
        const thetaTravel = totalTheta * clamped;
        const radius = figure.startRadius + radialStep * thetaTravel;
        const angle = startAngle + directionSign * thetaTravel;
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);

        return {
            point: point3(figure.center.x + cosAngle * radius, figure.center.z + sinAngle * radius, figure.center.y),
            derivative: point2(
                radialStep * cosAngle - directionSign * radius * sinAngle,
                radialStep * sinAngle + directionSign * radius * cosAngle
            ),
        };
    };

    return {
        figure,
        isClosed: false,
        totalLength: figure.arcLength,
        pointAt(t): Point3 {
            return pointAndDerivativeAt(t).point;
        },
        tangentAt(t): Point2 {
            return normalize2(pointAndDerivativeAt(t).derivative);
        },
        lengthAt(t): number {
            const theta = totalTheta * clamp(t, 0, 1);
            return spiralArcLengthPrimitive(figure.startRadius, radialStep, theta) - startArc;
        },
        parameterAtLength(length): number {
            const clampedLength = clamp(length, 0, figure.arcLength);
            const theta = solveThetaForLength(clampedLength);
            return theta / totalTheta;
        },
    };
};

export const createShape = (figure: Figure): Shape => {
    switch (figure.kind) {
        case 'line':
            return createLineShape(figure);
        case 'circle':
            return createCircleShape(figure);
        case 'spiral':
            return createSpiralShape(figure);
    }
};
