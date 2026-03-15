import type { BuildResult, Figure } from '../domain/types.js';
import { createShape } from '../geometry/shapes.js';
import {
    DEFAULT_MAX_NODE_DEGREE,
    DEFAULT_MAX_TURN_ANGLE_DEG,
    DEFAULT_MIN_INTERSECTION_ANGLE_DEG,
    DEFAULT_QUANTIZATION_STEP,
} from '../utils/constants.js';
import { buildGraphFromSpans, buildResultFromGraph } from './graph.js';
import { fitShapesToSpans } from './refine.js';
import type { FitterOptions } from './types.js';
import { validateGraph } from './validate.js';

const defaultFitterOptions: FitterOptions = {
    maxTurnAngleDeg: DEFAULT_MAX_TURN_ANGLE_DEG,
    maxNodeDegree: DEFAULT_MAX_NODE_DEGREE,
    minIntersectionAngleDeg: DEFAULT_MIN_INTERSECTION_ANGLE_DEG,
    quantizationStep: DEFAULT_QUANTIZATION_STEP,
};

export const fitFiguresToNetwork = (figures: readonly Figure[], options: FitterOptions = defaultFitterOptions): BuildResult => {
    const shapes = figures.map(createShape);
    const spans = fitShapesToSpans(shapes, options);
    const graph = buildGraphFromSpans(spans, options);
    const validation = validateGraph(graph, options);

    if (validation.errors.length > 0) {
        throw new Error(validation.errors.map(issue => issue.message).join('\n'));
    }

    return buildResultFromGraph(graph, figures);
};
