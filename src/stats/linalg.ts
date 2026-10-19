/**
 * Dense linear algebra helpers shared by regression diagnostics and PCA.
 * The Jacobi method is enough for the small symmetric matrices used here
 * (a handful of predictors/components) and avoids a new dependency.
 */

export interface EigenResult {
  /** Eigenvalues sorted from largest to smallest. */
  values: number[];
  /** eigenvectors[i][j] = loading of variable i on component j (unit norm). */
  vectors: number[][];
}

export const eigenSymmetric = (
  input: number[][],
  tolerance = 1e-12,
  maxSweeps = 100
): EigenResult => {
  const n = input.length;
  if (n === 0) return { values: [], vectors: [] };
  if (input.some((row) => row.length !== n)) {
    throw new Error('eigenSymmetric expects a square matrix');
  }

  const a = input.map((row) => [...row]);
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    let p = 0;
    let q = 0;
    let largest = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const value = Math.abs(a[i][j]);
        if (value > largest) {
          largest = value;
          p = i;
          q = j;
        }
      }
    }
    if (largest < tolerance) break;

    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;

    for (let k = 0; k < n; k += 1) {
      if (k === p || k === q) continue;
      const akp = a[k][p];
      const akq = a[k][q];
      a[k][p] = c * akp - s * akq;
      a[p][k] = a[k][p];
      a[k][q] = s * akp + c * akq;
      a[q][k] = a[k][q];
    }

    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = 0;
    a[q][p] = 0;

    for (let k = 0; k < n; k += 1) {
      const vkp = v[k][p];
      const vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }

  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
  return {
    values: order.map((index) => a[index][index]),
    vectors: Array.from({ length: n }, (_, i) => order.map((index) => v[i][index])),
  };
};
