import type { UploadedPhoto } from "./storageService";

const url = "https://fmnogwytuggrzuzuebcx.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtbm9nd3l0dWdncnp1enVlYmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Mzc4OTEsImV4cCI6MjEwMTAxMzg5MX0.e1rllA-scssvWvxzhTNYDjYHX4Q6XNFpkZujiac78yk";
const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

type RemotePost = { id: string; image_url: string; created_at: string; location: string | null; author_name: string; custom_pose_allowed: boolean };

export async function getPublicPosts(): Promise<UploadedPhoto[]> {
  const response = await fetch(`${url}/rest/v1/posts?select=*&order=created_at.desc`, { headers });
  if (!response.ok) throw new Error("게시물을 불러오지 못했습니다.");
  const rows = await response.json() as RemotePost[];
  return rows.map((row) => ({ id: `remote-${row.id}`, dataUrl: row.image_url, createdAt: new Date(row.created_at).getTime(), location: row.location || undefined, customPoseAllowed: row.custom_pose_allowed, authorName: row.author_name }));
}

export async function publishPublicPost(photo: UploadedPhoto, authorName: string) {
  const blob = await (await fetch(photo.dataUrl)).blob();
  const path = `${crypto.randomUUID()}.jpg`;
  const upload = await fetch(`${url}/storage/v1/object/post-images/${path}`, { method: "POST", headers: { ...headers, "Content-Type": blob.type || "image/jpeg", "x-upsert": "false" }, body: blob });
  if (!upload.ok) throw new Error("사진 업로드에 실패했습니다.");
  const imageUrl = `${url}/storage/v1/object/public/post-images/${path}`;
  const post = await fetch(`${url}/rest/v1/posts`, { method: "POST", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ image_url: imageUrl, location: photo.location || null, author_name: authorName, custom_pose_allowed: photo.customPoseAllowed === true }) });
  if (!post.ok) throw new Error("게시물 저장에 실패했습니다.");
}

export type PublicComment = { id: string; content: string; author_name: string; created_at: string };
export async function getPublicComments(postId: string): Promise<PublicComment[]> {
  const response = await fetch(`${url}/rest/v1/comments?post_id=eq.${postId}&select=*&order=created_at.asc`, { headers });
  if (!response.ok) throw new Error("댓글을 불러오지 못했습니다.");
  return response.json();
}
export async function publishPublicComment(postId: string, content: string, authorName: string) {
  const response = await fetch(`${url}/rest/v1/comments`, { method: "POST", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ post_id: postId, content, author_name: authorName }) });
  if (!response.ok) throw new Error("댓글 저장에 실패했습니다.");
}

function deviceId() { const key = "bada-device-id"; const value = localStorage.getItem(key) || crypto.randomUUID(); localStorage.setItem(key, value); return value; }
export async function togglePublicLike(postId: string) {
  const device = deviceId();
  const lookup = await fetch(`${url}/rest/v1/post_likes?post_id=eq.${postId}&device_id=eq.${device}&select=post_id`, { headers });
  const existing = await lookup.json() as { post_id: string }[];
  if (existing.length) await fetch(`${url}/rest/v1/post_likes?post_id=eq.${postId}&device_id=eq.${device}`, { method: "DELETE", headers });
  else await fetch(`${url}/rest/v1/post_likes`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ post_id: postId, device_id: device }) });
  const count = await fetch(`${url}/rest/v1/post_likes?post_id=eq.${postId}&select=post_id`, { headers: { ...headers, Prefer: "count=exact" } });
  return { liked: !existing.length, count: Number(count.headers.get("content-range")?.split("/")[1] || 0) };
}
