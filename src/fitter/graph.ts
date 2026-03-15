import type { BuildResult, Flag, NetworkNode, NetworkSegment, Point2, Point3 } from '../domain/types.js';
import { PARAMETER_EPSILON } from '../utils/constants.js';
import { clamp, cross2, dot2, normalize2, point2, point3, scale2, subtract2 } from '../utils/math.js';
import { spanEnd, spanStart } from './spans.js';
import type { CandidateGraph, CandidateNode, CandidateSegment, FitterOptions, Span } from './types.js';

const quantizedKey = (point: Point3, step: number): string => {
    const x = Math.round(point.x / step);
    const z = Math.round(point.z / step);
    const y = point.y === undefined ? 'terrain' : String(Math.round(point.y / step));
    return `${x}:${z}:${y}`;
};

const averageCenter = (nodes: readonly NetworkNode[]): Point3 | undefined => {
    if (nodes.length === 0) {
        return undefined;
    }

    const total = nodes.reduce(
        (accumulator, node) => ({
            x: accumulator.x + node.position.x,
            z: accumulator.z + node.position.z,
            y:
                accumulator.y === undefined || node.position.y === undefined
                    ? undefined
                    : accumulator.y + node.position.y,
        }),
        { x: 0, z: 0, y: 0 as number | undefined }
    );

    return total.y === undefined
        ? { x: total.x / nodes.length, z: total.z / nodes.length }
        : { x: total.x / nodes.length, y: total.y / nodes.length, z: total.z / nodes.length };
};

const controlPointForSpan = (span: Span): Point3 => {
    const start = spanStart(span);
    const end = spanEnd(span);
    const startLength = span.shape.lengthAt(span.t0);
    const endLength = span.shape.lengthAt(span.t1);
    const controlSample = span.shape.pointAt(span.shape.parameterAtLength((startLength + endLength) / 2));
    const startTangent = span.shape.tangentAt(span.t0);
    const endDirection = span.shape.endTangentAt(span.t1);
    const delta = subtract2(point2(end.x, end.z), point2(start.x, start.z));
    const denominator = cross2(startTangent, endDirection);

    if (Math.abs(denominator) <= PARAMETER_EPSILON) {
        return point3((start.x + end.x) / 2, (start.z + end.z) / 2, controlSample.y);
    }

    const startScale = cross2(delta, endDirection) / denominator;
    const offset = scale2(startTangent, startScale);
    return point3(start.x + offset.x, start.z + offset.z, controlSample.y);
};

const nodeFlags = (degree: number, baseFlags: readonly Flag[]): readonly Flag[] => {
    const structural: Flag[] = degree >= 3 ? ['Junction'] : degree === 2 ? ['Middle', 'Moveable', 'OnGround'] : ['End'];
    return Array.from(new Set([...structural, ...baseFlags]));
};

export const nodeDirection = (segment: CandidateSegment, nodeKey: string): Point2 => {
    if (segment.startNodeKey === nodeKey) {
        return normalize2(subtract2(point2(segment.control.x, segment.control.z), point2(segment.start.x, segment.start.z)));
    }

    return normalize2(subtract2(point2(segment.control.x, segment.control.z), point2(segment.end.x, segment.end.z)));
};

export const angleBetweenDirections = (left: Point2, right: Point2): number => {
    return Math.acos(clamp(dot2(left, right), -1, 1));
};

export const buildGraphFromSpans = (spans: readonly Span[], options: FitterOptions): CandidateGraph => {
    const nodeStore = new Map<string, CandidateNode>();

    const getOrCreateNode = (point: Point3, spanId: string): CandidateNode => {
        const key = quantizedKey(point, options.quantizationStep);
        const existing = nodeStore.get(key);
        if (existing !== undefined) {
            existing.incidentSpanIds.push(spanId);
            return existing;
        }

        const created: CandidateNode = {
            key: `node-${nodeStore.size}`,
            position: point,
            incidentSpanIds: [spanId],
        };
        nodeStore.set(key, created);
        return created;
    };

    const candidateSegments: CandidateSegment[] = spans.map((span, index) => {
        const start = spanStart(span);
        const end = spanEnd(span);
        const startNode = getOrCreateNode(start, span.id);
        const endNode = getOrCreateNode(end, span.id);

        return {
            key: `segment-${index}`,
            spanId: span.id,
            startNodeKey: startNode.key,
            endNodeKey: endNode.key,
            start,
            control: controlPointForSpan(span),
            end,
            prefabName: span.shape.figure.options.road.prefabName,
            roadWidth: span.shape.figure.options.road.width,
            sourceFigId: span.shape.figure.id,
        };
    });

    const candidateNodes = Array.from(nodeStore.values());
    const nodes: NetworkNode[] = candidateNodes.map(candidateNode => {
        const sourceSpan = spans.find(span => candidateNode.incidentSpanIds.includes(span.id));
        return {
            key: candidateNode.key,
            position: candidateNode.position,
            prefabName: sourceSpan?.shape.figure.options.road.prefabName ?? 'Gravel Road',
            flags: nodeFlags(candidateNode.incidentSpanIds.length, sourceSpan?.shape.figure.options.road.flags ?? []),
        };
    });

    const segments: NetworkSegment[] = candidateSegments.map(segment => ({
        key: segment.key,
        prefabName: segment.prefabName,
        startNodeKey: segment.startNodeKey,
        endNodeKey: segment.endNodeKey,
        start: segment.start,
        control: segment.control,
        end: segment.end,
        sourceFigId: segment.sourceFigId,
    }));

    return {
        nodes,
        segments,
        candidateNodes,
        candidateSegments,
    };
};

export const buildResultFromGraph = (
    graph: CandidateGraph,
    figures: BuildResult['figs']
): BuildResult => ({
    center: averageCenter(graph.nodes),
    nodes: graph.nodes,
    segments: graph.segments,
    figs: figures,
});
