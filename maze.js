// Pure maze generation and collision data. No rendering or browser dependency.
export const CELL_SIZE = 3;
export const WALL_HEIGHT = 3;
export const WALL_THICKNESS = 0.18;
export const PLAYER_RADIUS = 0.24;
export const DIRECTIONS = [
  { dx: 0, dz: -1, opposite: 2 },
  { dx: 1, dz: 0, opposite: 3 },
  { dx: 0, dz: 1, opposite: 0 },
  { dx: -1, dz: 0, opposite: 1 },
];

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), value | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMaze(width = 9, height = 9, seed = Date.now()) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new RangeError('Le labyrinthe doit mesurer au moins 2 × 2 cases.');
  }
  const random = randomGenerator(seed);
  const cells = Array.from({ length: width * height }, (_, id) => ({
    id, x: id % width, z: Math.floor(id / width), walls: [true, true, true, true],
  }));
  const start = cells[(height - 1) * width];
  const seen = new Set([start.id]);
  const stack = [start];

  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = [];
    DIRECTIONS.forEach((direction, index) => {
      const x = current.x + direction.dx;
      const z = current.z + direction.dz;
      if (x >= 0 && x < width && z >= 0 && z < height && !seen.has(z * width + x)) {
        choices.push({ cell: cells[z * width + x], index });
      }
    });
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const next = choices[Math.floor(random() * choices.length)];
    current.walls[next.index] = false;
    next.cell.walls[DIRECTIONS[next.index].opposite] = false;
    seen.add(next.cell.id);
    stack.push(next.cell);
  }

  // Choose the most distant boundary cell, so the exit isn't next to the spawn.
  const distances = Array(cells.length).fill(-1);
  distances[start.id] = 0;
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    DIRECTIONS.forEach((direction, index) => {
      if (cell.walls[index]) return;
      const next = cells[(cell.z + direction.dz) * width + cell.x + direction.dx];
      if (distances[next.id] !== -1) return;
      distances[next.id] = distances[cell.id] + 1;
      queue.push(next);
    });
  }
  const boundary = cells.filter((cell) => cell.x === 0 || cell.z === 0 || cell.x === width - 1 || cell.z === height - 1);
  const exit = boundary.reduce((farthest, cell) => distances[cell.id] > distances[farthest.id] ? cell : farthest, start);
  const exitDirection = exit.z === 0 ? 0 : exit.x === width - 1 ? 1 : exit.z === height - 1 ? 2 : 3;

  const walls = [];
  const addWall = (x, z, sizeX, sizeZ) => {
    walls.push({ x, z, sizeX, sizeZ,
      minX: x - sizeX / 2, maxX: x + sizeX / 2,
      minZ: z - sizeZ / 2, maxZ: z + sizeZ / 2 });
  };
  cells.forEach((cell) => {
    const x = cell.x * CELL_SIZE;
    const z = cell.z * CELL_SIZE;
    if (cell.walls[0]) addWall(x, z - CELL_SIZE / 2, CELL_SIZE + WALL_THICKNESS, WALL_THICKNESS);
    if (cell.walls[3]) addWall(x - CELL_SIZE / 2, z, WALL_THICKNESS, CELL_SIZE + WALL_THICKNESS);
    if (cell.z === height - 1) addWall(x, z + CELL_SIZE / 2, CELL_SIZE + WALL_THICKNESS, WALL_THICKNESS);
    if (cell.x === width - 1) addWall(x + CELL_SIZE / 2, z, WALL_THICKNESS, CELL_SIZE + WALL_THICKNESS);
  });
  const firstDirection = start.walls.findIndex((wall) => !wall);
  return { width, height, seed, cells, walls, start, exit, exitDirection, distances,
    startYaw: -firstDirection * Math.PI / 2 };
}

export function cellAtPosition(maze, x, z) {
  const cx = Math.floor((x + CELL_SIZE / 2) / CELL_SIZE);
  const cz = Math.floor((z + CELL_SIZE / 2) / CELL_SIZE);
  if (cx < 0 || cz < 0 || cx >= maze.width || cz >= maze.height) return null;
  return maze.cells[cz * maze.width + cx];
}

export function moveWithCollisions(position, dx, dz, walls, radius = PLAYER_RADIUS) {
  // Resolve each axis separately, allowing the player to slide along a wall.
  let x = position.x + dx;
  for (const wall of walls) {
    if (position.z > wall.minZ - radius && position.z < wall.maxZ + radius &&
        x > wall.minX - radius && x < wall.maxX + radius) {
      x = dx > 0 ? Math.min(x, wall.minX - radius) : dx < 0 ? Math.max(x, wall.maxX + radius) : position.x;
    }
  }
  let z = position.z + dz;
  for (const wall of walls) {
    if (x > wall.minX - radius && x < wall.maxX + radius &&
        z > wall.minZ - radius && z < wall.maxZ + radius) {
      z = dz > 0 ? Math.min(z, wall.minZ - radius) : dz < 0 ? Math.max(z, wall.maxZ + radius) : position.z;
    }
  }
  return { x, z };
}
