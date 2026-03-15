import type { Figure, NetworkNode, NetworkSegment, Point3 } from '../domain/types.js';
import type { Shape } from '../geometry/shapes.js';

export interface Span {
    readonly id: string;
    readonly shape: Shape;
    readonly t0: number;
    readonly t1: number;
}

export interface SpanIntersection {
    readonly leftSpanId: string;
    readonly rightSpanId: string;
    readonly leftT: number;
    readonly rightT: number;
}

export interface CandidateNode {
    readonly key: string;
    readonly position: Point3;
    readonly incidentSpanIds: string[];
}

export interface CandidateSegment {
    readonly key: string;
    readonly spanId: string;
    readonly startNodeKey: string;
    readonly endNodeKey: string;
    readonly start: Point3;
    readonly control: Point3;
    readonly end: Point3;
    readonly prefabName: string;
    readonly roadWidth: number;
    readonly sourceFigId: number;
}

export interface FitterOptions {
    readonly maxTurnAngleDeg: number;
    readonly maxNodeDegree: number;
    readonly minIntersectionAngleDeg: number;
    readonly quantizationStep: number;
    readonly maxIntersectionSubdivisionDepth: number;
    readonly intersectionFlatnessDistanceTolerance: number;
    readonly intersectionFlatnessTurnAngleDeg: number;
    readonly intersectionPointTolerance: number;
}

export interface FitterIssue {
    readonly code: string;
    readonly message: string;
}

export interface ValidationResult {
    readonly errors: readonly FitterIssue[];
}

export interface CandidateGraph {
    readonly nodes: readonly NetworkNode[];
    readonly segments: readonly NetworkSegment[];
    readonly candidateNodes: readonly CandidateNode[];
    readonly candidateSegments: readonly CandidateSegment[];
}

export interface FitNetworkInput {
    readonly figures: readonly Figure[];
}
