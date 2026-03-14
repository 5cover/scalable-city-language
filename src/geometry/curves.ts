import type { Point2, Point3, RoadShape } from '../domain/types.js';
import { MAX_ROOT_ITERATIONS, PARAMETER_EPSILON, POSITION_EPSILON } from '../utils/constants.js';
import { invariant } from '../utils/assert.js';
import { clamp, lerpOptional, normalize2, point2, point3 } from '../utils/math.js';
import { degreesToRadians } from '../utils/geometry.js';

interface CurveAdapter {
  readonly shape: RoadShape;
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

const createLineCurve = (shape: Extract<RoadShape, { kind: 'line' }>): CurveAdapter => {
  const deltaX = shape.end.x - shape.start.x;
  const deltaZ = shape.end.z - shape.start.z;
  const totalLength = Math.hypot(deltaX, deltaZ);

  invariant(totalLength > POSITION_EPSILON, `Line road ${shape.id} must have non-zero length.`);

  return {
    shape,
    isClosed: false,
    totalLength,
    pointAt(t): Point3 {
      const clamped = clamp(t, 0, 1);
      if (clamped <= PARAMETER_EPSILON) {
        return shape.start;
      }
      if (clamped >= 1 - PARAMETER_EPSILON) {
        return shape.end;
      }

      return point3(
        shape.start.x + deltaX * clamped,
        shape.start.z + deltaZ * clamped,
        lerpOptional(shape.start.y, shape.end.y, clamped)
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
    }
  };
};

const createCircleCurve = (shape: Extract<RoadShape, { kind: 'circle' }>): CurveAdapter => {
  invariant(shape.radius > POSITION_EPSILON, `Circle road ${shape.id} must have a positive radius.`);

  const totalLength = 2 * Math.PI * shape.radius;

  return {
    shape,
    isClosed: true,
    totalLength,
    pointAt(t): Point3 {
      const wrapped = ((t % 1) + 1) % 1;
      const angle = wrapped * Math.PI * 2;

      return point3(
        shape.center.x + Math.cos(angle) * shape.radius,
        shape.center.z + Math.sin(angle) * shape.radius,
        shape.center.y
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
      return ((length / totalLength) % 1 + 1) % 1;
    }
  };
};

const createSpiralCurve = (shape: Extract<RoadShape, { kind: 'spiral' }>): CurveAdapter => {
  invariant(shape.startRadius >= 0, `Spiral road ${shape.id} must have a non-negative start radius.`);
  invariant(shape.pitch > POSITION_EPSILON, `Spiral road ${shape.id} must have a positive pitch.`);
  invariant(shape.arcLength > POSITION_EPSILON, `Spiral road ${shape.id} must have a positive arc length.`);

  const startAngle = degreesToRadians(shape.startAngleDeg);
  const directionSign = shape.direction === 'clockwise' ? -1 : 1;
  const radialStep = shape.pitch / (2 * Math.PI);
  const startArc = spiralArcLengthPrimitive(shape.startRadius, radialStep, 0);

  const solveThetaForLength = (targetLength: number): number => {
    let low = 0;
    let high = Math.max(targetLength / Math.max(shape.startRadius, radialStep), 1);

    while (
      spiralArcLengthPrimitive(shape.startRadius, radialStep, high) - startArc <
      targetLength
    ) {
      high *= 2;
    }

    for (let iteration = 0; iteration < MAX_ROOT_ITERATIONS; iteration += 1) {
      const mid = (low + high) / 2;
      const length = spiralArcLengthPrimitive(shape.startRadius, radialStep, mid) - startArc;

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

  const totalTheta = solveThetaForLength(shape.arcLength);

  const pointAndDerivativeAt = (t: number): { point: Point3; derivative: Point2 } => {
    const clamped = clamp(t, 0, 1);
    const thetaTravel = totalTheta * clamped;
    const radius = shape.startRadius + radialStep * thetaTravel;
    const angle = startAngle + directionSign * thetaTravel;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);

    return {
      point: point3(
        shape.center.x + cosAngle * radius,
        shape.center.z + sinAngle * radius,
        shape.center.y
      ),
      derivative: point2(
        radialStep * cosAngle - directionSign * radius * sinAngle,
        radialStep * sinAngle + directionSign * radius * cosAngle
      )
    };
  };

  return {
    shape,
    isClosed: false,
    totalLength: shape.arcLength,
    pointAt(t): Point3 {
      return pointAndDerivativeAt(t).point;
    },
    tangentAt(t): Point2 {
      return normalize2(pointAndDerivativeAt(t).derivative);
    },
    lengthAt(t): number {
      return shape.arcLength * clamp(t, 0, 1);
    },
    parameterAtLength(length): number {
      const clampedLength = clamp(length, 0, shape.arcLength);
      const theta = solveThetaForLength(clampedLength);
      return theta / totalTheta;
    }
  };
};

const createCurve = (shape: RoadShape): CurveAdapter => {
  switch (shape.kind) {
    case 'line':
      return createLineCurve(shape);
    case 'circle':
      return createCircleCurve(shape);
    case 'spiral':
      return createSpiralCurve(shape);
  }
};

export type { CurveAdapter };
export { createCurve };
