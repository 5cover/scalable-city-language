import { degreesToRadians } from '../utils/geometry.js';
import { clamp, distance2, dot2, point2, subtract2 } from '../utils/math.js';
import { angleBetweenDirections, nodeDirection } from './graph.js';
import type { CandidateGraph, FitterIssue, FitterOptions, ValidationResult } from './types.js';

const segmentChordLength = (segment: CandidateGraph['candidateSegments'][number]): number => {
    return Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z);
};

const pointToSegmentDistance = (point: { x: number; z: number }, start: { x: number; z: number }, end: { x: number; z: number }): number => {
    const segment = subtract2(point2(end.x, end.z), point2(start.x, start.z));
    const segmentLengthSquared = dot2(segment, segment);

    if (segmentLengthSquared === 0) {
        return distance2(point2(point.x, point.z), point2(start.x, start.z));
    }

    const projection = clamp(
        dot2(subtract2(point2(point.x, point.z), point2(start.x, start.z)), segment) / segmentLengthSquared,
        0,
        1
    );
    const projected = point2(start.x + segment.x * projection, start.z + segment.z * projection);
    return distance2(point2(point.x, point.z), projected);
};

const segmentDistance = (
    left: CandidateGraph['candidateSegments'][number],
    right: CandidateGraph['candidateSegments'][number]
): number => {
    return Math.min(
        pointToSegmentDistance(left.start, right.start, right.end),
        pointToSegmentDistance(left.end, right.start, right.end),
        pointToSegmentDistance(right.start, left.start, left.end),
        pointToSegmentDistance(right.end, left.start, left.end)
    );
};

const controlDistanceFromChord = (segment: CandidateGraph['candidateSegments'][number]): number => {
    const numerator = Math.abs(
        (segment.end.z - segment.start.z) * segment.control.x -
            (segment.end.x - segment.start.x) * segment.control.z +
            segment.end.x * segment.start.z -
            segment.end.z * segment.start.x
    );
    const denominator = Math.hypot(segment.end.z - segment.start.z, segment.end.x - segment.start.x);
    return denominator === 0 ? 0 : numerator / denominator;
};

const isStraightLike = (segment: CandidateGraph['candidateSegments'][number]): boolean => {
    return controlDistanceFromChord(segment) <= 0.01;
};

const validateMinSegmentLength = (graph: CandidateGraph): FitterIssue[] => {
    return graph.candidateSegments.flatMap(segment => {
        const minimumLength = segment.roadWidth * 0.5 + 4;
        if (segmentChordLength(segment) >= minimumLength) {
            return [];
        }

        return [
            {
                code: 'min-segment-length',
                message: `Segment ${segment.key} is shorter than the minimum length (${minimumLength.toFixed(2)}m).`,
            },
        ];
    });
};

const validateMaxNodeDegree = (graph: CandidateGraph, options: FitterOptions): FitterIssue[] => {
    return graph.candidateNodes.flatMap(node =>
        node.incidentSpanIds.length <= options.maxNodeDegree
            ? []
            : [
                  {
                      code: 'max-node-degree',
                      message: `Node ${node.key} exceeds the maximum degree of ${options.maxNodeDegree}.`,
                  },
              ]
    );
};

const validateMinIntersectionAngle = (graph: CandidateGraph, options: FitterOptions): FitterIssue[] => {
    const minimumAngle = degreesToRadians(options.minIntersectionAngleDeg);
    const issues: FitterIssue[] = [];

    for (const node of graph.candidateNodes) {
        const incidentSegments = graph.candidateSegments.filter(
            segment => segment.startNodeKey === node.key || segment.endNodeKey === node.key
        );

        for (let leftIndex = 0; leftIndex < incidentSegments.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < incidentSegments.length; rightIndex += 1) {
                const left = incidentSegments[leftIndex];
                const right = incidentSegments[rightIndex];
                if (left === undefined || right === undefined) {
                    continue;
                }

                const angle = angleBetweenDirections(nodeDirection(left, node.key), nodeDirection(right, node.key));
                if (angle < minimumAngle) {
                    issues.push({
                        code: 'min-intersection-angle',
                        message: `Node ${node.key} has an incident angle below ${options.minIntersectionAngleDeg} degrees.`,
                    });
                }
            }
        }
    }

    return issues;
};

const validateRoadClearance = (graph: CandidateGraph): FitterIssue[] => {
    const issues: FitterIssue[] = [];

    for (let leftIndex = 0; leftIndex < graph.candidateSegments.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < graph.candidateSegments.length; rightIndex += 1) {
            const left = graph.candidateSegments[leftIndex];
            const right = graph.candidateSegments[rightIndex];
            if (left === undefined || right === undefined) {
                continue;
            }
            if (
                left.startNodeKey === right.startNodeKey ||
                left.startNodeKey === right.endNodeKey ||
                left.endNodeKey === right.startNodeKey ||
                left.endNodeKey === right.endNodeKey ||
                !isStraightLike(left) ||
                !isStraightLike(right)
            ) {
                continue;
            }

            const minimumClearance = Math.min(left.roadWidth, right.roadWidth) * 0.5;
            if (segmentDistance(left, right) < minimumClearance) {
                issues.push({
                    code: 'road-clearance',
                    message: `Segments ${left.key} and ${right.key} violate the minimum road clearance.`,
                });
            }
        }
    }

    return issues;
};

export const validateGraph = (graph: CandidateGraph, options: FitterOptions): ValidationResult => ({
    errors: [
        ...validateMinSegmentLength(graph),
        ...validateMaxNodeDegree(graph, options),
        ...validateMinIntersectionAngle(graph, options),
        ...validateRoadClearance(graph),
    ],
});
