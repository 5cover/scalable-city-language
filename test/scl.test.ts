import assert from 'node:assert/strict';
import test from 'node:test';

import { compileToMoveIt, createCanvas, polarPoint } from '../src/index.js';
import type { BuildResult, NetworkNode, Point3 } from '../src/index.js';

const EPSILON = 1e-4;

const countOccurrences = (value: string, pattern: string): number => {
  return value.split(pattern).length - 1;
};

const nodeDegrees = (network: BuildResult): Map<string, number> => {
  const degrees = new Map<string, number>();

  for (const segment of network.segments) {
    degrees.set(
      segment.startNodeKey,
      (degrees.get(segment.startNodeKey) ?? 0) + 1
    );
    degrees.set(segment.endNodeKey, (degrees.get(segment.endNodeKey) ?? 0) + 1);
  }

  return degrees;
};

const segmentLength = (start: Point3, end: Point3): number => {
  return Math.hypot(end.x - start.x, end.z - start.z);
};

const findNodeAt = (
  network: BuildResult,
  x: number,
  z: number
): NetworkNode | undefined => {
  return network.nodes.find((node) => {
    return (
      Math.abs(node.position.x - x) <= EPSILON &&
      Math.abs(node.position.z - z) <= EPSILON
    );
  });
};

const isConnected = (network: BuildResult): boolean => {
  if (network.nodes.length === 0) {
    return true;
  }

  const adjacency = new Map<string, Set<string>>();
  for (const node of network.nodes) {
    adjacency.set(node.key, new Set<string>());
  }
  for (const segment of network.segments) {
    adjacency.get(segment.startNodeKey)?.add(segment.endNodeKey);
    adjacency.get(segment.endNodeKey)?.add(segment.startNodeKey);
  }

  const startNode = network.nodes[0];
  if (startNode === undefined) {
    return true;
  }

  const visited = new Set<string>([startNode.key]);
  const queue = [startNode.key];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      continue;
    }

    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) {
        continue;
      }

      visited.add(next);
      queue.push(next);
    }
  }

  return visited.size === network.nodes.length;
};

test('line road exports a valid simple network', () => {
  const canvas = createCanvas({
    maxSegmentLength: 200,
    defaultRoad: {
      prefabName: 'Gravel Road',
      flags: 'Created End Moveable OnGround OneWayOut OneWayIn'
    }
  });

  canvas.addLineRoad({
    start: { x: 0, z: 0 },
    end: { x: 100, z: 0 }
  });

  const network = canvas.build();
  const xml = compileToMoveIt(network);

  assert.equal(network.nodes.length, 2);
  assert.equal(network.segments.length, 1);
  assert.equal(countOccurrences(xml, '<state xsi:type="NodeState">'), 2);
  assert.equal(countOccurrences(xml, '<state xsi:type="SegmentState">'), 1);
  assert.equal(countOccurrences(xml, 'xmlns:xsi='), 1);
  assert.match(xml, /<startNode>0<\/startNode>/);
  assert.match(xml, /<endNode>1<\/endNode>/);
});

test('circle road gets segmented and closes correctly', () => {
  const canvas = createCanvas({
    maxSegmentLength: 20
  });

  canvas.addCircleRoad({
    center: { x: 0, z: 0 },
    radius: 10
  });

  const network = canvas.build();
  const degrees = nodeDegrees(network);

  assert.equal(network.nodes.length, 4);
  assert.equal(network.segments.length, 4);
  assert.ok(isConnected(network));
  for (const degree of degrees.values()) {
    assert.equal(degree, 2);
  }
});

test('spiral road generates multiple segments and increasing radius behavior', () => {
  const canvas = createCanvas({
    maxSegmentLength: 50
  });

  canvas.addArchimedeanSpiralRoad({
    center: { x: 0, z: 0 },
    startRadius: 10,
    pitch: 40,
    startAngleDeg: 0,
    arcLength: 300
  });

  const network = canvas.build();
  const orderedPoints = network.segments
    .map((segment) => segment.start)
    .concat(network.segments.at(-1)?.end ?? []);
  const radii = orderedPoints.map((point) => Math.hypot(point.x, point.z));

  assert.ok(network.segments.length > 3);
  for (let index = 1; index < radii.length; index += 1) {
    const previous = radii[index - 1];
    const current = radii[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    assert.ok(current >= previous - EPSILON);
  }
});

test('line and circle intersection creates shared nodes', () => {
  const canvas = createCanvas({
    maxSegmentLength: 200
  });

  canvas.addCircleRoad({
    center: { x: 0, z: 0 },
    radius: 10
  });
  canvas.addLineRoad({
    start: { x: -20, z: 0 },
    end: { x: 20, z: 0 }
  });

  const network = canvas.build();
  const degrees = nodeDegrees(network);
  const left = findNodeAt(network, -10, 0);
  const right = findNodeAt(network, 10, 0);

  assert.ok(left);
  assert.ok(right);
  assert.equal(degrees.get(left.key), 4);
  assert.equal(degrees.get(right.key), 4);
});

test('line and spiral intersection creates shared nodes', () => {
  const canvas = createCanvas({
    maxSegmentLength: 200
  });

  canvas.addArchimedeanSpiralRoad({
    center: { x: 0, z: 0 },
    startRadius: 20,
    pitch: 50,
    startAngleDeg: 0,
    arcLength: 800
  });
  canvas.addLineRoad({
    start: { x: 0, z: 0 },
    end: { x: 220, z: 0 }
  });

  const network = canvas.build();
  const sharedNodes = network.nodes.filter((node) => {
    const degree = nodeDegrees(network).get(node.key) ?? 0;
    return Math.abs(node.position.z) <= EPSILON && degree >= 3;
  });

  assert.ok(sharedNodes.length >= 2);
});

test('segment subdivision respects maxSegmentLength', () => {
  const canvas = createCanvas({
    maxSegmentLength: 96
  });

  canvas.addLineRoad({
    start: { x: 0, z: 0 },
    end: { x: 250, z: 0 }
  });

  const network = canvas.build();

  assert.equal(network.segments.length, 3);
  for (const segment of network.segments) {
    assert.ok(segmentLength(segment.start, segment.end) <= 96 + EPSILON);
  }
});

test('omitted y does not emit y in XML', () => {
  const canvas = createCanvas({
    maxSegmentLength: 200
  });

  canvas.addLineRoad({
    start: { x: 0, z: 0 },
    end: { x: 20, z: 0 }
  });

  const xml = compileToMoveIt(canvas.build());

  assert.equal(xml.includes('<y>'), false);
});

test('smith st spiral composition compiles into a connected network', () => {
  const canvas = createCanvas({
    maxSegmentLength: 96,
    defaultRoad: {
      prefabName: 'Gravel Road',
      flags: 'Created End Moveable OnGround OneWayOut OneWayIn'
    }
  });

  canvas.addCircleRoad({
    center: { x: 0, z: 0 },
    radius: 10
  });

  canvas.addArchimedeanSpiralRoad({
    center: { x: 0, z: 0 },
    startRadius: 20,
    pitch: 82.3,
    direction: 'clockwise',
    startAngleDeg: 0,
    arcLength: 900
  });

  const serviceRoadCount = 5;
  const serviceRoadLength = 180;

  for (let index = 0; index < serviceRoadCount; index += 1) {
    const angleDeg = (360 / serviceRoadCount) * index;
    canvas.addLineRoad({
      start: { x: 0, z: 0 },
      end: polarPoint({ x: 0, z: 0 }, serviceRoadLength, angleDeg)
    });
  }

  const network = canvas.build();
  const xml = compileToMoveIt(network);
  const centerNode = findNodeAt(network, 0, 0);
  const degrees = nodeDegrees(network);

  assert.ok(network.nodes.length > 10);
  assert.ok(network.segments.length > 10);
  assert.ok(isConnected(network));
  assert.ok(centerNode);
  assert.equal(degrees.get(centerNode.key), 5);
  assert.match(xml, /<Selection xmlns:xsi=/);
  assert.match(xml, /<state xsi:type="SegmentState">/);
});
