export interface Point2 {
  readonly x: number;
  readonly z: number;
}

export interface Point3 extends Point2 {
  readonly y?: number;
}

export interface RoadStyleInput {
  readonly prefabName?: string;
  readonly flags?: string;
  readonly junctionFlags?: string;
}

export interface ResolvedRoadStyle {
  readonly prefabName: string;
  readonly flags: string;
  readonly junctionFlags: string;
}

export interface CanvasOptions {
  readonly maxSegmentLength?: number;
  readonly defaultRoad?: RoadStyleInput;
}

export interface ShapeBaseInput {
  readonly road?: RoadStyleInput;
  readonly maxSegmentLength?: number;
}

export interface LineRoadInput extends ShapeBaseInput {
  readonly start: Point3;
  readonly end: Point3;
}

export interface RayRoadInput extends ShapeBaseInput {
  readonly start: Point3;
  readonly angleDeg: number;
  readonly length: number;
  readonly endY?: number;
}

export interface CircleRoadInput extends ShapeBaseInput {
  readonly center: Point3;
  readonly radius: number;
}

export interface ArchimedeanSpiralRoadInput extends ShapeBaseInput {
  readonly center: Point3;
  readonly startRadius: number;
  readonly pitch: number;
  readonly direction?: RotationDirection;
  readonly startAngleDeg?: number;
  readonly arcLength: number;
}

export type RotationDirection = 'clockwise' | 'counterclockwise';

export type ShapeId = `shape-${number}`;

export interface LineRoadShape {
  readonly id: ShapeId;
  readonly kind: 'line';
  readonly start: Point3;
  readonly end: Point3;
  readonly road: ResolvedRoadStyle;
  readonly maxSegmentLength?: number;
}

export interface CircleRoadShape {
  readonly id: ShapeId;
  readonly kind: 'circle';
  readonly center: Point3;
  readonly radius: number;
  readonly road: ResolvedRoadStyle;
  readonly maxSegmentLength?: number;
}

export interface SpiralRoadShape {
  readonly id: ShapeId;
  readonly kind: 'spiral';
  readonly center: Point3;
  readonly startRadius: number;
  readonly pitch: number;
  readonly direction: RotationDirection;
  readonly startAngleDeg: number;
  readonly arcLength: number;
  readonly road: ResolvedRoadStyle;
  readonly maxSegmentLength?: number;
}

export type RoadShape = LineRoadShape | CircleRoadShape | SpiralRoadShape;

export interface BuildSettings {
  readonly maxSegmentLength: number;
  readonly shapes: readonly RoadShape[];
}

export interface NetworkNode {
  readonly key: string;
  readonly position: Point3;
  readonly prefabName: string;
  readonly flags: string;
}

export interface NetworkSegment {
  readonly key: string;
  readonly prefabName: string;
  readonly startNodeKey: string;
  readonly endNodeKey: string;
  readonly start: Point3;
  readonly end: Point3;
  readonly midpoint: Point3;
  readonly startDirection: Point2;
  readonly endDirection: Point2;
  readonly sourceShapeId: ShapeId;
}

export interface BuildResult {
  readonly center: Point3 | undefined;
  readonly nodes: readonly NetworkNode[];
  readonly segments: readonly NetworkSegment[];
  readonly shapes: readonly RoadShape[];
}

export interface Canvas {
  addLineRoad(input: LineRoadInput): ShapeId;
  addRayRoad(input: RayRoadInput): ShapeId;
  addCircleRoad(input: CircleRoadInput): ShapeId;
  addArchimedeanSpiralRoad(input: ArchimedeanSpiralRoadInput): ShapeId;
  listShapes(): readonly RoadShape[];
  build(): BuildResult;
}
