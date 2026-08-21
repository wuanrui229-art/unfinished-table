export function canShiftDiscussionLens(turnCount: number, castSize: number): boolean {
  if (!Number.isInteger(turnCount) || turnCount < 0) throw new Error("turn count must be a non-negative integer");
  if (!Number.isInteger(castSize) || castSize < 1 || castSize > 6) throw new Error("cast size must be an integer from 1 to 6");
  // A lens is available after enough substance has accumulated, not after a
  // roll call. One-person tables need one reply; larger tables need two.
  return turnCount >= Math.min(2, castSize);
}

export function nextDiscussionLens(currentIndex: number, lensCount: number): number {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(lensCount) || lensCount < 1) {
    throw new Error("discussion lens values must be valid integers");
  }
  return Math.min(Math.max(0, currentIndex) + 1, lensCount - 1);
}
