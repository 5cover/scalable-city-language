export interface Point2 {
    readonly x: number;
    readonly z: number;
}

export interface Point3 extends Point2 {
    readonly y?: number | undefined;
}

export interface RoadStyleInput {
    readonly prefabName?: string;
    readonly flags?: string;
    readonly junctionFlags?: string;
}

export interface RoadStyle {
    readonly prefabName: string;
    readonly flags: string;
    readonly junctionFlags: string;
}

export interface CanvasOptions {
    readonly maxSegmentLength?: number;
    readonly defaultRoad?: RoadStyleInput;
}

interface RoadFigureInputBase {
    readonly road?: RoadStyleInput;
    readonly maxSegmentLength?: number;
}

export interface LineRoadInput extends RoadFigureInputBase {
    readonly start: Point3;
    readonly end: Point3;
}

export interface RayRoadInput extends RoadFigureInputBase {
    readonly start: Point3;
    readonly angleDeg: number;
    readonly length: number;
    readonly endY?: number;
}

export interface CircleRoadInput extends RoadFigureInputBase {
    readonly center: Point3;
    readonly radius: number;
}

export interface ArchimedeanSpiralRoadInput extends RoadFigureInputBase {
    readonly center: Point3;
    readonly startRadius: number;
    readonly pitch: number;
    readonly direction?: RotationDirection;
    readonly startAngleDeg?: number;
    readonly arcLength: number;
}

export type RotationDirection = 'clockwise' | 'counterclockwise';

interface FigureBase<Kind extends string> {
    readonly id: number;
    readonly kind: Kind;
}

export interface LineRoadFigure extends FigureBase<'line'> {
    readonly start: Point3;
    readonly end: Point3;
    readonly road: RoadStyle;
    readonly maxSegmentLength?: number;
}

export interface CircleRoadFigure extends FigureBase<'circle'> {
    readonly center: Point3;
    readonly radius: number;
    readonly road: RoadStyle;
    readonly maxSegmentLength?: number;
}

export interface SpiralRoadFigure extends FigureBase<'spiral'> {
    readonly center: Point3;
    readonly startRadius: number;
    readonly pitch: number;
    readonly direction: RotationDirection;
    readonly startAngleDeg: number;
    readonly arcLength: number;
    readonly road: RoadStyle;
    readonly maxSegmentLength?: number;
}

export type Figure = LineRoadFigure | CircleRoadFigure | SpiralRoadFigure;

export interface BuildSettings {
    readonly maxSegmentLength: number;
    readonly figures: readonly Figure[];
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
    readonly sourceFigId: number;
}

export interface BuildResult {
    readonly center: Point3 | undefined;
    readonly nodes: readonly NetworkNode[];
    readonly segments: readonly NetworkSegment[];
    readonly figs: readonly Figure[];
}

export interface Canvas {
    addLineRoad(input: LineRoadInput): number;
    addRayRoad(input: RayRoadInput): number;
    addCircleRoad(input: CircleRoadInput): number;
    addArchimedeanSpiralRoad(input: ArchimedeanSpiralRoadInput): number;
    get figures(): readonly Figure[];
    build(): BuildResult;
}
