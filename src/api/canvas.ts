import { buildNetwork } from '../domain/build.js';
import type {
    ArchimedeanSpiralRoadInput,
    BuildResult,
    Canvas,
    CanvasOptions,
    CircleRoadInput,
    CircleRoadFigure,
    LineRoadInput,
    LineRoadFigure,
    RayRoadInput,
    RoadStyle,
    Figure,
    SpiralRoadFigure,
} from '../domain/types.js';
import { DEFAULT_JUNCTION_FLAGS, DEFAULT_MAX_SEGMENT_LENGTH } from '../utils/constants.js';
import { polarPoint } from '../utils/geometry.js';

const createFigIdFactory = (): (() => number) => {
    let nextId = 1;

    return () => nextId++;
};

const resolveRoadStyle = (
    defaults: CanvasOptions['defaultRoad'] | undefined,
    overrides: CircleRoadInput['road'] | undefined
): RoadStyle => {
    const prefabName = overrides?.prefabName ?? defaults?.prefabName ?? 'Gravel Road';
    const flags = overrides?.flags ?? defaults?.flags ?? 'Created End Moveable OnGround OneWayOut OneWayIn';
    const junctionFlags = overrides?.junctionFlags ?? defaults?.junctionFlags ?? DEFAULT_JUNCTION_FLAGS;

    return {
        prefabName,
        flags,
        junctionFlags,
    };
};

const createCanvas = (options: CanvasOptions = {}): Canvas => {
    const figures: Figure[] = [];
    const nextFigId = createFigIdFactory();
    const canvasDefaults = {
        maxSegmentLength: options.maxSegmentLength ?? DEFAULT_MAX_SEGMENT_LENGTH,
        defaultRoad: resolveRoadStyle(options.defaultRoad, undefined),
    };

    const addFigure = <TFig extends Figure>(
        figure: Omit<TFig, 'id' | 'road'>,
        road: CircleRoadInput['road']
    ): number => {
        const id = nextFigId();
        const resolvedFig = {
            ...figure,
            id,
            road: resolveRoadStyle(canvasDefaults.defaultRoad, road),
        } as TFig;

        figures.push(resolvedFig);

        return id;
    };

    const withOptionalMaxSegmentLength = <TFig extends { readonly maxSegmentLength?: number }>(
        figure: TFig,
        maxSegmentLength: number | undefined
    ): TFig => {
        return maxSegmentLength === undefined ? figure : { ...figure, maxSegmentLength };
    };

    return {
        addLineRoad(input: LineRoadInput): number {
            return addFigure(
                withOptionalMaxSegmentLength<Omit<LineRoadFigure, 'id' | 'road'>>(
                    {
                        kind: 'line',
                        start: input.start,
                        end: input.end,
                    },
                    input.maxSegmentLength
                ),
                input.road
            );
        },
        addRayRoad(input: RayRoadInput): number {
            return addFigure(
                withOptionalMaxSegmentLength<Omit<LineRoadFigure, 'id' | 'road'>>(
                    {
                        kind: 'line',
                        start: input.start,
                        end: polarPoint(input.start, input.length, input.angleDeg, input.endY),
                    },
                    input.maxSegmentLength
                ),
                input.road
            );
        },
        addCircleRoad(input: CircleRoadInput): number {
            return addFigure(
                withOptionalMaxSegmentLength<Omit<CircleRoadFigure, 'id' | 'road'>>(
                    {
                        kind: 'circle',
                        center: input.center,
                        radius: input.radius,
                    },
                    input.maxSegmentLength
                ),
                input.road
            );
        },
        addArchimedeanSpiralRoad(input: ArchimedeanSpiralRoadInput): number {
            return addFigure(
                withOptionalMaxSegmentLength<Omit<SpiralRoadFigure, 'id' | 'road'>>(
                    {
                        kind: 'spiral',
                        center: input.center,
                        startRadius: input.startRadius,
                        pitch: input.pitch,
                        direction: input.direction ?? 'counterclockwise',
                        startAngleDeg: input.startAngleDeg ?? 0,
                        arcLength: input.arcLength,
                    },
                    input.maxSegmentLength
                ),
                input.road
            );
        },
        get figures(): readonly Figure[] {
            return figures;
        },
        build(): BuildResult {
            return buildNetwork({
                maxSegmentLength: canvasDefaults.maxSegmentLength,
                figures,
            });
        },
    };
};

export { createCanvas };
