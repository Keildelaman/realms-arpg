// ============================================================================
// Expedition Generation -- open-field procedural layout + collision grid
// ============================================================================

import type {
  ExpeditionMap,
  ExpeditionRoom,
  ExpeditionCorridor,
  ExpeditionSpawnPoint,
  ObjectiveType,
  RoomType,
  Vec2,
  ExpeditionWallRect,
  ExpeditionLayoutMetrics,
  ExpeditionEncounterPoint,
  ExpeditionDecorPoint,
} from '@/core/types';
import { ZONES } from '@/data/zones.data';
import { MONSTERS } from '@/data/monsters.data';
import {
  ROOM_COUNT_BY_TIER,
  ROOM_TYPE_WEIGHTS,
  BASE_SPAWNS_PER_COMBAT_ROOM,
  BASE_SPAWNS_PER_ELITE_ROOM,
  SPAWN_TIER_SCALAR_STEP,
  MIN_SPAWNS_PER_ROOM,
  MAP_GEN_MAX_ATTEMPTS,
  MAP_GEN_NEIGHBOR_LINKS,
  MAP_GEN_EXTRA_LOOP_EDGE_RATIO,
  MAP_GEN_MIN_MAIN_PATH_RATIO,
  MAP_GEN_MIN_LOOPS,
  MAP_GEN_DEAD_END_RATIO_RANGE,
  MAP_GEN_LAYOUT_MARGIN,
  MAP_GEN_NODE_COUNT_BONUS_MIN,
  MAP_GEN_NODE_COUNT_BONUS_MAX,
  MAP_GEN_NODE_RADIUS_BASE,
  MAP_GEN_NODE_RADIUS_TIER_BONUS,
  MAP_GEN_STEP_MIN,
  MAP_GEN_STEP_MAX,
  MAP_GEN_STEP_TIER_BONUS,
  EXPEDITION_GRID_CELL_SIZE,
  EXPEDITION_WALL_MIN_RECT_CELLS,
  clampTier,
  getTierRange,
} from '@/data/expeditions.data';
import { GAME_WIDTH, GAME_HEIGHT } from '@/data/constants';
import {
  getExpeditionMapSizeScale,
  getExpeditionEncounterPointCellDivisor,
  getExpeditionEncounterPointMinCount,
  getExpeditionEncounterPointMinDistance,
} from '@/data/expedition-progression.data';

interface GenerationConfig {
  zoneId: string;
  tier: number;
  seed: number;
  objective: ObjectiveType;
}

interface FieldNode {
  index: number;
  x: number;
  y: number;
  radius: number;
}

interface GraphEdge {
  a: number;
  b: number;
  distance: number;
  width: number;
}

interface GraphBuildResult {
  edges: GraphEdge[];
  loops: number;
  mainPath: number[];
  startIndex: number;
  endIndex: number;
  degree: number[];
}

class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = (seed ^ 0x9e3779b9) >>> 0;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;

    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else if (this.rank[rb] < this.rank[ra]) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra] += 1;
    }
    return true;
  }
}

function makeRoomId(index: number): string {
  return `room_${index}`;
}

function makeEncounterId(index: number): string {
  return `encounter_${index}`;
}

function mixSeed(baseSeed: number, attempt: number): number {
  const mixed = (baseSeed ^ (attempt * 0x45d9f3b)) >>> 0;
  return mixed ^ (mixed >>> 16);
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function nodePos(node: FieldNode): Vec2 {
  return { x: node.x, y: node.y };
}

function generateFieldNodes(
  rng: SeededRng,
  tier: number,
  count: number,
  compactScale = 1,
): FieldNode[] | null {
  const nodes: FieldNode[] = [];
  const clampedScale = Math.max(0.35, Math.min(1.2, compactScale));
  const baseRadius = (MAP_GEN_NODE_RADIUS_BASE + tier * MAP_GEN_NODE_RADIUS_TIER_BONUS) * clampedScale;

  nodes.push({
    index: 0,
    x: 0,
    y: 0,
    radius: Math.round(baseRadius * 1.2),
  });

  let heading = rng.float(-Math.PI * 0.25, Math.PI * 0.25);

  for (let i = 1; i < count; i++) {
    let placed = false;

    for (let attempt = 0; attempt < 120; attempt++) {
      const anchor = i <= 2 || rng.next() < 0.62
        ? nodes[i - 1]
        : nodes[rng.int(0, Math.max(0, i - 2))];

      heading += rng.float(-0.75, 0.75);
      const step = rng.float(
        MAP_GEN_STEP_MIN * clampedScale,
        (MAP_GEN_STEP_MAX + tier * MAP_GEN_STEP_TIER_BONUS) * clampedScale,
      );
      const angle = heading + rng.float(-0.45, 0.45);

      const radius = rng.float(baseRadius * 0.72, baseRadius * 1.45);
      const x = anchor.x + Math.cos(angle) * step;
      const y = anchor.y + Math.sin(angle) * step;

      let tooClose = false;
      for (const n of nodes) {
        const minDist = Math.min(n.radius, radius) * 0.88;
        const d = distance({ x, y }, { x: n.x, y: n.y });
        if (d < minDist) {
          tooClose = true;
          break;
        }
      }

      if (tooClose) continue;

      nodes.push({
        index: i,
        x,
        y,
        radius,
      });
      placed = true;
      break;
    }

    if (!placed) {
      return null;
    }
  }

  return nodes;
}

function buildCandidateEdges(nodes: FieldNode[], linksPerNode: number, rng: SeededRng): GraphEdge[] {
  const edgeMap = new Map<string, GraphEdge>();

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const neighbors: Array<{ idx: number; dist: number }> = [];

    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const b = nodes[j];
      neighbors.push({ idx: j, dist: distance(nodePos(a), nodePos(b)) });
    }

    neighbors.sort((x, y) => x.dist - y.dist);

    for (let n = 0; n < Math.min(linksPerNode, neighbors.length); n++) {
      const bIdx = neighbors[n].idx;
      const u = Math.min(i, bIdx);
      const v = Math.max(i, bIdx);
      const key = `${u}:${v}`;

      if (!edgeMap.has(key)) {
        const corridorWidth = rng.int(120, 230);
        edgeMap.set(key, {
          a: u,
          b: v,
          distance: neighbors[n].dist,
          width: corridorWidth,
        });
      }
    }
  }

  return [...edgeMap.values()];
}

function buildAdjacency(nodeCount: number, edges: GraphEdge[]): Array<Array<{ to: number; dist: number }>> {
  const adjacency: Array<Array<{ to: number; dist: number }>> = Array.from(
    { length: nodeCount },
    () => [],
  );

  for (const e of edges) {
    adjacency[e.a].push({ to: e.b, dist: e.distance });
    adjacency[e.b].push({ to: e.a, dist: e.distance });
  }

  return adjacency;
}

function dijkstra(adjacency: Array<Array<{ to: number; dist: number }>>, start: number): {
  dist: number[];
  prev: number[];
} {
  const n = adjacency.length;
  const dist = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
  const prev = new Array<number>(n).fill(-1);
  const visited = new Array<boolean>(n).fill(false);

  dist[start] = 0;

  for (let i = 0; i < n; i++) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;

    for (let j = 0; j < n; j++) {
      if (!visited[j] && dist[j] < best) {
        best = dist[j];
        u = j;
      }
    }

    if (u === -1) break;
    visited[u] = true;

    for (const nxt of adjacency[u]) {
      const alt = dist[u] + nxt.dist;
      if (alt < dist[nxt.to]) {
        dist[nxt.to] = alt;
        prev[nxt.to] = u;
      }
    }
  }

  return { dist, prev };
}

function reconstructPath(prev: number[], end: number): number[] {
  const path: number[] = [];
  let cur = end;
  while (cur !== -1) {
    path.push(cur);
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

function buildGraph(nodes: FieldNode[], rng: SeededRng): GraphBuildResult | null {
  const candidates = buildCandidateEdges(nodes, MAP_GEN_NEIGHBOR_LINKS, rng);
  if (candidates.length < nodes.length - 1) return null;

  candidates.sort((a, b) => a.distance - b.distance);

  const uf = new UnionFind(nodes.length);
  const mst: GraphEdge[] = [];
  const spare: GraphEdge[] = [];

  for (const edge of candidates) {
    if (uf.union(edge.a, edge.b)) {
      mst.push(edge);
    } else {
      spare.push(edge);
    }
  }

  if (mst.length !== nodes.length - 1) return null;

  const extraTarget = Math.max(
    MAP_GEN_MIN_LOOPS,
    Math.round(nodes.length * MAP_GEN_EXTRA_LOOP_EDGE_RATIO),
  );

  const extras: GraphEdge[] = [];
  spare.sort((a, b) => a.distance - b.distance);

  for (let i = 0; i < spare.length && extras.length < extraTarget; i++) {
    const chance = 0.72 - Math.min(0.5, i * 0.055);
    if (rng.next() < chance || extras.length + (spare.length - i) <= extraTarget) {
      extras.push(spare[i]);
    }
  }

  const edges = [...mst, ...extras];
  const adjacency = buildAdjacency(nodes.length, edges);

  let startIndex = 0;
  let leftMost = Number.POSITIVE_INFINITY;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].x < leftMost) {
      leftMost = nodes[i].x;
      startIndex = i;
    }
  }

  const first = dijkstra(adjacency, startIndex);
  let endIndex = startIndex;
  let farthest = -1;
  for (let i = 0; i < first.dist.length; i++) {
    if (Number.isFinite(first.dist[i]) && first.dist[i] > farthest) {
      farthest = first.dist[i];
      endIndex = i;
    }
  }

  const second = dijkstra(adjacency, startIndex);
  const mainPath = reconstructPath(second.prev, endIndex);
  const degree = adjacency.map(v => v.length);

  return {
    edges,
    loops: Math.max(0, edges.length - nodes.length + 1),
    mainPath,
    startIndex,
    endIndex,
    degree,
  };
}

function pickMonsterId(rng: SeededRng, zoneId: string): string {
  const zone = ZONES[zoneId];
  if (!zone || zone.monsters.length === 0) {
    return Object.keys(MONSTERS)[0];
  }

  const weighted: Array<{ id: string; weight: number }> = [];
  for (const id of zone.monsters) {
    const def = MONSTERS[id];
    if (!def || def.isBoss) continue;
    weighted.push({ id, weight: Math.max(1, def.spawnWeight) });
  }

  if (weighted.length === 0) {
    return zone.monsters[0];
  }

  const total = weighted.reduce((sum, v) => sum + v.weight, 0);
  let roll = rng.next() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.id;
  }

  return weighted[weighted.length - 1].id;
}

function pickRoomType(rng: SeededRng, allowTreasure: boolean): RoomType {
  const pool = allowTreasure
    ? ROOM_TYPE_WEIGHTS
    : ROOM_TYPE_WEIGHTS.filter(v => v.type !== 'treasure');
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng.next() * total;
  for (const e of pool) {
    roll -= e.weight;
    if (roll <= 0) return e.type;
  }
  return 'combat';
}

function makeSpawnPoints(
  rng: SeededRng,
  room: ExpeditionRoom,
  zoneId: string,
  tier: number,
): ExpeditionSpawnPoint[] {
  if (room.type === 'treasure') return [];

  const base = room.type === 'elite' ? BASE_SPAWNS_PER_ELITE_ROOM : BASE_SPAWNS_PER_COMBAT_ROOM;
  const scalar = 1 + (clampTier(tier) - 1) * SPAWN_TIER_SCALAR_STEP;
  const count = Math.max(MIN_SPAWNS_PER_ROOM, Math.round(base * scalar));
  const margin = 56;

  const out: ExpeditionSpawnPoint[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `${room.id}_spawn_${i}`,
      x: rng.int(margin, Math.max(margin + 1, room.width - margin)),
      y: rng.int(margin, Math.max(margin + 1, room.height - margin)),
      monsterId: pickMonsterId(rng, zoneId),
      isElite: room.type === 'elite' && i === 0,
    });
  }

  return out;
}

function buildRoomsFromNodes(
  nodes: FieldNode[],
  graph: GraphBuildResult,
  rng: SeededRng,
  zoneId: string,
  tier: number,
): {
  rooms: ExpeditionRoom[];
  spawnRoomId: string;
  exitRoomId: string;
} {
  const mainPathSet = new Set<number>(graph.mainPath);
  const rooms: ExpeditionRoom[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    let type: RoomType = 'combat';

    if (i === graph.startIndex) {
      type = 'spawn';
    } else if (i === graph.endIndex) {
      type = rng.next() < 0.45 ? 'elite' : 'combat';
    } else if (mainPathSet.has(i)) {
      type = rng.next() < 0.25 ? 'elite' : 'combat';
    } else {
      type = pickRoomType(rng, true);
    }

    const room: ExpeditionRoom = {
      id: makeRoomId(i),
      type,
      x: Math.round(node.x - node.radius),
      y: Math.round(node.y - node.radius),
      width: Math.round(node.radius * 2),
      height: Math.round(node.radius * 2),
      isBranch: !mainPathSet.has(i),
      spawnPoints: [],
      spawnTriggered: false,
      cleared: false,
      visited: false,
    };

    room.spawnPoints = makeSpawnPoints(rng, room, zoneId, tier);
    if (room.type === 'spawn') {
      room.spawnPoints = room.spawnPoints.slice(0, Math.max(3, room.spawnPoints.length - 1));
    }

    rooms.push(room);
  }

  return {
    rooms,
    spawnRoomId: makeRoomId(graph.startIndex),
    exitRoomId: makeRoomId(graph.endIndex),
  };
}

function createCorridorsFromGraph(nodes: FieldNode[], edges: GraphEdge[], rng: SeededRng): ExpeditionCorridor[] {
  const corridors: ExpeditionCorridor[] = [];

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const a = nodes[e.a];
    const b = nodes[e.b];

    const horizontalFirst = rng.next() < 0.5;
    const jitter = rng.int(-100, 100);

    let points: Vec2[];
    if (horizontalFirst) {
      const mx = Math.round((a.x + b.x) * 0.5 + jitter);
      points = [
        { x: a.x, y: a.y },
        { x: mx, y: a.y },
        { x: mx, y: b.y },
        { x: b.x, y: b.y },
      ];
    } else {
      const my = Math.round((a.y + b.y) * 0.5 + jitter);
      points = [
        { x: a.x, y: a.y },
        { x: a.x, y: my },
        { x: b.x, y: my },
        { x: b.x, y: b.y },
      ];
    }

    corridors.push({
      id: `corridor_${i}`,
      fromRoomId: makeRoomId(e.a),
      toRoomId: makeRoomId(e.b),
      points,
      width: e.width,
    });
  }

  return corridors;
}

function makeGridIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

function setCell(walkable: number[], gridW: number, gridH: number, x: number, y: number, value: 0 | 1): void {
  if (x < 0 || y < 0 || x >= gridW || y >= gridH) return;
  walkable[makeGridIndex(gridW, x, y)] = value;
}

function carveCircle(
  walkable: number[],
  gridW: number,
  gridH: number,
  cellSize: number,
  originX: number,
  originY: number,
  cx: number,
  cy: number,
  radius: number,
  value: 0 | 1,
): void {
  const minX = Math.max(0, Math.floor((cx - radius - originX) / cellSize));
  const minY = Math.max(0, Math.floor((cy - radius - originY) / cellSize));
  const maxX = Math.min(gridW - 1, Math.floor((cx + radius - originX) / cellSize));
  const maxY = Math.min(gridH - 1, Math.floor((cy + radius - originY) / cellSize));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const wx = originX + x * cellSize + cellSize * 0.5;
      const wy = originY + y * cellSize + cellSize * 0.5;
      const dx = wx - cx;
      const dy = wy - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setCell(walkable, gridW, gridH, x, y, value);
      }
    }
  }
}

function carveCapsule(
  walkable: number[],
  gridW: number,
  gridH: number,
  cellSize: number,
  originX: number,
  originY: number,
  a: Vec2,
  b: Vec2,
  radius: number,
  value: 0 | 1,
): void {
  const dist = distance(a, b);
  const steps = Math.max(1, Math.ceil(dist / (cellSize * 0.5)));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(a.x, b.x, t);
    const y = lerp(a.y, b.y, t);
    carveCircle(walkable, gridW, gridH, cellSize, originX, originY, x, y, radius, value);
  }
}

function floodFillKeepSpawnComponent(
  walkable: number[],
  gridW: number,
  gridH: number,
  spawnX: number,
  spawnY: number,
): void {
  const visited = new Uint8Array(gridW * gridH);
  const stack: Array<{ x: number; y: number }> = [];
  const sx = Math.floor(spawnX);
  const sy = Math.floor(spawnY);

  if (sx < 0 || sy < 0 || sx >= gridW || sy >= gridH) return;
  if (walkable[makeGridIndex(gridW, sx, sy)] !== 1) return;

  stack.push({ x: sx, y: sy });
  visited[makeGridIndex(gridW, sx, sy)] = 1;

  const dirs = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ];

  while (stack.length > 0) {
    const cur = stack.pop()!;

    for (const d of dirs) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;

      const idx = makeGridIndex(gridW, nx, ny);
      if (visited[idx] === 1) continue;
      if (walkable[idx] !== 1) continue;

      visited[idx] = 1;
      stack.push({ x: nx, y: ny });
    }
  }

  for (let i = 0; i < walkable.length; i++) {
    if (walkable[i] === 1 && visited[i] === 0) {
      walkable[i] = 0;
    }
  }
}

function buildGridAndWalls(
  nodes: FieldNode[],
  corridors: ExpeditionCorridor[],
  spawnNode: FieldNode,
  rng: SeededRng,
  layoutMargin: number,
): {
  bounds: { x: number; y: number; width: number; height: number };
  grid: {
    cellSize: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
    walkable: number[];
  };
  wallRects: ExpeditionWallRect[];
} {
  const cell = EXPEDITION_GRID_CELL_SIZE;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.radius);
    minY = Math.min(minY, n.y - n.radius);
    maxX = Math.max(maxX, n.x + n.radius);
    maxY = Math.max(maxY, n.y + n.radius);
  }

  for (const c of corridors) {
    const half = c.width * 0.5;
    for (const p of c.points) {
      minX = Math.min(minX, p.x - half);
      minY = Math.min(minY, p.y - half);
      maxX = Math.max(maxX, p.x + half);
      maxY = Math.max(maxY, p.y + half);
    }
  }

  minX -= layoutMargin;
  minY -= layoutMargin;
  maxX += layoutMargin;
  maxY += layoutMargin;

  const originX = Math.floor(minX / cell) * cell;
  const originY = Math.floor(minY / cell) * cell;
  const gridW = Math.max(1, Math.ceil((maxX - originX) / cell));
  const gridH = Math.max(1, Math.ceil((maxY - originY) / cell));
  const walkable = new Array<number>(gridW * gridH).fill(0);

  for (const n of nodes) {
    carveCircle(
      walkable,
      gridW,
      gridH,
      cell,
      originX,
      originY,
      n.x,
      n.y,
      n.radius,
      1,
    );
  }

  for (const c of corridors) {
    for (let i = 0; i < c.points.length - 1; i++) {
      carveCapsule(
        walkable,
        gridW,
        gridH,
        cell,
        originX,
        originY,
        c.points[i],
        c.points[i + 1],
        c.width * 0.5,
        1,
      );
    }
  }

  // Add organic variation: extra carve spots.
  const extraCarves = Math.max(6, Math.round(nodes.length * 0.55));
  for (let i = 0; i < extraCarves; i++) {
    const n = rng.pick(nodes);
    const a = rng.float(0, Math.PI * 2);
    const d = rng.float(n.radius * 0.25, n.radius * 1.35);
    const r = rng.float(70, 170);

    carveCircle(
      walkable,
      gridW,
      gridH,
      cell,
      originX,
      originY,
      n.x + Math.cos(a) * d,
      n.y + Math.sin(a) * d,
      r,
      1,
    );
  }

  // Carve blocked islands inside large spaces for shape variation.
  const obstacleCuts = Math.max(3, Math.round(nodes.length * 0.32));
  for (let i = 0; i < obstacleCuts; i++) {
    const n = rng.pick(nodes);
    if (n.index === spawnNode.index) continue;

    const a = rng.float(0, Math.PI * 2);
    const d = rng.float(n.radius * 0.1, n.radius * 0.65);
    const r = rng.float(48, Math.max(55, n.radius * 0.3));

    carveCircle(
      walkable,
      gridW,
      gridH,
      cell,
      originX,
      originY,
      n.x + Math.cos(a) * d,
      n.y + Math.sin(a) * d,
      r,
      0,
    );
  }

  const spawnCellX = (spawnNode.x - originX) / cell;
  const spawnCellY = (spawnNode.y - originY) / cell;
  floodFillKeepSpawnComponent(walkable, gridW, gridH, spawnCellX, spawnCellY);

  // Build walls from blocked cells touching walkable.
  const wallMask = new Array<number>(gridW * gridH).fill(0);
  const dirs = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ];

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const idx = makeGridIndex(gridW, x, y);
      if (walkable[idx] === 1) continue;

      let adjacent = false;
      for (const d of dirs) {
        const nx = x + d.x;
        const ny = y + d.y;
        if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
        if (walkable[makeGridIndex(gridW, nx, ny)] === 1) {
          adjacent = true;
          break;
        }
      }

      if (adjacent) wallMask[idx] = 1;
    }
  }

  const wallRects: ExpeditionWallRect[] = [];
  type ActiveRect = { x0: number; x1: number; y0: number; y1: number };
  let active = new Map<string, ActiveRect>();

  for (let y = 0; y < gridH; y++) {
    const runs: Array<{ x0: number; x1: number }> = [];
    let x = 0;

    while (x < gridW) {
      if (wallMask[makeGridIndex(gridW, x, y)] === 0) {
        x += 1;
        continue;
      }

      const start = x;
      x += 1;
      while (x < gridW && wallMask[makeGridIndex(gridW, x, y)] === 1) {
        x += 1;
      }
      const end = x - 1;

      if (end - start + 1 >= EXPEDITION_WALL_MIN_RECT_CELLS) {
        runs.push({ x0: start, x1: end });
      }
    }

    const nextActive = new Map<string, ActiveRect>();

    for (const run of runs) {
      const key = `${run.x0}:${run.x1}`;
      const found = active.get(key);
      if (found) {
        found.y1 = y;
        nextActive.set(key, found);
      } else {
        nextActive.set(key, {
          x0: run.x0,
          x1: run.x1,
          y0: y,
          y1: y,
        });
      }
    }

    for (const [key, rect] of active) {
      if (!nextActive.has(key)) {
        wallRects.push({
          x: originX + rect.x0 * cell,
          y: originY + rect.y0 * cell,
          width: (rect.x1 - rect.x0 + 1) * cell,
          height: (rect.y1 - rect.y0 + 1) * cell,
        });
      }
    }

    active = nextActive;
  }

  for (const rect of active.values()) {
    wallRects.push({
      x: originX + rect.x0 * cell,
      y: originY + rect.y0 * cell,
      width: (rect.x1 - rect.x0 + 1) * cell,
      height: (rect.y1 - rect.y0 + 1) * cell,
    });
  }

  return {
    bounds: {
      x: originX,
      y: originY,
      width: gridW * cell,
      height: gridH * cell,
    },
    grid: {
      cellSize: cell,
      originX,
      originY,
      width: gridW,
      height: gridH,
      walkable,
    },
    wallRects,
  };
}

function normalizeToOrigin(
  rooms: ExpeditionRoom[],
  corridors: ExpeditionCorridor[],
  bounds: { x: number; y: number; width: number; height: number },
  grid: {
    cellSize: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
    walkable: number[];
  },
  wallRects: ExpeditionWallRect[],
  nodes: FieldNode[],
): {
  bounds: { x: number; y: number; width: number; height: number };
  grid: {
    cellSize: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
    walkable: number[];
  };
} {
  // Keep very small maps centered inside a minimum world canvas so the camera
  // never exposes untextured void/background color around the playable area.
  const minWorldWidth = GAME_WIDTH + grid.cellSize * 2;
  const minWorldHeight = GAME_HEIGHT + grid.cellSize * 2;
  const targetWidth = Math.max(bounds.width, minWorldWidth);
  const targetHeight = Math.max(bounds.height, minWorldHeight);
  const padLeft = Math.floor((targetWidth - bounds.width) * 0.5);
  const padTop = Math.floor((targetHeight - bounds.height) * 0.5);

  const shiftX = -bounds.x + padLeft;
  const shiftY = -bounds.y + padTop;

  for (const room of rooms) {
    room.x += shiftX;
    room.y += shiftY;
  }

  for (const corridor of corridors) {
    for (const p of corridor.points) {
      p.x += shiftX;
      p.y += shiftY;
    }
  }

  for (const wall of wallRects) {
    wall.x += shiftX;
    wall.y += shiftY;
  }

  for (const node of nodes) {
    node.x += shiftX;
    node.y += shiftY;
  }

  return {
    bounds: {
      x: 0,
      y: 0,
      width: targetWidth,
      height: targetHeight,
    },
    grid: {
      ...grid,
      originX: grid.originX + shiftX,
      originY: grid.originY + shiftY,
    },
  };
}

function buildMetrics(graph: GraphBuildResult, nodeCount: number): ExpeditionLayoutMetrics {
  let deadEnds = 0;
  for (const deg of graph.degree) {
    if (deg === 1) deadEnds += 1;
  }

  return {
    loops: graph.loops,
    deadEnds,
    deadEndRatio: nodeCount > 0 ? deadEnds / nodeCount : 0,
    mainPathRooms: graph.mainPath.length,
  };
}

function buildEncounterPoints(
  grid: {
    cellSize: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
    walkable: number[];
  },
  rng: SeededRng,
  zoneId: string,
  tier: number,
  mapSizeScale: number,
): ExpeditionEncounterPoint[] {
  const points: ExpeditionEncounterPoint[] = [];
  const minDist = getExpeditionEncounterPointMinDistance(zoneId, tier);

  const walkableCells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.walkable[makeGridIndex(grid.width, x, y)] === 1) {
        if (x < 2 || y < 2 || x >= grid.width - 2 || y >= grid.height - 2) continue;
        walkableCells.push({ x, y });
      }
    }
  }
  const areaDivisor = getExpeditionEncounterPointCellDivisor(zoneId, tier);
  const areaTarget = Math.round(walkableCells.length / areaDivisor);
  const budgetTarget = getExpeditionEncounterPointMinCount(zoneId, tier);
  const scaleTarget = Math.round(10 + mapSizeScale * 16);
  const target = Math.max(12, budgetTarget, areaTarget, scaleTarget);

  for (let i = 0; i < walkableCells.length * 7 && points.length < target; i++) {
    if (walkableCells.length === 0) break;

    const cell = walkableCells[rng.int(0, walkableCells.length - 1)];
    const wx = grid.originX + cell.x * grid.cellSize + grid.cellSize * 0.5;
    const wy = grid.originY + cell.y * grid.cellSize + grid.cellSize * 0.5;

    let tooClose = false;
    for (const p of points) {
      const d = distance({ x: wx, y: wy }, { x: p.x, y: p.y });
      if (d < minDist) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    points.push({
      id: makeEncounterId(points.length),
      x: wx,
      y: wy,
      packWeight: rng.float(0.8, 1.35),
    });
  }

  return points;
}

function buildDecorPoints(
  grid: {
    cellSize: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
    walkable: number[];
  },
  rng: SeededRng,
): ExpeditionDecorPoint[] {
  const out: ExpeditionDecorPoint[] = [];
  const target = Math.max(180, Math.round((grid.width * grid.height) * 0.025));
  const kinds: Array<ExpeditionDecorPoint['kind']> = ['rock', 'tree', 'ruin', 'shard'];

  for (let i = 0; i < target; i++) {
    const x = rng.int(2, grid.width - 3);
    const y = rng.int(2, grid.height - 3);
    const idx = makeGridIndex(grid.width, x, y);
    if (grid.walkable[idx] !== 1) continue;

    // Keep center mostly clear.
    if (rng.next() < 0.35) continue;

    out.push({
      x: grid.originX + x * grid.cellSize + grid.cellSize * rng.float(0.2, 0.8),
      y: grid.originY + y * grid.cellSize + grid.cellSize * rng.float(0.2, 0.8),
      kind: kinds[rng.int(0, kinds.length - 1)],
      scale: rng.float(0.7, 1.45),
    });
  }

  return out;
}

function validateLayout(nodeCount: number, metrics: ExpeditionLayoutMetrics, encounters: number): boolean {
  if (metrics.loops < MAP_GEN_MIN_LOOPS) return false;
  if (metrics.deadEndRatio < MAP_GEN_DEAD_END_RATIO_RANGE[0]) return false;
  if (metrics.deadEndRatio > MAP_GEN_DEAD_END_RATIO_RANGE[1]) return false;

  const minPath = Math.ceil(nodeCount * MAP_GEN_MIN_MAIN_PATH_RATIO);
  if (metrics.mainPathRooms < minPath) return false;

  if (encounters < Math.max(12, Math.ceil(nodeCount * 1.4))) return false;

  return true;
}

function tryGenerate(config: GenerationConfig, seed: number): ExpeditionMap | null {
  const tier = clampTier(config.tier);
  const rng = new SeededRng(seed);
  const isTutorialTier = config.zoneId === 'whisperwood' && tier === 1;
  const mapSizeScale = getExpeditionMapSizeScale(config.zoneId, tier);

  const [minRooms, maxRooms] = getTierRange(ROOM_COUNT_BY_TIER, tier, [6, 8]);
  const scaledNodeBonusMin = Math.round(MAP_GEN_NODE_COUNT_BONUS_MIN * (0.34 + mapSizeScale * 0.42));
  const scaledNodeBonusMax = Math.round(MAP_GEN_NODE_COUNT_BONUS_MAX * (0.38 + mapSizeScale * 0.48));
  let nodeCount = rng.int(minRooms + scaledNodeBonusMin, maxRooms + scaledNodeBonusMax);
  if (isTutorialTier) {
    // Tutorial-like first map: smaller footprint and simpler navigation.
    nodeCount = rng.int(5, 6);
  }

  const layoutScale = isTutorialTier
    ? 0.55
    : Math.max(0.72, Math.min(1.16, 0.5 + mapSizeScale * 0.47));
  const nodes = generateFieldNodes(rng, tier, nodeCount, layoutScale);
  if (!nodes) return null;

  const graph = buildGraph(nodes, rng);
  if (!graph) return null;

  const roomData = buildRoomsFromNodes(nodes, graph, rng, config.zoneId, tier);
  const corridors = createCorridorsFromGraph(nodes, graph.edges, rng);

  const spawnNode = nodes[graph.startIndex];
  const marginScale = isTutorialTier
    ? 0.45
    : Math.max(0.64, Math.min(1.14, 0.5 + mapSizeScale * 0.44));
  const layoutMargin = Math.round(MAP_GEN_LAYOUT_MARGIN * marginScale);
  const geometry = buildGridAndWalls(nodes, corridors, spawnNode, rng, layoutMargin);

  const normalized = normalizeToOrigin(
    roomData.rooms,
    corridors,
    geometry.bounds,
    geometry.grid,
    geometry.wallRects,
    nodes,
  );

  const metrics = buildMetrics(graph, nodes.length);
  const encounterPoints = buildEncounterPoints(normalized.grid, rng, config.zoneId, tier, mapSizeScale);

  if (!validateLayout(nodes.length, metrics, encounterPoints.length)) {
    return null;
  }

  const decorPoints = buildDecorPoints(normalized.grid, rng);

  return {
    seed: config.seed,
    zoneId: config.zoneId,
    tier,
    objective: config.objective,
    modifiers: [],
    rooms: roomData.rooms,
    corridors,
    spawnRoomId: roomData.spawnRoomId,
    exitRoomId: roomData.exitRoomId,
    bounds: normalized.bounds,
    grid: normalized.grid,
    wallRects: geometry.wallRects,
    metrics,
    encounterPoints,
    decorPoints,
  };
}

export function generateExpeditionMap(config: GenerationConfig): ExpeditionMap {
  for (let attempt = 0; attempt < MAP_GEN_MAX_ATTEMPTS; attempt++) {
    const attemptSeed = mixSeed(config.seed, attempt);
    const result = tryGenerate(config, attemptSeed);
    if (result) return result;
  }

  const fallback = tryGenerate(config, mixSeed(config.seed, MAP_GEN_MAX_ATTEMPTS + 1));
  if (fallback) return fallback;

  throw new Error('Failed to generate expedition map after maximum attempts');
}

export function findRoomById(map: ExpeditionMap, roomId: string): ExpeditionRoom | undefined {
  return map.rooms.find(room => room.id === roomId);
}

export function getRoomWorldCenter(room: ExpeditionRoom): { x: number; y: number } {
  return {
    x: room.x + room.width * 0.5,
    y: room.y + room.height * 0.5,
  };
}

export function isPointInRoom(room: ExpeditionRoom, x: number, y: number): boolean {
  return x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.height;
}

export function getRoomContainingPoint(map: ExpeditionMap, x: number, y: number): ExpeditionRoom | null {
  for (const room of map.rooms) {
    if (isPointInRoom(room, x, y)) {
      return room;
    }
  }
  return null;
}

function worldToCell(map: ExpeditionMap, worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: Math.floor((worldX - map.grid.originX) / map.grid.cellSize),
    y: Math.floor((worldY - map.grid.originY) / map.grid.cellSize),
  };
}

function isCellWalkable(map: ExpeditionMap, cellX: number, cellY: number): boolean {
  if (cellX < 0 || cellY < 0 || cellX >= map.grid.width || cellY >= map.grid.height) {
    return false;
  }
  return map.grid.walkable[makeGridIndex(map.grid.width, cellX, cellY)] === 1;
}

export function isPointWalkable(map: ExpeditionMap, worldX: number, worldY: number, radius: number): boolean {
  const probes = [
    { x: 0, y: 0 },
    { x: radius, y: 0 },
    { x: -radius, y: 0 },
    { x: 0, y: radius },
    { x: 0, y: -radius },
    { x: radius * 0.7, y: radius * 0.7 },
    { x: -radius * 0.7, y: radius * 0.7 },
    { x: radius * 0.7, y: -radius * 0.7 },
    { x: -radius * 0.7, y: -radius * 0.7 },
  ];

  for (const p of probes) {
    const cell = worldToCell(map, worldX + p.x, worldY + p.y);
    if (!isCellWalkable(map, cell.x, cell.y)) {
      return false;
    }
  }

  return true;
}

export function resolveMovementAgainstMap(
  map: ExpeditionMap,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
): { x: number; y: number } {
  const sweepSteps = 12;
  let lastX = fromX;
  let lastY = fromY;

  for (let i = 1; i <= sweepSteps; i++) {
    const t = i / sweepSteps;
    const x = lerp(fromX, toX, t);
    const y = lerp(fromY, toY, t);

    if (isPointWalkable(map, x, y, radius)) {
      lastX = x;
      lastY = y;
    } else {
      break;
    }
  }

  if (isPointWalkable(map, toX, lastY, radius)) {
    lastX = toX;
  }

  if (isPointWalkable(map, lastX, toY, radius)) {
    lastY = toY;
  }

  return { x: lastX, y: lastY };
}

/**
 * Safely resolve a target position against the expedition map.
 * Uses resolveMovementAgainstMap to sweep from `from` to `to`,
 * clamping to the last walkable position. If the result is still
 * unwalkable (edge case), snaps to nearest walkable tile center.
 */
export function safeResolvePosition(
  map: ExpeditionMap,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
): { x: number; y: number } {
  const resolved = resolveMovementAgainstMap(map, fromX, fromY, toX, toY, radius);

  if (isPointWalkable(map, resolved.x, resolved.y, radius)) {
    return resolved;
  }

  // Fallback: if from position is walkable, stay there
  if (isPointWalkable(map, fromX, fromY, radius)) {
    return { x: fromX, y: fromY };
  }

  // Last resort: scan nearby cells for a walkable tile center
  const cs = map.grid.cellSize;
  const cell = worldToCell(map, resolved.x, resolved.y);
  for (let r = 1; r <= 5; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only border cells
        const cx = cell.x + dx;
        const cy = cell.y + dy;
        if (isCellWalkable(map, cx, cy)) {
          return {
            x: map.grid.originX + (cx + 0.5) * cs,
            y: map.grid.originY + (cy + 0.5) * cs,
          };
        }
      }
    }
  }

  // If nothing found, return the from position as-is
  return { x: fromX, y: fromY };
}
