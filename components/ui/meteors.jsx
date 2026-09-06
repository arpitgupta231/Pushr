"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";

const PLACEHOLDER = { delay: "0s", duration: "5s" };

export const Meteors = ({
  number,
  className
}) => {
  const meteorCount = number || 20;

  // Math.random is impure, so it cannot run during render (react-hooks/purity).
  // The delay/duration are per-meteor random values written directly to the DOM
  // (an external system) inside an effect, keeping render pure and avoiding
  // server/client hydration mismatches.
  const nodeRefs = useRef([]);

  useEffect(() => {
    Array.from({ length: meteorCount }).forEach((_, i) => {
      const el = nodeRefs.current[i];
      if (el) {
        el.style.animationDelay = Math.random() * 5 + "s";
        el.style.animationDuration = Math.floor(Math.random() * (10 - 5) + 5) + "s";
      }
    });
  }, [meteorCount]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}>
      {Array.from({ length: meteorCount }, (_, idx) => {
        const position = idx * (80 / meteorCount) - 40;
        return (
          <span
            key={"meteor" + idx}
            ref={(el) => {
              nodeRefs.current[idx] = el;
            }}
            className={cn(
              "animate-meteor-effect absolute h-0.5 w-0.5 rounded-[9999px] bg-slate-500 shadow-[0_0_0_1px_#ffffff10]",
              "before:absolute before:top-1/2 before:h-[1px] before:w-[50px] before:-translate-y-[50%] before:transform before:bg-gradient-to-r before:from-[#64748b] before:to-transparent before:content-['']",
              className
            )}
            style={{
              top: "-40px",
              left: position + "%",
              animationDelay: (PLACEHOLDER.delay),
              animationDuration: (PLACEHOLDER.duration),
            }}></span>
        );
      })}
    </motion.div>
  );
};
