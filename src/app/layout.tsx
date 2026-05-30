import type { Metadata } from "next";
import { Inter, Oswald, Bebas_Neue, Montserrat, Teko } from "next/font/google";
import "./globals.css";

const inter      = Inter({      subsets: ["latin"], variable: "--font-inter"      });
const oswald     = Oswald({     subsets: ["latin"], weight: "700",  variable: "--font-oswald"     });
const bebasNeue  = Bebas_Neue({ subsets: ["latin"], weight: "400",  variable: "--font-bebas"      });
const montserrat = Montserrat({ subsets: ["latin"], weight: "800",  variable: "--font-montserrat" });
const teko       = Teko({       subsets: ["latin"], weight: "600",  variable: "--font-teko"       });

export const metadata: Metadata = {
  title: "SermonThumb — Auto YouTube Thumbnail Generator",
  description:
    "Automatically generate professional YouTube thumbnails for church sermons using AI. Connects to YouTube API for one-click upload.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${oswald.variable} ${bebasNeue.variable} ${montserrat.variable} ${teko.variable}`}>
        {children}
      </body>
    </html>
  );
}

