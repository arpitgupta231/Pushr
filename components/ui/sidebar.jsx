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
      <motion.div
        className={cn(
          "hidden md:flex md:flex-col md:my-4 md:ml-4 md:h-[calc(100svh-2rem)] md:rounded-2xl px-4 py-4 bg-zinc-950 border border-white/10 shadow-2xl shadow-black/40 w-[320px] shrink-0 relative",
          className
        )}
        animate={{
          width: animate ? (open ? "320px" : "60px") : "320px",
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        {...props}
      >
        <BorderBeam
          size={open ? 140 : 40}
          duration={8}
          borderWidth={2}
          borderRadius={16}
          colorFrom="#AAFFFF"
          colorTo="#FFAAFF"
        />
        {children}
      </motion.div>
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
          "h-10 px-4 py-4 flex flex-row md:hidden  items-center justify-between bg-zinc-950 w-full"
        )}
        {...props}
      >
        <div className="flex justify-end z-20 w-full">
          <IconMenu2
            className="text-neutral-800 dark:text-neutral-200"
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
                "fixed h-full w-full inset-0 bg-white dark:bg-neutral-900 p-10 z-[100] flex flex-col justify-between",
                className
              )}
            >
              <div
                className="absolute right-10 top-10 z-50 text-neutral-800 dark:text-neutral-200"
                onClick={() => setOpen(!open)}
              >
                <IconX />
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
        "whitespace-pre inline-block !p-0 !m-0",
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
  ...props
}) => {
  const { open, animate } = useSidebar();
  return (
    <a
      href={link.href}
      className={cn(
        "flex items-center justify-start gap-2  group/sidebar py-2",
        className
      )}
      {...props}
    >
      {link.icon}

      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-white dark:text-neutral-200 text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block !p-0 !m-0"
      >
        {link.label}
      </motion.span>
    </a>
  );
};
