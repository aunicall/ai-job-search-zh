import { mkdir, writeFile } from "node:fs/promises";
import { unlinkSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, ImageRun, Table, TableRow, TableCell, WidthType, VerticalAlign } from "docx";
import { chromium } from "playwright-core";
import { db, fileDirectory, list, read, write } from "./db";
import { resumeHtml, resumeLines, resumeSections, resumeTemplate } from "./resume-templates";
import type { Material } from "./types";

export async function saveWorkspaceFile(name: string, buffer: Buffer | string, materialId?: string) {
  const directory = fileDirectory();
  await mkdir(directory, { recursive: true });
  const id = randomUUID();
  const filename = `${id}-${path.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 140)}`;
  const destination = path.join(directory, filename);
  await writeFile(destination, buffer, { flag: "wx" });
  if (materialId && !read("materials", materialId)) {
    unlinkSync(destination);
    throw new Error("材料已删除");
  }
  write("files", id, { id, name, path: destination, materialId, createdAt: new Date().toISOString() });
  return destination;
}
export function deleteMaterialFiles(materialId: string) {
  const files = list<{ id: string; path: string; materialId?: string }>("files").filter((file) => file.materialId === materialId);
  for (const file of files) {
    if (!path.isAbsolute(file.path) || !path.basename(file.path).startsWith(`${file.id}-`)) throw new Error("材料文件路径无效");
  }
  for (const file of files) {
    try { unlinkSync(file.path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    db().prepare("DELETE FROM records WHERE collection='files' AND id=?").run(file.id);
  }
}
export async function exportDocument(material: Material, format: "docx" | "pdf") {
  const t = resumeTemplate(material.templateId);
  const { avatarBytes } = await import("./avatar");
  const avatar = material.kind === "resume" ? await avatarBytes(material.avatarId || null) : null;
  if (format === "pdf") {
    const browser = await chromium.launch({ channel: process.env.OFFER_BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : "chrome"), headless: true });
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) => route.abort());
      await page.setContent(resumeHtml(material.content, t.id, avatar ? `data:image/jpeg;base64,${avatar.toString("base64")}` : undefined));
      return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    } finally { await browser.close(); }
  }
  const paragraphs = resumeLines(material.content).map((line) => new Paragraph({
    alignment: t.layout === "center" && line.level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: line.level === 2 ? 240 : 50, after: t.layout === "compact" ? 60 : 100 },
    keepNext: Boolean(line.level),
    ...(line.level === 2 ? { border: { bottom: { color: t.color.slice(1), size: 6, style: BorderStyle.SINGLE, space: 5 } } } : {}),
    ...(line.level === 1 && t.layout === "band" ? { shading: { fill: t.color.slice(1) } } : {}),
    children: [new TextRun({ text: line.text, font: "Microsoft YaHei", size: line.level === 1 ? 42 : line.level === 2 ? 28 : 22, bold: Boolean(line.level), color: line.level === 1 && t.layout === "band" ? "FFFFFF" : line.level ? t.color.slice(1) : "253139" })],
  }));
  const headerLength = resumeSections(material.content).header.length;
  const border = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const children = avatar ? [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }, rows: [new TableRow({ children: [
    new TableCell({ width: { size: 80, type: WidthType.PERCENTAGE }, children: paragraphs.slice(0, headerLength), verticalAlign: VerticalAlign.TOP }),
    new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: "jpg", data: avatar, transformation: { width: 90, height: 120 } })] })] }),
  ] })] }), ...paragraphs.slice(headerLength)] : paragraphs;
  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 850, bottom: 850, left: 1000, right: 1000 } } }, children }] });
  return Packer.toBuffer(doc);
}
