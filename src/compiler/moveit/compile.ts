import type { BuildResult, Point2, Point3 } from '../../domain/types.js';
import { DEFAULT_MOVE_IT_VERSION } from '../../utils/constants.js';
import { normalize2, point2, subtract2 } from '../../utils/math.js';

export interface CompileToMoveItOptions {
    readonly version?: string;
}

const NODE_ID_BASE = 0x05000000;
const SEGMENT_ID_BASE = 0x06000000;

const escapeXml = (value: string): string => {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
};

const formatNumber = (value: number): string => {
    return value.toFixed(6).replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
};

const appendPoint = (lines: string[], tagName: string, point: Point2 | Point3, indent: string): void => {
    lines.push(`${indent}<${tagName}>`);
    lines.push(`${indent}  <x>${formatNumber(point.x)}</x>`);
    if ('y' in point && point.y !== undefined) {
        lines.push(`${indent}  <y>${formatNumber(point.y)}</y>`);
    }
    lines.push(`${indent}  <z>${formatNumber(point.z)}</z>`);
    lines.push(`${indent}</${tagName}>`);
};

const shortId = (fullId: number): number => fullId & 0xffff;

const segmentDirections = (start: Point3, control: Point3, end: Point3): { start: Point2; end: Point2 } => {
    const startDirection = normalize2(subtract2(point2(control.x, control.z), point2(start.x, start.z)));
    const endDirection = normalize2(subtract2(point2(control.x, control.z), point2(end.x, end.z)));
    const fallback = normalize2(subtract2(point2(end.x, end.z), point2(start.x, start.z)));

    return {
        start: startDirection.x === 0 && startDirection.z === 0 ? fallback : startDirection,
        end: endDirection.x === 0 && endDirection.z === 0 ? point2(-fallback.x, -fallback.z) : endDirection,
    };
};

export const compileToMoveIt = (network: BuildResult, options: CompileToMoveItOptions = {}): string => {
    const nodeIds = new Map<string, number>();
    const segmentIds = new Map<string, number>();

    network.nodes.forEach((node, index) => {
        nodeIds.set(node.key, NODE_ID_BASE + index);
    });
    network.segments.forEach((segment, index) => {
        segmentIds.set(segment.key, SEGMENT_ID_BASE + index);
    });

    const segmentIdsByNode = new Map<string, number[]>();
    for (const segment of network.segments) {
        const segmentId = segmentIds.get(segment.key);
        if (segmentId === undefined) {
            continue;
        }

        for (const nodeKey of [segment.startNodeKey, segment.endNodeKey]) {
            const current = segmentIdsByNode.get(nodeKey) ?? [];
            current.push(shortId(segmentId));
            segmentIdsByNode.set(nodeKey, current);
        }
    }

    const lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Selection xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    ];
    if (network.center !== undefined) {
        appendPoint(lines, 'center', network.center, '  ');
    }
    lines.push(`  <version>${escapeXml(options.version ?? DEFAULT_MOVE_IT_VERSION)}</version>`);

    for (const node of network.nodes) {
        const nodeId = nodeIds.get(node.key);
        if (nodeId === undefined) {
            continue;
        }

        lines.push('  <state xsi:type="NodeState">');
        appendPoint(lines, 'position', node.position, '    ');
        lines.push(`    <id>${nodeId}</id>`);
        lines.push(`    <prefabName>${escapeXml(node.prefabName)}</prefabName>`);
        lines.push(`    <flags>${escapeXml(Array.from(new Set(node.flags)).join(' '))}</flags>`);

        for (const connectedSegmentId of segmentIdsByNode.get(node.key) ?? []) {
            lines.push(`    <segmentsList>${connectedSegmentId}</segmentsList>`);
        }

        lines.push('  </state>');
    }

    for (const segment of network.segments) {
        const segmentId = segmentIds.get(segment.key);
        const startNodeId = nodeIds.get(segment.startNodeKey);
        const endNodeId = nodeIds.get(segment.endNodeKey);
        if (segmentId === undefined || startNodeId === undefined || endNodeId === undefined) {
            continue;
        }
        const directions = segmentDirections(segment.start, segment.control, segment.end);

        lines.push('  <state xsi:type="SegmentState">');
        appendPoint(lines, 'position', segment.control, '    ');
        lines.push(`    <id>${segmentId}</id>`);
        lines.push(`    <prefabName>${escapeXml(segment.prefabName)}</prefabName>`);
        appendPoint(lines, 'startPosition', segment.start, '    ');
        appendPoint(lines, 'endPosition', segment.end, '    ');
        appendPoint(lines, 'startDirection', directions.start, '    ');
        appendPoint(lines, 'endDirection', directions.end, '    ');
        lines.push(`    <startNode>${shortId(startNodeId)}</startNode>`);
        lines.push(`    <endNode>${shortId(endNodeId)}</endNode>`);
        lines.push('  </state>');
    }

    lines.push('</Selection>');
    return `${lines.join('\n')}\n`;
};
// todo: rewrite in xml2js
