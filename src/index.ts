/** Create a new SCL authoring canvas. */
export { createCanvas } from './api/index.js';
/** Compile resolved network IR into Move It selection XML. */
export { compileToMoveIt } from './compiler/moveit/index.js';
export type { CompileToMoveItOptions } from './compiler/moveit/index.js';
export type {
    ArchimedeanSpiralRoadInput,
    BuildResult,
    Canvas,
    CanvasOptions,
    CircleRoadInput,
    LineRoadInput,
    NetworkNode,
    NetworkSegment,
    Point2,
    Point3,
    RayRoadInput,
    Figure,
    RoadStyle,
} from './domain/types.js';
/** Convenience helper for building polar coordinates on the `x`/`z` plane. */
export { polarPoint } from './utils/geometry.js';
