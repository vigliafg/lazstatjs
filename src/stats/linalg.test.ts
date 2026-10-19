import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eigenSymmetric } from './linalg';

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

describe('eigenSymmetric', () => {
  it('solves a 2x2 matrix', () => {
    const result = eigenSymmetric([
      [2, 1],
      [1, 2],
    ]);
    close(result.values[0], 3);
    close(result.values[1], 1);
    // Eigenvectors are unit norm and orthogonal.
    const [v1, v2] = [result.vectors.map((row) => row[0]), result.vectors.map((row) => row[1])];
    close(Math.hypot(...v1), 1);
    close(Math.hypot(...v2), 1);
    close(v1[0] * v2[0] + v1[1] * v2[1], 0);
  });

  it('matches NumPy eigenvalues for a correlation matrix', () => {
    const result = eigenSymmetric([
      [1, 0.5, 0.2],
      [0.5, 1, 0.3],
      [0.2, 0.3, 1],
    ]);
    close(result.values[0], 1.68390863, 1e-8);
    close(result.values[1], 0.82893084, 1e-8);
    close(result.values[2], 0.48716053, 1e-8);
    // Reconstruction: sum_j λ_j v_ij v_kj = A_ik.
    const reconstruct = (i: number, k: number) =>
      result.values.reduce((sum, value, j) => sum + value * result.vectors[i][j] * result.vectors[k][j], 0);
    close(reconstruct(0, 0), 1);
    close(reconstruct(0, 1), 0.5);
    close(reconstruct(0, 2), 0.2);
    close(reconstruct(1, 2), 0.3);
  });
});
