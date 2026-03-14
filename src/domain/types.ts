/**
 * A 2D point in Cities: Skylines ground-plane coordinates.
 *
 * `x` runs east-west and `z` runs north-south.
 */
export interface Point2 {
    /** East-west position in meters. Positive values move east. */
    readonly x: number;
    /** North-south position in meters. Positive values move north. */
    readonly z: number;
}

/**
 * A 2.5D point used by SCL authoring and export.
 *
 * When `y` is omitted, the generated Move It XML omits `<y>` so the game can
 * snap that point to terrain height.
 */
export interface Point3 extends Point2 {
    /** Optional elevation in meters above the map origin. */
    readonly y?: number | undefined;
}

/** Supported Move It / network flag tokens used by the public API. */
export type Flag = 'Created' | 'End' | 'Junction' | 'Middle' | 'OnGround' | 'Moveable' | 'OneWayOut' | 'OneWayIn';

/**
 * Default road styling applied to generated nodes and segments.
 *
 * These values correspond directly to Move It export fields.
 */
export interface RoadStyle {
    /** In-game prefab name, for example `"Gravel Road"`. */
    readonly prefabName: string;
    /** Move It / network flag tokens emitted for generated states. */
    readonly flags: readonly Flag[];
}

/**
 * Canvas-level defaults used for all figures unless an individual figure
 * overrides them through `FigureInput.options`.
 */
export interface CanvasOptions {
    /**
     * Maximum generated network segment length in meters.
     *
     * Any longer figure span is automatically subdivided before export.
     */
    readonly maxSegmentLength: number;
    /** Default road styling for figures authored on the canvas. */
    readonly road: RoadStyle;
}

/**
 * Shared optional overrides accepted by every figure input.
 *
 * Use this when one figure needs a different road prefab or segment length than
 * the rest of the canvas.
 */
export interface FigureInput {
    /** Optional per-figure overrides merged onto the canvas defaults. */
    readonly options?: CanvasOptions | undefined;
}

/** Input for a straight road segment between two authored endpoints. */
export interface LineRoadInput extends FigureInput {
    /** Start point of the authored road figure. */
    readonly start: Point3;
    /** End point of the authored road figure. */
    readonly end: Point3;
}

/**
 * Input for a straight road authored as a ray from a start point.
 *
 * SCL converts this into a line internally using `angleDeg` and `length`.
 */
export interface RayRoadInput extends FigureInput {
    /** Ray origin. */
    readonly start: Point3;
    /**
     * Heading in degrees, measured counterclockwise from the positive `x` axis.
     *
     * Examples:
     * - `0` points east
     * - `90` points north
     * - `180` points west
     * - `270` points south
     */
    readonly angleDeg: number;
    /** Ray length in meters from `start` to the computed end point. */
    readonly length: number;
    /**
     * Optional `y` value for the computed end point.
     *
     * If omitted, the end point inherits `start.y`.
     */
    readonly endY?: number;
}

/** Input for a closed circular road centered on `center`. */
export interface CircleRoadInput extends FigureInput {
    /** Circle center in meters. */
    readonly center: Point3;
    /** Circle radius in meters. Must be positive. */
    readonly radius: number;
}

/**
 * Input for an Archimedean spiral road.
 *
 * The spiral follows `r = startRadius + b * theta`, where
 * `b = pitch / (2π)`.
 */
export interface ArchimedeanSpiralRoadInput extends FigureInput {
    /** Spiral center point. */
    readonly center: Point3;
    /**
     * Radius in meters at the start of the spiral (`t = 0`).
     *
     * Use `0` to begin at the center.
     */
    readonly startRadius: number;
    /**
     * Radial growth per full revolution, in meters.
     *
     * Example: `pitch: 80` means the spiral radius increases by 80 meters every
     * time it completes one full turn.
     */
    readonly pitch: number;
    /**
     * Rotation direction from the start angle.
     *
     * Defaults to `'counterclockwise'`.
     */
    readonly direction?: RotationDirection;
    /**
     * Start heading in degrees from the positive `x` axis.
     *
     * `0` starts east of the center, `90` starts north, and so on.
     */
    readonly startAngleDeg?: number;
    /**
     * Total authored spiral path length in meters.
     *
     * This controls how far the spiral extends along its curve, independent of
     * `pitch`.
     */
    readonly arcLength: number;
}

/** Rotation orientation for circular and spiral authoring. */
export type RotationDirection = 'clockwise' | 'counterclockwise';

interface LineRoadFigure {
    readonly start: Point3;
    readonly end: Point3;
}

interface CircleRoadFigure {
    readonly center: Point3;
    readonly radius: number;
}

interface SpiralRoadFigure {
    readonly center: Point3;
    readonly startRadius: number;
    readonly pitch: number;
    readonly direction: RotationDirection;
    readonly startAngleDeg: number;
    readonly arcLength: number;
}

/** Discriminant used internally for concrete figure variants. */
export type FigureKind = keyof FigureParams;

/** Mapping from public figure kinds to their parameter payloads. */
export interface FigureParams {
    line: LineRoadFigure;
    circle: CircleRoadFigure;
    spiral: SpiralRoadFigure;
}

/** Concrete authored figure stored on a canvas after defaults are resolved. */
export interface FigureOf<Kind extends FigureKind> {
    /** Deterministic sequential figure identifier within a canvas. */
    readonly id: number;
    /** Figure kind discriminator. */
    readonly kind: Kind;
    /** Fully resolved options for this specific figure. */
    readonly options: CanvasOptions;
    /** Concrete geometry parameters for the figure kind. */
    readonly params: FigureParams[Kind];
}

type Figures = {
    [K in FigureKind]: FigureOf<K>;
};

/** Public union of every supported authored figure variant. */
export type Figure<K extends FigureKind = FigureKind> = Figures[K];

/** Build-time input consumed by the network resolver. */
export interface BuildSettings {
    /** Canvas-level fallback maximum segment length in meters. */
    readonly maxSegmentLength: number;
    /** Authored figures to resolve into nodes and segments. */
    readonly figures: readonly Figure[];
}

/** A resolved network node produced from endpoints, intersections, or subdivision. */
export interface NetworkNode {
    /** Deterministic internal key used for relationship wiring. */
    readonly key: string;
    /** Node position in world coordinates. */
    readonly position: Point3;
    /** In-game road prefab for the node. */
    readonly prefabName: string;
    /** Move It / network flags emitted for this node. */
    readonly flags: readonly Flag[];
}

/**
 * A resolved network segment represented as a three-point Hermite definition.
 *
 * `control` is the intersection point of the start and end tangent lines and is
 * written to Move It `<position>`.
 */
export interface NetworkSegment {
    /** Deterministic internal key used for relationship wiring. */
    readonly key: string;
    /** In-game road prefab for the segment. */
    readonly prefabName: string;
    /** Key of the segment start node. */
    readonly startNodeKey: string;
    /** Key of the segment end node. */
    readonly endNodeKey: string;
    /** Segment start position (`P0`). */
    readonly start: Point3;
    /** Hermite control point used as Move It `<position>`. */
    readonly control: Point3;
    /** Segment end position (`P1`). */
    readonly end: Point3;
    /** Source authored figure id. */
    readonly sourceFigId: number;
}

/** Resolved network IR ready for inspection or Move It compilation. */
export interface BuildResult {
    /** Average node position used as the exported selection center. */
    readonly center: Point3 | undefined;
    /** Resolved network nodes. */
    readonly nodes: readonly NetworkNode[];
    /** Resolved Hermite segments. */
    readonly segments: readonly NetworkSegment[];
    /** Original authored figures that produced the network. */
    readonly figs: readonly Figure[];
}

/** Public authoring surface for building SCL figure sets. */
export interface Canvas {
    /** Add a straight road figure between two explicit endpoints. */
    addLineRoad(input: LineRoadInput): number;
    /** Add a straight road figure defined by origin, heading, and length. */
    addRayRoad(input: RayRoadInput): number;
    /** Add a closed circular road figure. */
    addCircleRoad(input: CircleRoadInput): number;
    /** Add an Archimedean spiral road figure. */
    addArchimedeanSpiralRoad(input: ArchimedeanSpiralRoadInput): number;
    /** Read the authored figures currently stored on the canvas. */
    get figures(): readonly Figure[];
    /** Resolve all authored figures into the network IR. */
    build(): BuildResult;
}
