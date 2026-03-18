"use client";

import { useEffect, useState } from "react";
import { usePlaylist } from "@/contexts/PlaylistContext";

/** Find the first visible element with the given ID (handles duplicate IDs across collapsed/expanded views). */
function findVisibleElement(id: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`#${id}`);
  for (const el of els) {
    if (el.offsetParent !== null || el.getClientRects().length > 0) return el;
  }
  return els[0] || null;
}

export default function FlyToPlaylist() {
  const { animatingPaperId, animationSourceRect, removingPaperId, removeAnimationTargetRect } = usePlaylist();
  const [style, setStyle] = useState<React.CSSProperties>({ display: "none" });
  const [removeStyle, setRemoveStyle] = useState<React.CSSProperties>({ display: "none" });

  // Add animation: fly from source button → playlist nav button
  useEffect(() => {
    if (!animatingPaperId || !animationSourceRect) {
      setStyle({ display: "none" });
      return;
    }

    const target = findVisibleElement("player-playlist-button") || document.getElementById("playlist-nav-button");
    if (!target) {
      setStyle({ display: "none" });
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const startX = animationSourceRect.left + animationSourceRect.width / 2;
    const startY = animationSourceRect.top + animationSourceRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    setStyle({
      display: "block",
      position: "fixed",
      left: startX - 8,
      top: startY - 8,
      width: 16,
      height: 16,
      borderRadius: "50%",
      backgroundColor: "#44403c",
      opacity: 0.8,
      zIndex: 9999,
      transition: "none",
      pointerEvents: "none",
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setStyle({
          display: "block",
          position: "fixed",
          left: endX - 4,
          top: endY - 4,
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: "#44403c",
          opacity: 0,
          zIndex: 9999,
          transition: "all 450ms cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: "none",
        });
      });
    });
  }, [animatingPaperId, animationSourceRect]);

  // Remove animation: fly from playlist nav button → target button
  useEffect(() => {
    if (!removingPaperId || !removeAnimationTargetRect) {
      setRemoveStyle({ display: "none" });
      return;
    }

    const source = findVisibleElement("player-playlist-button") || document.getElementById("playlist-nav-button");
    if (!source) {
      setRemoveStyle({ display: "none" });
      return;
    }

    const sourceRect = source.getBoundingClientRect();
    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const endX = removeAnimationTargetRect.left + removeAnimationTargetRect.width / 2;
    const endY = removeAnimationTargetRect.top + removeAnimationTargetRect.height / 2;

    setRemoveStyle({
      display: "block",
      position: "fixed",
      left: startX - 4,
      top: startY - 4,
      width: 8,
      height: 8,
      borderRadius: "50%",
      backgroundColor: "#44403c",
      opacity: 0.8,
      zIndex: 9999,
      transition: "none",
      pointerEvents: "none",
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRemoveStyle({
          display: "block",
          position: "fixed",
          left: endX - 8,
          top: endY - 8,
          width: 16,
          height: 16,
          borderRadius: "50%",
          backgroundColor: "#44403c",
          opacity: 0,
          zIndex: 9999,
          transition: "all 450ms cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: "none",
        });
      });
    });
  }, [removingPaperId, removeAnimationTargetRect]);

  return (
    <>
      {animatingPaperId && <div style={style} />}
      {removingPaperId && <div style={removeStyle} />}
    </>
  );
}
