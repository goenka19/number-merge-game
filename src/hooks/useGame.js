import { useState, useCallback, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';

const ROWS = 8;
const COLS = 5;
const MAX_BLOCK_VALUE = 64;

// Create empty grid
const createEmptyGrid = () =>
  Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

// Get max value on the board
const getMaxValue = (grid) => {
  let max = 2;
  grid.forEach(row => {
    row.forEach(cell => {
      if (cell !== null && cell > max) max = cell;
    });
  });
  return max;
};

// Generate a random block value based on current board (max 64)
const generateBlockValue = (grid) => {
  const maxValue = Math.min(getMaxValue(grid), MAX_BLOCK_VALUE);

  // Early game: more variety with 2, 4, 8, and occasional 16
  if (maxValue <= 8) {
    const rand = Math.random();
    if (rand < 0.30) return 2;      // 30% chance
    if (rand < 0.60) return 4;      // 30% chance
    if (rand < 0.85) return 8;      // 25% chance
    return 16;                       // 15% chance
  }

  // Mid game: include up to current max, weighted distribution
  const possibleValues = [];
  const minMax = Math.min(maxValue, MAX_BLOCK_VALUE);

  for (let v = 2; v <= minMax; v *= 2) {
    possibleValues.push(v);
  }

  // Balanced weighting - smaller values slightly more common but not overwhelming
  const weighted = [];
  possibleValues.forEach((val, idx) => {
    // Weight: 3, 3, 2, 2, 1, 1... (more balanced than before)
    const weight = Math.max(1, 3 - Math.floor(idx / 2));
    for (let i = 0; i < weight; i++) {
      weighted.push(val);
    }
  });

  return weighted[Math.floor(Math.random() * weighted.length)];
};

// Check if grid is full
const isGridFull = (grid) => {
  return grid.every(row => row.every(cell => cell !== null));
};

// Check if any merges are possible
const canMerge = (grid) => {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[row][col] === null) continue;

      // Check right
      if (col < COLS - 1 && grid[row][col] === grid[row][col + 1]) {
        return true;
      }
      // Check down
      if (row < ROWS - 1 && grid[row][col] === grid[row + 1][col]) {
        return true;
      }
    }
  }
  return false;
};

// Check for straight-line triple merge (3 tiles of same value in a row or column)
// Returns the cells to clear and the position where the merged value should go
const findTripleMerge = (grid, dropCol, dropRow) => {
  const value = grid[dropRow][dropCol];
  if (value === null) return null;

  // Check horizontal triple (dropped block in the middle)
  if (dropCol > 0 && dropCol < COLS - 1) {
    const left = grid[dropRow][dropCol - 1];
    const right = grid[dropRow][dropCol + 1];
    if (left === value && right === value) {
      return {
        cells: [[dropRow, dropCol - 1], [dropRow, dropCol], [dropRow, dropCol + 1]],
        resultRow: dropRow,
        resultCol: dropCol,
        newValue: value * 4
      };
    }
  }

  // Check vertical triple (dropped block in the middle)
  if (dropRow > 0 && dropRow < ROWS - 1) {
    const above = grid[dropRow - 1][dropCol];
    const below = grid[dropRow + 1][dropCol];
    if (above === value && below === value) {
      return {
        cells: [[dropRow - 1, dropCol], [dropRow, dropCol], [dropRow + 1, dropCol]],
        resultRow: dropRow,
        resultCol: dropCol,
        newValue: value * 4
      };
    }
  }

  // Check horizontal triple (dropped block on the left)
  if (dropCol < COLS - 2) {
    const mid = grid[dropRow][dropCol + 1];
    const right = grid[dropRow][dropCol + 2];
    if (mid === value && right === value) {
      return {
        cells: [[dropRow, dropCol], [dropRow, dropCol + 1], [dropRow, dropCol + 2]],
        resultRow: dropRow,
        resultCol: dropCol,
        newValue: value * 4
      };
    }
  }

  // Check horizontal triple (dropped block on the right)
  if (dropCol > 1) {
    const mid = grid[dropRow][dropCol - 1];
    const left = grid[dropRow][dropCol - 2];
    if (mid === value && left === value) {
      return {
        cells: [[dropRow, dropCol - 2], [dropRow, dropCol - 1], [dropRow, dropCol]],
        resultRow: dropRow,
        resultCol: dropCol,
        newValue: value * 4
      };
    }
  }

  // Check vertical triple (dropped block on top)
  if (dropRow < ROWS - 2) {
    const mid = grid[dropRow + 1][dropCol];
    const below = grid[dropRow + 2][dropCol];
    if (mid === value && below === value) {
      return {
        cells: [[dropRow, dropCol], [dropRow + 1, dropCol], [dropRow + 2, dropCol]],
        resultRow: dropRow,
        resultCol: dropCol,
        newValue: value * 4
      };
    }
  }

  // Check vertical triple (dropped block on bottom)
  if (dropRow > 1) {
    const mid = grid[dropRow - 1][dropCol];
    const above = grid[dropRow - 2][dropCol];
    if (mid === value && above === value) {
      return {
        cells: [[dropRow - 2, dropCol], [dropRow - 1, dropCol], [dropRow, dropCol]],
        resultRow: dropRow,
        resultCol: dropCol,
        newValue: value * 4
      };
    }
  }

  return null;
};

// Check for L-shaped merge pattern (3 tiles of same value in L or inverse L shape)
// Returns the cells to clear and the position where the merged value should go
const findLShapeMerge = (grid, dropCol, dropRow) => {
  const value = grid[dropRow][dropCol];
  if (value === null) return null;

  // Check all possible L-shapes that include the dropped position
  const lPatterns = [
    // L shapes with corner at dropped position
    [[0, 0], [0, 1], [1, 0]],   // corner top-left
    [[0, 0], [0, -1], [1, 0]],  // corner top-right
    [[0, 0], [0, 1], [-1, 0]],  // corner bottom-left
    [[0, 0], [0, -1], [-1, 0]], // corner bottom-right
    // L shapes where dropped position is on the horizontal arm
    [[0, 0], [0, 1], [-1, 1]],  // dropped is left of horizontal, corner goes up
    [[0, 0], [0, 1], [1, 1]],   // dropped is left of horizontal, corner goes down
    [[0, 0], [0, -1], [-1, -1]], // dropped is right of horizontal, corner goes up
    [[0, 0], [0, -1], [1, -1]], // dropped is right of horizontal, corner goes down
    // L shapes where dropped position is on the vertical arm
    [[0, 0], [1, 0], [1, 1]],   // dropped is top of vertical, corner goes right
    [[0, 0], [1, 0], [1, -1]],  // dropped is top of vertical, corner goes left
    [[0, 0], [-1, 0], [-1, 1]], // dropped is bottom of vertical, corner goes right
    [[0, 0], [-1, 0], [-1, -1]], // dropped is bottom of vertical, corner goes left
  ];

  for (const pattern of lPatterns) {
    const cells = pattern.map(([dr, dc]) => [dropRow + dr, dropCol + dc]);

    // Check if all cells are valid and have the same value
    const allMatch = cells.every(([r, c]) =>
      r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === value
    );

    if (allMatch) {
      // Return cells to merge, with the result going to the dropped position
      return {
        cells: cells,
        resultRow: dropRow,
        resultCol: dropCol,
        newValue: value * 4  // 3-tile L merge creates 4x value
      };
    }
  }

  return null;
};

// Get the landing row for a column
// Returns -1 if column is full but top matches (can still merge)
// Returns -2 if column is full and no match possible
const getLandingRow = (grid, col, nextBlockValue) => {
  for (let row = 0; row < ROWS; row++) {
    if (grid[row][col] !== null) {
      if (row === 0) {
        // Column is full - check if top block matches for potential merge
        if (grid[0][col] === nextBlockValue) {
          return -1; // Special case: can merge with top
        }
        return -2; // Column full, no merge possible
      }
      return row - 1;
    }
  }
  return ROWS - 1;
};

export const useGame = () => {
  const [grid, setGrid] = useState(createEmptyGrid);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('numberMergeHighScore');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [nextBlock, setNextBlock] = useState(2);
  const [nextNextBlock, setNextNextBlock] = useState(() => generateBlockValue(createEmptyGrid()));
  const [gameOver, setGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [droppingBlock, setDroppingBlock] = useState(null);
  const [mergingBlocks, setMergingBlocks] = useState(null); // { sources: [{row, col, value}], target: {row, col}, newValue }
  const [isAIMode, setIsAIMode] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  // Track if score has been saved for current game (to avoid duplicate saves)
  const [scoreSaved, setScoreSaved] = useState(false);

  // Subscribe to Firestore leaderboard (real-time updates)
  useEffect(() => {
    const leaderboardRef = collection(db, 'leaderboard');
    const q = query(leaderboardRef, orderBy('score', 'desc'), limit(10));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert Firestore timestamp to ISO string if present
        date: doc.data().date?.toDate?.()?.toISOString() || doc.data().date
      }));
      setLeaderboard(entries);
    }, (error) => {
      console.error('Error fetching leaderboard:', error);
    });

    return () => unsubscribe();
  }, []);

  // Update high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('numberMergeHighScore', score.toString());
    }
  }, [score, highScore]);

  // Function to save score to leaderboard (writes to Firestore)
  const saveScoreToLeaderboard = useCallback(async (scoreToSave, playerName, isAI) => {
    if (scoreToSave <= 0 || scoreSaved) return;

    // Check if score would qualify for top 10
    const wouldQualify = leaderboard.length < 10 || scoreToSave > (leaderboard[leaderboard.length - 1]?.score || 0);
    if (!wouldQualify && leaderboard.length >= 10) {
      setScoreSaved(true);
      return;
    }

    try {
      const leaderboardRef = collection(db, 'leaderboard');
      await addDoc(leaderboardRef, {
        name: isAI ? 'AI' : (playerName || 'Anonymous'),
        score: scoreToSave,
        isAI: isAI,
        date: serverTimestamp(),
      });
      setScoreSaved(true);
    } catch (error) {
      console.error('Error saving score:', error);
    }
  }, [scoreSaved, leaderboard]);

  // Perform merges with animation delay between each step
  // Returns { grid, scoreGained } where scoreGained is the total points from all merges
  const performMergesAnimated = useCallback(async (initialGrid, dropCol, dropRow) => {
    let currentGrid = initialGrid.map(row => [...row]);
    let activeCol = dropCol;
    let activeRow = dropRow;
    let totalScoreGained = 0;

    const applyGravity = (grid) => {
      const newGrid = grid.map(row => [...row]);
      for (let col = 0; col < COLS; col++) {
        const column = [];
        for (let row = 0; row < ROWS; row++) {
          if (newGrid[row][col] !== null) {
            column.push(newGrid[row][col]);
          }
        }
        for (let row = ROWS - 1; row >= 0; row--) {
          const idx = column.length - (ROWS - row);
          newGrid[row][col] = idx >= 0 ? column[idx] : null;
        }
      }
      return newGrid;
    };

    // Find where a specific value landed in a column after gravity
    const findValueInColumn = (grid, col, value) => {
      for (let row = ROWS - 1; row >= 0; row--) {
        if (grid[row][col] === value) {
          return row;
        }
      }
      return -1;
    };

    // Find any vertical merge anywhere on the board (prioritize bottom rows)
    const findAnyVerticalMerge = (grid) => {
      for (let col = 0; col < COLS; col++) {
        for (let row = ROWS - 1; row > 0; row--) {
          if (grid[row][col] !== null && grid[row][col] === grid[row - 1][col]) {
            return { row, col, value: grid[row][col] };
          }
        }
      }
      return null;
    };

    // Find any horizontal merge anywhere on the board (prioritize bottom rows)
    const findAnyHorizontalMerge = (grid) => {
      for (let row = ROWS - 1; row >= 0; row--) {
        for (let col = 0; col < COLS - 1; col++) {
          if (grid[row][col] !== null && grid[row][col] === grid[row][col + 1]) {
            return { row, col, value: grid[row][col] };
          }
        }
      }
      return null;
    };

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const MERGE_ANIMATION_TIME = 250;

    let continueLoop = true;
    while (continueLoop) {
      continueLoop = false;

      // PRIORITY 1: Check for triple merge (3 in a line) at active position
      if (activeRow >= 0 && activeCol >= 0 && currentGrid[activeRow]?.[activeCol] !== null) {
        const tripleMerge = findTripleMerge(currentGrid, activeCol, activeRow);
        if (tripleMerge) {
          const value = currentGrid[activeRow][activeCol];
          const newValue = tripleMerge.newValue;

          // Filter out the target cell from sources
          const sourceCells = tripleMerge.cells.filter(([r, c]) =>
            !(r === activeRow && c === activeCol)
          );

          // Animate: other cells move to the active position
          setMergingBlocks({
            sources: sourceCells.map(([r, c]) => ({ row: r, col: c, value })),
            target: { row: activeRow, col: activeCol },
            newValue: newValue
          });
          await delay(MERGE_ANIMATION_TIME);

          // Apply: clear all cells, place new value at active position
          for (const [r, c] of tripleMerge.cells) {
            currentGrid[r][c] = null;
          }
          currentGrid[activeRow][activeCol] = newValue;
          setMergingBlocks(null);
          setGrid([...currentGrid.map(row => [...row])]);

          // Add merged value to score
          totalScoreGained += newValue;

          // Apply gravity
          currentGrid = applyGravity(currentGrid);
          setGrid([...currentGrid.map(row => [...row])]);
          await delay(100);

          // Track where the new value landed
          activeRow = findValueInColumn(currentGrid, activeCol, newValue);
          continueLoop = true;
          continue;
        }
      }

      // PRIORITY 2: Check for L-shaped merge at active position
      if (activeRow >= 0 && activeCol >= 0 && currentGrid[activeRow]?.[activeCol] !== null) {
        const lMerge = findLShapeMerge(currentGrid, activeCol, activeRow);
        if (lMerge) {
          const value = currentGrid[activeRow][activeCol];
          const newValue = lMerge.newValue;

          // Filter out the target cell (drop position) from sources
          const sourceCells = lMerge.cells.filter(([r, c]) =>
            !(r === activeRow && c === activeCol)
          );

          // Animate: other cells move to the active position
          setMergingBlocks({
            sources: sourceCells.map(([r, c]) => ({ row: r, col: c, value })),
            target: { row: activeRow, col: activeCol },
            newValue: newValue
          });
          await delay(MERGE_ANIMATION_TIME);

          // Apply: clear all L cells, place new value at active position
          for (const [r, c] of lMerge.cells) {
            currentGrid[r][c] = null;
          }
          currentGrid[activeRow][activeCol] = newValue;
          setMergingBlocks(null);
          setGrid([...currentGrid.map(row => [...row])]);

          // Add merged value to score
          totalScoreGained += newValue;

          // Apply gravity
          currentGrid = applyGravity(currentGrid);
          setGrid([...currentGrid.map(row => [...row])]);
          await delay(100);

          // Track where the new value landed
          activeRow = findValueInColumn(currentGrid, activeCol, newValue);
          continueLoop = true;
          continue;
        }
      }

      // PRIORITY 3: Check for horizontal merge at active position
      if (activeRow >= 0 && activeCol >= 0 && currentGrid[activeRow]?.[activeCol] !== null) {
        const value = currentGrid[activeRow][activeCol];
        let horizontalMerge = null;

        // Check left neighbor
        if (activeCol > 0 && currentGrid[activeRow][activeCol - 1] === value) {
          horizontalMerge = { sourceCol: activeCol - 1, targetCol: activeCol };
        }
        // Check right neighbor
        else if (activeCol < COLS - 1 && currentGrid[activeRow][activeCol + 1] === value) {
          horizontalMerge = { sourceCol: activeCol + 1, targetCol: activeCol };
        }

        if (horizontalMerge) {
          const newValue = value * 2;

          setMergingBlocks({
            sources: [{ row: activeRow, col: horizontalMerge.sourceCol, value }],
            target: { row: activeRow, col: horizontalMerge.targetCol },
            newValue: newValue
          });
          await delay(MERGE_ANIMATION_TIME);

          currentGrid[activeRow][horizontalMerge.targetCol] = newValue;
          currentGrid[activeRow][horizontalMerge.sourceCol] = null;
          setMergingBlocks(null);
          setGrid([...currentGrid.map(row => [...row])]);

          // Add merged value to score
          totalScoreGained += newValue;

          // Apply gravity
          currentGrid = applyGravity(currentGrid);
          setGrid([...currentGrid.map(row => [...row])]);
          await delay(100);

          // Track the new value position
          activeRow = findValueInColumn(currentGrid, activeCol, newValue);
          continueLoop = true;
          continue;
        }
      }

      // PRIORITY 4: Check for vertical merge at active position
      if (activeRow >= 0 && activeCol >= 0 && currentGrid[activeRow]?.[activeCol] !== null) {
        const value = currentGrid[activeRow][activeCol];

        // Check if block below has same value
        if (activeRow < ROWS - 1 && currentGrid[activeRow + 1][activeCol] === value) {
          const newValue = value * 2;
          const targetRow = activeRow + 1;

          setMergingBlocks({
            sources: [{ row: activeRow, col: activeCol, value }],
            target: { row: targetRow, col: activeCol },
            newValue: newValue
          });
          await delay(MERGE_ANIMATION_TIME);

          currentGrid[targetRow][activeCol] = newValue;
          currentGrid[activeRow][activeCol] = null;
          setMergingBlocks(null);
          setGrid([...currentGrid.map(row => [...row])]);

          // Add merged value to score
          totalScoreGained += newValue;

          // Apply gravity
          currentGrid = applyGravity(currentGrid);
          setGrid([...currentGrid.map(row => [...row])]);
          await delay(100);

          // Track the new position
          activeRow = targetRow;
          continueLoop = true;
          continue;
        }

        // Check if block above has same value
        if (activeRow > 0 && currentGrid[activeRow - 1][activeCol] === value) {
          const newValue = value * 2;

          setMergingBlocks({
            sources: [{ row: activeRow - 1, col: activeCol, value }],
            target: { row: activeRow, col: activeCol },
            newValue: newValue
          });
          await delay(MERGE_ANIMATION_TIME);

          currentGrid[activeRow][activeCol] = newValue;
          currentGrid[activeRow - 1][activeCol] = null;
          setMergingBlocks(null);
          setGrid([...currentGrid.map(row => [...row])]);

          // Add merged value to score
          totalScoreGained += newValue;

          // Apply gravity
          currentGrid = applyGravity(currentGrid);
          setGrid([...currentGrid.map(row => [...row])]);
          await delay(100);

          // Track the new value position
          activeRow = findValueInColumn(currentGrid, activeCol, newValue);
          continueLoop = true;
          continue;
        }
      }

      // PRIORITY 5: Check for any vertical merge ANYWHERE on the board
      // (this catches merges caused by gravity after L-merges in other columns)
      const anyVertical = findAnyVerticalMerge(currentGrid);
      if (anyVertical) {
        const { row, col, value } = anyVertical;
        const newValue = value * 2;

        setMergingBlocks({
          sources: [{ row: row - 1, col, value }],
          target: { row, col },
          newValue: newValue
        });
        await delay(MERGE_ANIMATION_TIME);

        currentGrid[row][col] = newValue;
        currentGrid[row - 1][col] = null;
        setMergingBlocks(null);
        setGrid([...currentGrid.map(row => [...row])]);

        // Add merged value to score
        totalScoreGained += newValue;

        // Apply gravity
        currentGrid = applyGravity(currentGrid);
        setGrid([...currentGrid.map(row => [...row])]);
        await delay(100);

        // Update active position to track this new merge
        activeCol = col;
        activeRow = row;
        continueLoop = true;
        continue;
      }

      // PRIORITY 6: Check for any horizontal merge ANYWHERE on the board
      const anyHorizontal = findAnyHorizontalMerge(currentGrid);
      if (anyHorizontal) {
        const { row, col, value } = anyHorizontal;
        const newValue = value * 2;

        // Merge right block into left block
        setMergingBlocks({
          sources: [{ row, col: col + 1, value }],
          target: { row, col },
          newValue: newValue
        });
        await delay(MERGE_ANIMATION_TIME);

        currentGrid[row][col] = newValue;
        currentGrid[row][col + 1] = null;
        setMergingBlocks(null);
        setGrid([...currentGrid.map(row => [...row])]);

        // Add merged value to score
        totalScoreGained += newValue;

        // Apply gravity
        currentGrid = applyGravity(currentGrid);
        setGrid([...currentGrid.map(row => [...row])]);
        await delay(100);

        // Update active position
        activeCol = col;
        activeRow = row;
        continueLoop = true;
        continue;
      }
    }

    return { grid: currentGrid, scoreGained: totalScoreGained };
  }, []);

  // AI: Enhanced logic with second-order effects and structure optimization
  const findBestColumnV2 = useCallback((currentGrid, blockValue, nextBlockValue) => {
    let bestCol = -1;
    let bestScore = -Infinity;

    // Helper: get value at position safely
    const getVal = (grid, r, c) => {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
      return grid[r]?.[c] ?? null;
    };

    // Helper: check if placing creates unwanted horizontal merge
    const checkHorizontalMergeDisruption = (grid, row, col, value) => {
      const left = getVal(grid, row, col - 1);
      const right = getVal(grid, row, col + 1);

      if (left === value || right === value) {
        const below = getVal(grid, row + 1, col);
        if (below !== null && value * 2 > below) {
          return -40; // Merged value bigger than what's below
        }
        const mergedCol = left === value ? col - 1 : col + 1;
        const belowMerged = getVal(grid, row + 1, mergedCol);
        if (belowMerged !== null && belowMerged < value) {
          return -30; // Disrupts structure
        }
      }
      return 0;
    };

    // Helper: evaluate column structure (bigger numbers at bottom)
    const evaluateColumnStructure = (grid, col) => {
      let structureScore = 0;
      let prevValue = Infinity;
      for (let row = ROWS - 1; row >= 0; row--) {
        const val = getVal(grid, row, col);
        if (val === null) break;
        if (val <= prevValue) {
          structureScore += 10;
        } else {
          structureScore -= 20;
        }
        prevValue = val;
      }
      return structureScore;
    };

    for (let col = 0; col < COLS; col++) {
      const landingRow = getLandingRow(currentGrid, col, blockValue);
      if (landingRow === -2) continue;

      let score = 0;
      const effectiveRow = landingRow === -1 ? 0 : landingRow;

      // === CORE MERGE SCORING ===
      if (landingRow >= 0 && effectiveRow < ROWS - 1 && currentGrid[effectiveRow + 1][col] === blockValue) {
        score += 120;
        const below2 = getVal(currentGrid, effectiveRow + 2, col);
        if (below2 === null || blockValue * 2 <= below2) {
          score += 30;
        }
      }

      if (landingRow === -1) {
        score += 80;
      }

      // === STRUCTURE SCORING (smaller on top of bigger) ===
      const valueBelow = getVal(currentGrid, effectiveRow + 1, col);
      if (valueBelow !== null) {
        if (blockValue <= valueBelow) {
          score += 40;
        } else {
          score -= 60;
        }
      }

      // === HORIZONTAL MERGE ANALYSIS ===
      const leftVal = getVal(currentGrid, effectiveRow, col - 1);
      const rightVal = getVal(currentGrid, effectiveRow, col + 1);

      if (leftVal === blockValue || rightVal === blockValue) {
        score += checkHorizontalMergeDisruption(currentGrid, effectiveRow, col, blockValue);

        const mergedValue = blockValue * 2;
        const belowMergeTarget = getVal(currentGrid, effectiveRow + 1, col);
        if (belowMergeTarget !== null && mergedValue <= belowMergeTarget) {
          score += 50;
        } else if (belowMergeTarget !== null) {
          score -= 20;
        }
      }

      // === SECOND ORDER EFFECTS: Consider next block ===
      if (nextBlockValue) {
        const simGrid = currentGrid.map(row => [...row]);
        if (landingRow >= 0) {
          simGrid[effectiveRow][col] = blockValue;
        }

        let nextBlockBestScore = -Infinity;
        for (let nextCol = 0; nextCol < COLS; nextCol++) {
          const nextLanding = getLandingRow(simGrid, nextCol, nextBlockValue);
          if (nextLanding === -2) continue;

          const nextEffRow = nextLanding === -1 ? 0 : nextLanding;
          let nextScore = 0;

          if (nextLanding >= 0 && nextEffRow < ROWS - 1 && simGrid[nextEffRow + 1][nextCol] === nextBlockValue) {
            nextScore += 50;
          }

          const nextBelow = getVal(simGrid, nextEffRow + 1, nextCol);
          if (nextBelow !== null && nextBlockValue <= nextBelow) {
            nextScore += 20;
          }

          nextBlockBestScore = Math.max(nextBlockBestScore, nextScore);
        }

        score += nextBlockBestScore * 0.3;
      }

      // === POSITION PREFERENCES ===
      score += effectiveRow * 3;
      const centerDistance = Math.abs(col - Math.floor(COLS / 2));
      score -= centerDistance;

      if (ROWS - effectiveRow > ROWS - 2) {
        score -= 50;
      }

      // === L-SHAPE MERGE POTENTIAL ===

      const neighbors = [
        [effectiveRow - 1, col], [effectiveRow + 1, col],
        [effectiveRow, col - 1], [effectiveRow, col + 1]
      ];
      let matchingNeighbors = 0;
      for (const [r, c] of neighbors) {
        if (getVal(currentGrid, r, c) === blockValue) {
          matchingNeighbors++;
        }
      }
      if (matchingNeighbors >= 2) {
        score += 80; // Potential L-shape (creates 4x value)
      }

      // === EVALUATE OVERALL COLUMN STRUCTURE ===
      score += evaluateColumnStructure(currentGrid, col) * 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestCol = col;
      }
    }

    // If no good move found, pick first available column
    if (bestCol === -1) {
      for (let col = 0; col < COLS; col++) {
        if (getLandingRow(currentGrid, col, blockValue) !== -2) {
          return col;
        }
      }
    }

    return bestCol;
  }, []);

  const dropBlock = useCallback((col) => {
    if (gameOver || isPaused || isDropping) return;

    const landingRow = getLandingRow(grid, col, nextBlock);
    if (landingRow === -2) return; // Column is full with no merge possible

    // Capture current block value before shifting
    const droppedValue = nextBlock;

    // Immediately shift preview blocks (no animation)
    setNextBlock(nextNextBlock);
    setNextNextBlock(generateBlockValue(grid));

    setIsDropping(true);

    // For full column merge, animate to row 0
    const animationRow = landingRow === -1 ? 0 : landingRow;
    setDroppingBlock({ col, row: animationRow, value: droppedValue });

    // Simulate drop animation delay
    setTimeout(async () => {
      let newGrid = grid.map(row => [...row]);
      let immediateScoreGain = 0;

      if (landingRow === -1) {
        // Special case: merge with top block immediately
        const mergedValue = newGrid[0][col] * 2;
        newGrid[0][col] = mergedValue;
        immediateScoreGain = mergedValue; // Add merged value to score
      } else {
        newGrid[landingRow][col] = droppedValue;
      }

      setGrid([...newGrid]);
      setDroppingBlock(null);

      // Small delay before chain reactions start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Perform animated chain merges
      const actualDropRow = landingRow === -1 ? 0 : landingRow;
      const { grid: mergedGrid, scoreGained } = await performMergesAnimated(newGrid, col, actualDropRow);

      // Add score from all merges (immediate merge + chain merges)
      const totalScoreGain = immediateScoreGain + scoreGained;
      if (totalScoreGain > 0) {
        setScore(prev => prev + totalScoreGain);
      }

      // Check game over
      if (isGridFull(mergedGrid) && !canMerge(mergedGrid)) {
        setGameOver(true);
      }

      setIsDropping(false);
    }, 400);
  }, [grid, nextBlock, nextNextBlock, gameOver, isPaused, isDropping, performMergesAnimated]);

  const restart = useCallback(() => {
    const emptyGrid = createEmptyGrid();
    setGrid(emptyGrid);
    setScore(0);
    setGameOver(false);
    setIsPaused(false);
    setNextBlock(2);
    setNextNextBlock(generateBlockValue(emptyGrid));
    setIsDropping(false);
    setDroppingBlock(null);
    setMergingBlocks(null);
    setIsAIMode(false);
    setScoreSaved(false); // Reset for new game
  }, []);

  const togglePause = useCallback(() => {
    if (!gameOver) {
      setIsPaused(prev => !prev);
    }
  }, [gameOver]);

  const toggleAIMode = useCallback(() => {
    setIsAIMode(prev => !prev);
    if (isPaused) {
      setIsPaused(false);
    }
  }, [isPaused]);


  // Note: clearLeaderboard is disabled for global leaderboard
  // Keep the function to avoid breaking the interface
  const clearLeaderboard = useCallback(() => {
    // Disabled - global leaderboard cannot be cleared by users
    console.log('Clear leaderboard is disabled for global leaderboard');
  }, []);

  // AI auto-play effect (always uses best AI - v2)
  useEffect(() => {
    if (!isAIMode || gameOver || isPaused || isDropping) return;

    const aiDelay = setTimeout(() => {
      const bestCol = findBestColumnV2(grid, nextBlock, nextNextBlock);
      if (bestCol !== -1) {
        dropBlock(bestCol);
      }
    }, 600); // Delay between AI moves for visibility

    return () => clearTimeout(aiDelay);
  }, [isAIMode, gameOver, isPaused, isDropping, grid, nextBlock, nextNextBlock, findBestColumnV2, dropBlock]);

  return {
    grid,
    score,
    highScore,
    nextBlock,
    nextNextBlock,
    gameOver,
    isPaused,
    isDropping,
    droppingBlock,
    mergingBlocks,
    isAIMode,
    leaderboard,
    dropBlock,
    restart,
    togglePause,
    toggleAIMode,
    clearLeaderboard,
    saveScoreToLeaderboard,
    ROWS,
    COLS,
  };
};
