# Move It Selection XML Format (Cities: Skylines)

This document describes the minimal functional structure of the Move It selection XML format used for exporting and importing objects such as nodes, segments, buildings, and trees.

The format is serialized using `.NET XmlSerializer` and is primarily a transport format used by the Move It mod to reconstruct objects before passing them to the Cities: Skylines game engine.

This documentation focuses on network objects (roads) since those are required for procedural generation.

## 1. File Structure

The root element is always:

```xml
<Selection>
```

Example:

```xml
<?xml version="1.0" encoding="utf-8"?>
<Selection>
  <center>
    <x>-179.109116</x>
    <z>-468.32666</z>
  </center>
  <version>2.10.8</version>
  <!-- objects -->
  <state type="NodeState">...</state>
  <state type="NodeState">...</state>
  <state type="SegmentState">...</state>
</Selection>
```

The `<Selection>` element contains:

| Element   | Required                 | Description                                    |
| --------- | ------------------------ | ---------------------------------------------- |
| `center`  | yes                      | Pivot point of the selection used during paste |
| `version` | optional but recommended | Move It mod version                            |
| `state`   | yes                      | Serialized object states                       |

## 2. Selection Center

```xml
<center>
  <x>...</x>
  <z>...</z>
</center>
```

Defines the pivot point of the selection.

Move It uses this value when pasting objects.

Constraints:

- `y` coordinate is optional.
- Omitting `y` causes the object to snap to terrain height.

## 3. Object States

Each object is serialized as:

```xml
<state xsi:type="NodeState">
```

Possible types include:

| State Type      | Object       |
| --------------- | ------------ |
| `NodeState`     | network node |
| `SegmentState`  | road segment |
| `BuildingState` | buildings    |
| `TreeState`     | trees        |
| `PropState`     | props        |

Only NodeState and SegmentState are required for procedural road generation.

## 4. NodeState

Represents a road node.

Minimal working structure:

```xml
<state xsi:type="NodeState">
  <position>
    <x>...</x>
    <z>...</z>
  </position>

  <id>...</id>
  <prefabName>Gravel Road</prefabName>

  <flags>Created End Moveable OnGround OneWayOut OneWayIn</flags>

  <segmentsList>...</segmentsList>
</state>
```

Fields:

| Field          | Required | Description                   |
| -------------- | -------- | ----------------------------- |
| `position`     | yes      | Node world coordinates        |
| `id`           | yes      | Full instance ID              |
| `prefabName`   | yes      | Network type                  |
| `flags`        | yes      | Node flags                    |
| `segmentsList` | yes      | Short ID of connected segment |

Notes:

- `y` coordinate is optional.
- If omitted, the node will be placed on terrain height.

## 5. SegmentState

Represents a road segment connecting two nodes with a spline in Hermite form (P0 = start position, P1 = end position, T0 = start tangent, T1 = end tangent).

Position is the intersection point of T0 and T1, it effectively acts as a control point.

Minimal working structure:

```xml
<state xsi:type="SegmentState">
  <position>
    <x>...</x>
    <z>...</z>
  </position>
  <id>...</id>
  <prefabName>Gravel Road</prefabName>
  <startPosition>
    <x>...</x>
    <z>...</z>
  </startPosition>
  <endPosition>
    <x>...</x>
    <z>...</z>
  </endPosition>
  <startDirection>
    <x>...</x>
    <z>...</z>
  </startDirection>
  <endDirection>
    <x>...</x>
    <z>...</z>
  </endDirection>
  <startNode>...</startNode>
  <endNode>...</endNode>

</state>
```

Fields:

| Field            | Required | Description              |
| ---------------- | -------- | ------------------------ |
| `position`       | yes      | Segment midpoint         |
| `id`             | yes      | Full segment instance ID |
| `prefabName`     | yes      | Road type                |
| `startPosition`  | yes      | Position of start node   |
| `endPosition`    | yes      | Position of end node     |
| `startDirection` | yes      | Tangent vector at start  |
| `endDirection`   | yes      | Tangent vector at end    |
| `startNode`      | yes      | Short ID of start node   |
| `endNode`        | yes      | Short ID of end node     |

> [!NOTE]
> The midpoint is required. If omitted, Move It reconstructs a curved segment incorrectly.

## 6. Segment Geometry

Segments are defined using:

- `startPosition`
- `endPosition`
- `midpoint` (position)
- `startDirection`
- `endDirection`

This describes a Bezier-like spline used by the Cities: Skylines network system.

Straight segments still require the midpoint.

## 7. ID System

IDs are 32-bit integers containing type information.

Move It forwards them to the game engine.

## Type Prefixes

| Object   | Hex Prefix | Decimal Range |
| -------- | ---------- | ------------- |
| Building | `0x01`     | ~16M          |
| Node     | `0x05`     | ~83M          |
| Segment  | `0x06`     | ~100M         |
| Tree     | `0x0B`     | ~184M         |

Example:

```text
Node ID = 0x05000000
Segment ID = 0x06000000
```

The game checks the high bits to determine the object type.

Incorrect prefixes cause import failures.

## 8. Short IDs (16-bit references)

Relationships between nodes and segments use only the lower 16 bits of IDs.

```text
shortID = fullID & 0xFFFF
```

Used for:

| Field          | Value                |
| -------------- | -------------------- |
| `startNode`    | startNodeID & 0xFFFF |
| `endNode`      | endNodeID & 0xFFFF   |
| `segmentsList` | segmentID & 0xFFFF   |

Example:

```text
segmentID = 100663296 (0x06000000)
segmentsList = 0
```

## 9. ID Generation Strategy

IDs do not need to match the original save.

The game assigns new IDs when importing.

Safe generator strategy:

```text
nodeID    = 0x05000000 + nodeIndex
segmentID = 0x06000000 + segmentIndex
```

Then:

```text
startNode = nodeID & 0xFFFF
endNode   = nodeID & 0xFFFF
segmentsList = segmentID & 0xFFFF
```

## 10. Limitations

Because references use 16-bit IDs, a single export cannot exceed 65536 nodes and 65536 segments.

Otherwise short ID collisions occur.

## 11. Example (Minimal Working Road)

```xml
<?xml version="1.0" encoding="utf-8"?>
<Selection xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <center>
    <x>-179.109116</x>
    <z>-468.32666</z>
  </center>
  <version>2.10.8</version>
  <state xsi:type="NodeState">
    <position>
      <x>-218.897217</x>
      <z>-464.214874</z>
    </position>
    <id>83886080</id>
    <prefabName>Gravel Road</prefabName>
    <flags>Created End Moveable OnGround OneWayOut OneWayIn</flags>
    <segmentsList>0</segmentsList>
  </state>
  <state xsi:type="NodeState">
    <position>
      <x>-139.321014</x>
      <z>-472.438416</z>
    </position>
    <id>83886081</id>
    <prefabName>Gravel Road</prefabName>
    <flags>Created End Moveable OnGround OneWayOut OneWayIn</flags>
    <segmentsList>0</segmentsList>
  </state>
  <state xsi:type="SegmentState">
    <position>
      <x>-179.109116</x>
      <z>-468.32666</z>
    </position>
    <id>100663296</id>
    <prefabName>Gravel Road</prefabName>
    <startPosition>
      <x>-139.321014</x>
      <z>-472.438416</z>
    </startPosition>
    <endPosition>
      <x>-218.897217</x>
      <z>-464.214874</z>
    </endPosition>
    <startDirection>
      <x>-0.994702637</x>
      <z>0.102794163</z>
    </startDirection>
    <endDirection>
      <x>0.994702637</x>
      <z>-0.102794163</z>
    </endDirection>
    <startNode>0</startNode>
    <endNode>1</endNode>
  </state>
</Selection>
```

## 12. Optional Fields

These fields can be omitted without breaking import:

- angle
- terrainHeight
- IntegrationEntry_List
- LaneIDsBase64
- smoothStart
- smoothEnd
- invert
- includesPO

They store extra metadata for mods or advanced editing.

## 13. Practical Uses

This format enables:

- procedural road generation
- parametric city layouts
- spiral or fractal networks
- automated interchange generation

Instead of using the road tool interactively, geometry can be generated programmatically and imported through Move It.
