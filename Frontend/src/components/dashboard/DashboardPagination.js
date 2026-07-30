import React from "react";

function DashboardPagination({ canGoPrevious, canGoNext, onPrevious, onNext }) {
  if (!canGoPrevious && !canGoNext) return null;

  return (
    <div className="pagination-controls" style={{ marginTop: "1rem" }}>
      {canGoPrevious && (
        <button onClick={onPrevious} style={{ marginRight: "10px" }}>
          Previous
        </button>
      )}
      {canGoNext && <button onClick={onNext}>Next</button>}
    </div>
  );
}

export default DashboardPagination;
