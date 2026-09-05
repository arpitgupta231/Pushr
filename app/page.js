import { BackgroundPixelStars } from "@/components/ui/background-pixel-stars";

export default function Home() {
  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-black bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAIElEQVR42mIUEhJiwAbevXuHVZyJgUQwqmEUDB0AEGAADd8DEPTX6ksAAAAASUVORK5CYII=')] bg-[size:10px]">
      <BackgroundPixelStars />
      <section className="relative z-10 flex min-h-dvh items-center justify-center px-6 text-center text-white">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">
            Pushr
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-tight sm:text-7xl">
            Grow with your BRO.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
            Lock into a 6-month GitHub rivalry where your progress pushes
            theirs, and theirs pushes yours.
          </p>
        </div>
      </section>
    </main>
  );
}
