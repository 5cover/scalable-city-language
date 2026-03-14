import type { Point2, Point3 } from '../domain/types.js';
import { PARAMETER_EPSILON, POSITION_EPSILON } from './constants.js';

export const clamp = (value: number, min: number, max: number): number => {
    return Math.min(max, Math.max(min, value));
};

export const nearlyEqual = (left: number, right: number, epsilon = POSITION_EPSILON): boolean => {
    return Math.abs(left - right) <= epsilon;
};

export const lerp = (start: number, end: number, t: number): number => {
    return start + (end - start) * t;
};

export const lerpOptional = (start: number | undefined, end: number | undefined, t: number): number | undefined => {
    if (start === undefined || end === undefined) {
        return undefined;
    }

    return lerp(start, end, t);
};

export const point2 = (x: number, z: number): Point2 => ({ x, z });

export const point3 = (x: number, z: number, y: number | undefined): Point3 => {
    return y === undefined ? { x, z } : { x, y, z };
};

export const subtract2 = (left: Point2, right: Point2): Point2 => point2(left.x - right.x, left.z - right.z);
export const scale2 = (value: Point2, scalar: number): Point2 => point2(value.x * scalar, value.z * scalar);
export const add2 = (left: Point2, right: Point2): Point2 => point2(left.x + right.x, left.z + right.z);
export const dot2 = (left: Point2, right: Point2): number => left.x * right.x + left.z * right.z;
export const cross2 = (left: Point2, right: Point2): number => left.x * right.z - left.z * right.x;
export const length2 = (value: Point2): number => Math.hypot(value.x, value.z);
export const distance2 = (left: Point2, right: Point2): number => length2(subtract2(left, right));

export const normalize2 = (value: Point2): Point2 => {
    const length = length2(value);
    return length <= POSITION_EPSILON ? point2(0, 0) : scale2(value, 1 / length);
};

export const negate2 = (value: Point2): Point2 => point2(-value.x, -value.z);

export const positionKey = (point: Point3): string => {
    const x = Math.round(point.x / POSITION_EPSILON);
    const z = Math.round(point.z / POSITION_EPSILON);
    const y = point.y === undefined ? 'terrain' : String(Math.round(point.y / POSITION_EPSILON));

    return `${x}:${z}:${y}`;
};

export const wrapClosedParam = (value: number): number => {
    const wrapped = ((value % 1) + 1) % 1;
    return wrapped >= 1 - PARAMETER_EPSILON ? 0 : wrapped;
};
