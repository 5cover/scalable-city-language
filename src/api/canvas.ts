import { buildNetwork } from '../domain/build.js';
import type {
    ArchimedeanSpiralRoadInput,
    Canvas,
    CanvasOptions,
    CircleRoadInput,
    LineRoadInput,
    RayRoadInput,
    Figure,
    FigureKind,
    FigureParams,
    FigureInput,
    FigureOf,
} from '../domain/types.js';
import { DEFAULT_MAX_SEGMENT_LENGTH } from '../utils/constants.js';
import { polarPoint } from '../utils/geometry.js';
import type { DeepPartial } from '../utils/types.js';

const createFigIdFactory = (): (() => number) => {
    let nextId = 1;

    return () => nextId++;
};

const resolveOptions = (options: DeepPartial<CanvasOptions> | undefined, defaults: CanvasOptions): CanvasOptions =>
    options === undefined
        ? defaults
        : {
              maxSegmentLength: options.maxSegmentLength ?? defaults.maxSegmentLength,
              road: {
                  prefabName: options.road?.prefabName ?? defaults.road.prefabName,
                  flags: options.road?.flags ?? defaults.road.flags,
              },
          };

const apiDefaults: CanvasOptions = {
    maxSegmentLength: DEFAULT_MAX_SEGMENT_LENGTH,
    road: {
        prefabName: 'Gravel Road',
        flags: ['Created'],
    },
};

/**
 * Create a new SCL authoring canvas.
 *
 * The canvas stores declarative figures and resolves them into network IR only
 * when `build()` is called.
 */
export const createCanvas = (options?: DeepPartial<CanvasOptions>): Canvas => {
    const figures: Figure[] = [];
    const nextFigId = createFigIdFactory();
    const canvasDefaults = resolveOptions(options, apiDefaults);
    const addFigure = <Kind extends FigureKind>(input: FigureInput, kind: Kind, params: FigureParams[Kind]): number => {
        const id = nextFigId();
        figures.push({
            id,
            kind: kind,
            options: resolveOptions(input.options, canvasDefaults),
            params: params,
        } satisfies FigureOf<Kind> as Figure); // todo: remove this as
        return id;
    };

    return {
        addLineRoad(input: LineRoadInput) {
            return addFigure(input, 'line', {
                start: input.start,
                end: input.end,
            });
        },
        addRayRoad(input: RayRoadInput) {
            return addFigure(input, 'line', {
                start: input.start,
                end: polarPoint(input.start, input.length, input.angleDeg, input.endY),
            });
        },
        addCircleRoad(input: CircleRoadInput) {
            return addFigure(input, 'circle', {
                center: input.center,
                radius: input.radius,
            });
        },
        addArchimedeanSpiralRoad(input: ArchimedeanSpiralRoadInput) {
            return addFigure(input, 'spiral', {
                center: input.center,
                startRadius: input.startRadius,
                pitch: input.pitch,
                direction: input.direction ?? 'counterclockwise',
                startAngleDeg: input.startAngleDeg ?? 0,
                arcLength: input.arcLength,
            });
        },
        get figures() {
            return figures;
        },
        build() {
            return buildNetwork({
                figures,
            });
        },
    };
};
