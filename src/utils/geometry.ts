import type { Point3 } from '../domain/types.js';

export const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Create a point from a polar offset around a center point.
 *
 * Angles are measured counterclockwise from the positive `x` axis:
 * - `0` = east
 * - `90` = north
 * - `180` = west
 * - `270` = south
 *
 * If `y` is omitted, the returned point inherits `center.y`.
 */
export const polarPoint = (
    center: Point3,
    distance: number,
    angleDeg: number,
    y: number | undefined = center.y
): Point3 => {
    const radians = degreesToRadians(angleDeg);
    const point = {
        x: center.x + Math.cos(radians) * distance,
        z: center.z + Math.sin(radians) * distance,
    };

    return y === undefined ? point : { ...point, y };
};
