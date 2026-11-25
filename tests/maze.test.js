import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL_SIZE, DIRECTIONS, PLAYER_RADIUS, generateMaze, cellAtPosition, moveWithCollisions } from '../maze.js';

test('every maze is connected, with consistent shared walls and a distant exit', () => {
  for (let seed = 0; seed < 100; seed++) {
    const maze = generateMaze(9, 9, seed);
    assert.ok(maze.distances.every((distance) => distance >= 0));
    assert.ok(maze.distances[maze.exit.id] > 10);
    let connections = 0;
    for (const cell of maze.cells) {
      DIRECTIONS.forEach((direction, index) => {
        if (cell.walls[index]) return;
        const next = maze.cells[(cell.z + direction.dz) * maze.width + cell.x + direction.dx];
        assert.ok(next);
        assert.equal(next.walls[direction.opposite], false);
        connections++;
      });
    }
    assert.equal(connections / 2, maze.cells.length - 1);
  }
});

test('the same seed produces the same maze', () => {
  assert.deepEqual(generateMaze(9, 9, 42), generateMaze(9, 9, 42));
  assert.notDeepEqual(generateMaze(9, 9, 42).cells, generateMaze(9, 9, 43).cells);
});

test('all cell centers are walkable, and positions resolve to the right cell', () => {
  const maze = generateMaze(9, 9, 123);
  for (const cell of maze.cells) {
    const position = { x: cell.x * CELL_SIZE, z: cell.z * CELL_SIZE };
    assert.equal(cellAtPosition(maze, position.x, position.z), cell);
    assert.deepEqual(moveWithCollisions(position, 0, 0, maze.walls), position);
    for (const wall of maze.walls) {
      assert.ok(position.x <= wall.minX - PLAYER_RADIUS || position.x >= wall.maxX + PLAYER_RADIUS ||
        position.z <= wall.minZ - PLAYER_RADIUS || position.z >= wall.maxZ + PLAYER_RADIUS);
    }
  }
  assert.equal(cellAtPosition(maze, -10, -10), null);
});

test('collisions block movement into walls, but permit movement along them', () => {
  const wall = { minX: 1, maxX: 1.2, minZ: -5, maxZ: 5 };
  const blocked = moveWithCollisions({ x: 0.7, z: 0 }, 0.2, 0.3, [wall]);
  assert.equal(blocked.x, 1 - PLAYER_RADIUS);
  assert.equal(blocked.z, 0.3);
  const fromRight = moveWithCollisions({ x: 1.6, z: 0 }, -0.2, 0, [wall]);
  assert.equal(fromRight.x, 1.2 + PLAYER_RADIUS);
});

test('open passages allow travel to the adjacent cell', () => {
  const maze = generateMaze(9, 9, 88);
  for (const cell of maze.cells) {
    DIRECTIONS.forEach((direction, index) => {
      if (cell.walls[index]) return;
      let position = { x: cell.x * CELL_SIZE, z: cell.z * CELL_SIZE };
      for (let step = 0; step < 60; step++) {
        position = moveWithCollisions(position, direction.dx * 0.05, direction.dz * 0.05, maze.walls);
      }
      assert.ok(Math.abs(position.x - (cell.x + direction.dx) * CELL_SIZE) < 0.0001);
      assert.ok(Math.abs(position.z - (cell.z + direction.dz) * CELL_SIZE) < 0.0001);
    });
  }
});

test('invalid dimensions are rejected', () => {
  assert.throws(() => generateMaze(1, 9), RangeError);
  assert.throws(() => generateMaze(9, 1), RangeError);
  assert.throws(() => generateMaze(2.5, 9), RangeError);
});
