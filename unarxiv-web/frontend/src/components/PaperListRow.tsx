"use client";

import Link from "next/link";
import { audioUrl, isInProgress, formatAuthors, type Paper } from "@/lib/api";
import { useAudio } from "@/contexts/AudioContext";
import AudioFileIcon from "@/components/AudioFileIcon";
import FileIcon from "@/components/FileIcon";
import ProcessingFileIcon from "@/components/ProcessingFileIcon";

interface PaperListRowProps {
  paper: Paper;
  paperId: string;
  /** Content to render to the right of the title block (e.g. action buttons). */
  actions?: React.ReactNode;
  /** Additional content rendered below the title/authors block (e.g. NarrationProgress). */
  extra?: React.ReactNode;
  /** Whether this row is currently active in the audio player. */
  isActive?: boolean;
  /** Additional class names for the outer row container. */
  className?: string;
}

/**
 * Shared paper row layout: status icon → title/authors → slot for action buttons.
 * Used in DraggablePaperList, My Additions, and Listen History.
 */
export default function PaperListRow({
  paper,
  paperId,
  actions,
  extra,
  isActive = false,
  className = "",
}: PaperListRowProps) {
  const { state, actions: audioActions } = useAudio();
  const inProgress = isInProgress(paper.status);

  const handlePlay = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (state.paperId === paperId) {
      audioActions.togglePlay();
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent("playerbar-play", { detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } }));
      audioActions.loadPaper(paperId, paper.title, audioUrl(paperId));
    }
  };

  const iconColorClass =
    paper.status === "complete"
      ? "text-stone-500 hover:text-stone-700"
      : inProgress
      ? "text-purple-300"
      : "text-stone-400";

  const icon =
    paper.status === "complete" ? (
      <AudioFileIcon size={28} />
    ) : inProgress ? (
      <ProcessingFileIcon size={28} />
    ) : (
      <FileIcon size={28} />
    );

  const titleAuthors = (
    <>
      <span className="text-sm text-stone-800 line-clamp-2 md:truncate block">
        {paper.title || paperId}
      </span>
      {paper.authors && paper.authors.length > 0 && (
        <span className="text-2xs text-stone-500 truncate block">
          <span className="md:hidden">{formatAuthors(paper.authors, 1)}</span>
          <span className="hidden md:inline">{formatAuthors(paper.authors)}</span>
        </span>
      )}
      {extra}
    </>
  );

  return (
    <div
      className={`flex items-center gap-2 md:gap-3 px-4 md:px-5 py-3 transition-colors ${
        isActive ? "bg-blue-100" : "hover:bg-amber-50"
      } ${className}`}
    >
      <Link
        href={`/p?id=${paperId}`}
        className={`w-7 h-7 flex items-center justify-center transition-colors shrink-0 ${iconColorClass}`}
        title="View paper"
      >
        {icon}
      </Link>

      {paper.status === "complete" ? (
        <button onClick={handlePlay} className="flex-1 min-w-0 text-left cursor-pointer">
          {titleAuthors}
        </button>
      ) : (
        <Link href={`/p?id=${paperId}`} className="flex-1 min-w-0 text-left">
          {titleAuthors}
        </Link>
      )}

      {actions}
    </div>
  );
}
