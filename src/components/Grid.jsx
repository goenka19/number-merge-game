import React from 'react';
import Block from './Block';

const Grid = ({ grid, onColumnClick, isDropping, droppingBlock, mergingBlocks, isAIMode, ROWS, COLS }) => {
  const handleColumnClick = (col) => {
    if (!isDropping && !isAIMode) {
      onColumnClick(col);
    }
  };

  // Check if a cell is currently being merged (source cell)
  const isMergingSource = (row, col) => {
    if (!mergingBlocks) return false;
    return mergingBlocks.sources.some(s => s.row === row && s.col === col);
  };

  // Calculate cell position in pixels
  const getCellPosition = (row, col) => ({
    top: row * 60 + 30, // 60px per cell (55px + 5px gap), 30px for column numbers
    left: col * 60 + 5,  // 60px per cell (55px + 5px gap), 5px padding
  });

  return (
    <div className="grid-container">
      <div className="column-numbers">
        {Array(COLS).fill(null).map((_, col) => (
          <div key={col} className="column-number">
            {col + 1}
          </div>
        ))}
      </div>
      <div className="grid">
        {Array(COLS).fill(null).map((_, col) => (
          <div
            key={col}
            className="column"
            onClick={() => handleColumnClick(col)}
          >
            {Array(ROWS).fill(null).map((_, row) => (
              <div key={row} className="cell">
                {/* Hide the block if it's being merged */}
                <Block
                  value={isMergingSource(row, col) ? null : grid[row][col]}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Dropping block animation */}
      {droppingBlock && (
        <div
          className="dropping-block"
          style={{
            left: `${droppingBlock.col * 60 + 5}px`,
            animation: `drop 400ms ease-in forwards`,
            '--landing-row': droppingBlock.row,
          }}
        >
          <Block value={droppingBlock.value} isDropping />
        </div>
      )}

      {/* Merge animations */}
      {mergingBlocks && mergingBlocks.sources.map((source, idx) => {
        const sourcePos = getCellPosition(source.row, source.col);
        const targetPos = getCellPosition(mergingBlocks.target.row, mergingBlocks.target.col);
        const deltaX = targetPos.left - sourcePos.left;
        const deltaY = targetPos.top - sourcePos.top;

        return (
          <div
            key={`merge-${idx}`}
            className="merging-block"
            style={{
              top: `${sourcePos.top}px`,
              left: `${sourcePos.left}px`,
              '--merge-x': `${deltaX}px`,
              '--merge-y': `${deltaY}px`,
            }}
          >
            <Block value={source.value} />
          </div>
        );
      })}
    </div>
  );
};

export default Grid;
