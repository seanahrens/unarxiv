"use client";

import { useEffect, useState } from "react";
import { usePlaylist } from "@/contexts/PlaylistContext";

export default function FlyToPlaylist() {
  const { animatingPaperId, animationSourceRect } = usePlaylist();
  const [style, setStyle] = useState<React.CSSProperties>({ display: "none" });

  useEffect(() => {
    if (!animatingPaperId || !animationSourceRect) {
      setStyle({ display: "none" });
      return;
    }

    // Find the "My Playlist" button in the header
    const target = document.getElementById("playlist-nav-button");
    if (!target) {
      setStyle({ display: "none" });
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const startX = animationSourceRect.left + animationSourceRect.width / 2;
    const startY = animationSourceRect.top + animationSourceRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    // Start position
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

    // Animate to target after a frame
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

  if (!animatingPaperId) return null;

  return <div style={style} />;
}
