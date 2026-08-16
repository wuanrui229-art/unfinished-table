import type { Metadata } from "next";
import "react-loading-skeleton/dist/skeleton.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "未竟之桌｜一次跨时代的 AI 思想实验",
  description: "邀请不同时代的思想者围绕一个属于今天的问题，展开有分歧、有来源、也允许不知道的圆桌讨论。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
