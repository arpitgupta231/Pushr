import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BackgroundPixelStars } from "@/components/ui/background-pixel-stars";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Pushr -  Grow w/ Your Bro",
  description: "Grow with your bro. Competitive coding rivalry built on GitHub activity.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <main className="relative min-h-dvh w-full overflow-hidden bg-black bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAIElEQVR42mIUEhJiwAbevXuHVZyJgUQwqmEUDB0AEGAADd8DEPTX6ksAAAAASUVORK5CYII=')] bg-[size:10px]">
        <BackgroundPixelStars />
        <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
