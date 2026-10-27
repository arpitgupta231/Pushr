"use client";
import { cn } from "@/lib/utils";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { BorderBeam } from "@/components/ui/border-beam";

const SidebarContext = createContext(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate: animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate
}) => {
  return (
    <SidebarProvider open={open}  setOpen={setOpen} animate={animate} >
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <>
      <div className="relative z-30 hidden w-[60px] shrink-0 md:my-4 md:ml-4 md:block md:h-[calc(100svh-2rem)]">
        <motion.div
          initial={false}
          className={cn(
            "absolute inset-y-0 left-0 flex w-[60px] shrink-0 flex-col border border-white/10 bg-linear-to-b from-zinc-900/70 via-zinc-950/75 to-zinc-950/90 px-4 py-4 shadow-2xl shadow-black/50 ring-1 ring-inset ring-white/[0.03] backdrop-blur-xl md:rounded-2xl",
            className
          )}
          animate={{
            width: animate ? (open ? "280px" : "60px") : "280px",
          }}
          transition={{ duration: 0.2, ease: "easeIn" }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          {...props}
        >
          <BorderBeam
            size={open ? 140 : 40}
            duration={8}
            borderWidth={2}
            borderRadius={16}
          />
          {children}
        </motion.div>
      </div>
    </>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className={cn(
          "flex h-12 w-full flex-row items-center justify-between border-b border-white/10 bg-zinc-950/80 px-4 backdrop-blur-xl md:hidden"
        )}
        {...props}
      >
        <div className="z-20 flex w-full justify-end">
          <IconMenu2
            className="h-5 w-5 cursor-pointer text-zinc-400 transition-colors duration-200 ease-in hover:text-green-400"
            onClick={() => setOpen(!open)}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed inset-0 z-[100] flex h-full w-full flex-col justify-between border-white/10 bg-zinc-950/95 p-6 backdrop-blur-2xl",
                className
              )}
            >
              <div
                className="absolute right-4 top-4 z-50 cursor-pointer rounded-lg p-2 text-zinc-400 transition-colors duration-200 ease-in hover:bg-white/5 hover:text-zinc-100"
                onClick={() => setOpen(!open)}
              >
                <IconX className="h-5 w-5" />
              </div>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export const SidebarText = ({ children, className, ...props }) => {
  const { open, animate } = useSidebar();
  return (
    <motion.span
      animate={{
        opacity: animate ? (open ? 1 : 0) : 1,
      }}
      className={cn(
        "whitespace-pre inline-block !p-0 !m-0 font-medium",
        className
      )}
      style={{
        display: animate ? (open ? "inline-block" : "none") : "inline-block",
      }}
      {...props}
    >
      {children}
    </motion.span>
  );
};

export const SidebarLink = ({
  link,
  className,
  active = false,
  itemRef,
  ...props
}) => {
  const { open, animate } = useSidebar();
  return (
    <a
      ref={itemRef}
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/sidebar relative z-10 flex items-center rounded-xl text-sm font-medium transition-colors duration-200 ease-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/30 [&>svg]:relative [&>svg]:z-10 [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0 [&>svg]:transition-colors [&>svg]:duration-200",
        active
          ? open
            ? "text-green-100 [&>svg]:text-green-400"
            : "[&>svg]:text-green-400 [&>svg]:drop-shadow-[0_0_6px_rgba(74,222,128,0.9)]"
          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100 active:bg-white/[0.07] [&>svg]:text-zinc-400 group-hover/sidebar:[&>svg]:text-green-400",
        open ? "gap-3 px-3 py-2" : "justify-center p-3",
        className
      )}
      {...props}
    >
      {link.icon}

      <motion.span
        initial={false}
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="inline-block truncate"
      >
        {link.label}
      </motion.span>
    </a>
  );
};
