import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Offer来敲门 · AI 求职工作台",
  description: "从个人档案到下一份 Offer，属于你的 AI 求职工作流。",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
