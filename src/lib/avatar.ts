import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { read, write } from "./db";
import { saveWorkspaceFile } from "./files";

export function currentAvatarId() { return read<{ id: string }>("config", "avatar")?.id || null; }
export async function storeAvatar(buffer: Buffer) {
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error("请选择 5 MB 以内的头像");
  const input = sharp(buffer, { limitInputPixels: 24000000, failOn: "warning" });
  const metadata = await input.metadata().catch(() => { throw new Error("图片无法读取，请上传 JPG、PNG 或 WebP"); });
  if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1) throw new Error("请选择静态 JPG、PNG 或 WebP 图片");
  const image = await input.rotate().resize(360, 480, { fit: "cover", position: "attention" }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  const destination = await saveWorkspaceFile("头像.jpg", image);
  const id = randomUUID();
  write("avatars", id, { id, path: destination });
  write("config", "avatar", { id });
  return id;
}
export async function avatarBytes(id: string | null) {
  if (!id) return null;
  const avatar = read<{ path: string }>("avatars", id);
  if (!avatar) throw new Error("头像文件记录不存在，请重新上传头像");
  return readFile(avatar.path).catch(() => { throw new Error("头像文件无法读取，请检查工作目录或重新上传头像"); });
}
