"use client";;
import React, { useState, useEffect } from "react";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as: Tag = "button",
  duration = 1,
  clockwise = true,
  ...props
}) {
  const [hovered, setHovered] = useState(false);
  const [direction, setDirection] = useState("TOP");

  const rotateDirection = currentDirection => {
    const directions = ["TOP", "LEFT", "BOTTOM", "RIGHT"];
    const currentIndex = directions.indexOf(currentDirection);
    const nextIndex = clockwise
      ? (currentIndex - 1 + directions.length) % directions.length
      : (currentIndex + 1) % directions.length;
    return directions[nextIndex];
  };

  const movingMap = {
    TOP: "radial-gradient(20.7% 50% at 50% 0%, #15803d 0%, rgba(0, 0, 0, 0) 100%)",
    LEFT: "radial-gradient(16.6% 43.1% at 0% 50%, #16a34a 0%, rgba(0, 0, 0, 0) 100%)",
    BOTTOM:
      "radial-gradient(20.7% 50% at 50% 100%, #15803d 0%, rgba(0, 0, 0, 0) 100%)",
    RIGHT:
      "radial-gradient(16.2% 41.2% at 100% 50%, #16a34a 0%, rgba(0, 0, 0, 0) 100%)",
  };

  const highlight =
    "radial-gradient(75% 181.15942028985506% at 50% 50%, #22c55e 0%, rgba(0, 0, 0, 0) 100%)";

  useEffect(() => {
    if (!hovered) {
      const interval = setInterval(() => {
        setDirection((prevState) => rotateDirection(prevState));
      }, duration * 1000);
      return () => clearInterval(interval);
    }
  }, [hovered]);
  return (
    <Tag
      onMouseEnter={(event) => {
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex rounded-full border border-white/10 content-center bg-zinc-950/60 hover:border-green-400/50 transition-[background-color,border-color,box-shadow] duration-200 ease-out hover:ease-in shadow-[0_0_10px_-6px_rgba(34,197,94,0.4)] hover:shadow-[0_0_18px_-4px_rgba(74,222,128,0.35)] items-center flex-col flex-nowrap gap-10 h-min justify-center overflow-visible p-1 decoration-clone w-fit cursor-pointer",
        containerClassName
      )}
      {...props}>
      <div
        className={cn("w-auto text-zinc-400 z-10 bg-zinc-900/60 px-4 py-2 rounded-[inherit] transition-colors duration-200 ease-out hover:text-zinc-200 hover:ease-in", className)}>
        {children}
      </div>
      <motion.div
        className={cn("flex-none inset-0 overflow-hidden absolute z-0 rounded-[inherit]")}
        style={{
          filter: "blur(2px)",
          position: "absolute",
          width: "100%",
          height: "100%",
        }}
        initial={{ background: movingMap[direction] }}
        animate={{ background: movingMap[direction] }}
        transition={{ ease: "linear", duration }} />
      <motion.div
        className={cn("flex-none inset-0 overflow-hidden absolute z-0 rounded-[inherit]")}
        style={{
          background: highlight,
          position: "absolute",
          width: "100%",
          height: "100%",
        }}
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.2, ease: hovered ? "easeIn" : "easeOut" }} />
      <div className="bg-zinc-950 absolute z-1 flex-none inset-[6px] rounded-[100px]" />
    </Tag>
  );
}
