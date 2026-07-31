import type { Json } from "../types/database";
import type { PoseTemplate } from "./poseDetectionService";
import type { UploadedPhoto } from "./storageService";
import { ensureAnonymousSession, supabase } from "./supabaseClient";

const bucket = "post-images";
const remoteId = (id: string) => id.replace(/^(?:uploaded-)?remote-/, "");

export type PublishPostInput = {
  photos: UploadedPhoto[];
  authorName: string;
  authorAvatar?: string;
  caption: string;
  hashtags: string[];
  location?: string;
  commentsAllowed: boolean;
  customPoseAllowed: boolean;
  isPublic: boolean;
  clientRequestId: string;
};

export type PublicComment = {
  id: string;
  content: string;
  author_name: string;
  user_id: string;
  created_at: string;
  isOwn?: boolean;
};

function normalizeHashtags(tags: string[] | null | undefined) {
  return [...new Set((tags || [])
    .map((tag) => tag.trim().replace(/^#+/, "").replace(/\s+/g, ""))
    .filter(Boolean))];
}

async function requireUser() {
  await ensureAnonymousSession();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("사용자 세션을 준비하지 못했어요.");
  return user;
}

async function resolveImageUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error || !data) throw error ?? new Error("이미지 주소를 만들지 못했어요.");
  return data.signedUrl;
}

export async function getPublicPosts(): Promise<UploadedPhoto[]> {
  const user = await requireUser();
  const { data: rows, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const postIds = rows.map((row) => row.id);
  const [{ data: likes, error: likesError }, { data: comments, error: commentsError }] = await Promise.all([
    postIds.length ? supabase.from("post_likes").select("post_id, user_id").in("post_id", postIds) : Promise.resolve({ data: [], error: null }),
    postIds.length ? supabase.from("comments").select("post_id").in("post_id", postIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (likesError) throw likesError;
  if (commentsError) throw commentsError;
  const likeCounts = new Map<string, number>();
  const likedByMe = new Set<string>();
  likes.forEach((like) => {
    likeCounts.set(like.post_id, (likeCounts.get(like.post_id) || 0) + 1);
    if (like.user_id === user.id) likedByMe.add(like.post_id);
  });
  const commentCounts = new Map<string, number>();
  comments.forEach(({ post_id }) => commentCounts.set(post_id, (commentCounts.get(post_id) || 0) + 1));
  const { data: imageRows, error: imageError } = postIds.length
    ? await supabase.from("post_images").select("id, post_id, image_url, sort_order, pose_template, pose_status").in("post_id", postIds).order("sort_order")
    : { data: [], error: null };
  if (imageError) throw imageError;
  const firstImageByPost = new Map<string, typeof imageRows[number]>();
  imageRows.forEach((image) => { if (!firstImageByPost.has(image.post_id)) firstImageByPost.set(image.post_id, image); });
  return Promise.all(rows.map(async (row) => ({
    id: `remote-${row.id}`,
    dataUrl: await resolveImageUrl(firstImageByPost.get(row.id)?.image_url || row.image_url),
    createdAt: new Date(row.created_at).getTime(),
    location: row.location || undefined,
    customPoseAllowed: row.custom_pose_allowed,
    poseTemplate: (firstImageByPost.get(row.id)?.pose_template as PoseTemplate | null) || (row.pose_template as PoseTemplate | null) || undefined,
    authorName: row.author_name,
    authorId: row.author_id || undefined,
    authorAvatar: row.author_avatar || undefined,
    caption: row.caption || undefined,
    hashtags: normalizeHashtags(row.hashtags),
    likesCount: likeCounts.get(row.id) || 0,
    commentsCount: commentCounts.get(row.id) || 0,
    commentsAllowed: row.comments_allowed,
    isPublic: row.is_public,
    likedByMe: likedByMe.has(row.id),
  })));
}

export async function publishPublicPost(input: PublishPostInput) {
  const user = await requireUser();
  const nickname = input.authorName.trim() || "바다사진 사용자";
  const { error: profileError } = await supabase.from("profiles").upsert({
    user_id: user.id,
    nickname,
    avatar_url: input.authorAvatar || null,
  });
  if (profileError) throw profileError;

  const { data: existing, error: existingError } = await supabase
    .from("posts")
    .select("id")
    .eq("author_id", user.id)
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing.id;

  const paths: string[] = [];
  try {
    for (const photo of input.photos) {
      const blob = await (await fetch(photo.dataUrl)).blob();
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from(bucket).upload(path, blob, {
        contentType: blob.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw error;
      paths.push(path);
    }
    const first = input.photos[0];
    const { data: post, error: postError } = await supabase.from("posts").insert({
      image_url: paths[0], author_name: nickname, author_id: user.id,
      author_avatar: input.authorAvatar || null,
      caption: input.caption.trim(),
      hashtags: normalizeHashtags(input.hashtags),
      location: input.location || null, is_public: input.isPublic,
      comments_allowed: input.commentsAllowed, custom_pose_allowed: input.customPoseAllowed,
      pose_template: (first?.poseTemplate as Json | undefined) || null,
      client_request_id: input.clientRequestId,
    }).select("id").single();
    if (postError) throw postError;
    const { error: imagesError } = await supabase.from("post_images").insert(paths.map((image_url, sort_order) => ({
      post_id: post.id,
      image_url,
      sort_order,
      pose_template: (input.photos[sort_order]?.poseTemplate as Json | undefined) || null,
      pose_status: (input.customPoseAllowed ? (input.photos[sort_order]?.poseTemplate ? "ready" : "failed") : "pending") as "pending" | "ready" | "failed",
    })));
    if (imagesError) throw imagesError;
    return post.id;
  } catch (error) {
    if (paths.length) await supabase.storage.from(bucket).remove(paths);
    throw error;
  }
}

export async function updateMyProfile(input: { nickname: string; bio: string; avatarUrl?: string }) {
  const user = await requireUser();
  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id,
    nickname: input.nickname.trim() || "바다랑",
    bio: input.bio.trim() || "바다사진 사용자",
    avatar_url: input.avatarUrl || null,
  });
  if (error) throw error;
}

export async function getPublicComments(id: string): Promise<PublicComment[]> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("comments")
    .select("id, content, author_name, user_id, created_at")
    .eq("post_id", remoteId(id))
    .order("created_at");
  if (error) throw error;
  return data.map((comment) => ({ ...comment, isOwn: comment.user_id === user.id }));
}

export async function publishPublicComment(id: string, content: string, authorName: string) {
  const user = await requireUser();
  const { data, error } = await supabase.from("comments").insert({
    post_id: remoteId(id), user_id: user.id, content: content.trim(), author_name: authorName,
  }).select("id, content, author_name, user_id, created_at").single();
  if (error) throw error;
  return data;
}

export async function deletePublicComment(id: string) {
  await requireUser();
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) throw error;
}

export async function togglePublicLike(id: string) {
  const user = await requireUser();
  const postId = remoteId(id);
  const { data: current, error: lookupError } = await supabase
    .from("post_likes").select("post_id").eq("post_id", postId).eq("user_id", user.id).maybeSingle();
  if (lookupError) throw lookupError;
  const { error } = current
    ? await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id)
    : await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
  if (error) throw error;
  const { count, error: countError } = await supabase.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", postId);
  if (countError) throw countError;
  return { liked: !current, count: count || 0 };
}

export async function getSavedPostIds() {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("saved_posts")
    .select("post_id")
    .eq("user_id", user.id);
  if (error) throw error;
  return new Set(data.map((row) => row.post_id));
}

/** Returns only records that are still visible through the posts RLS policy. */
export async function getSavedPosts(): Promise<UploadedPhoto[]> {
  const user = await requireUser();
  const { data: saved, error } = await supabase
    .from("saved_posts")
    .select("post_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!saved.length) return [];
  const visiblePosts = await getPublicPosts();
  const byId = new Map(visiblePosts.map((post) => [remoteId(post.id), post]));
  return saved.map((row) => byId.get(row.post_id)).filter((post): post is UploadedPhoto => Boolean(post));
}

export async function toggleSavedPost(id: string) {
  const user = await requireUser();
  const postId = remoteId(id);
  const { data: existing, error: lookupError } = await supabase
    .from("saved_posts")
    .select("post_id")
    .eq("user_id", user.id)
    .eq("post_id", postId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  const { error } = existing
    ? await supabase.from("saved_posts").delete().eq("user_id", user.id).eq("post_id", postId)
    : await supabase.from("saved_posts").insert({ user_id: user.id, post_id: postId });
  if (error) throw error;
  return { saved: !existing };
}

/** Best-effort owner-only cache. RLS intentionally rejects updates to another person's image. */
export async function savePostImagePoseTemplate(id: string, poseTemplate: PoseTemplate | null) {
  await requireUser();
  const postId = remoteId(id);
  const { data: image, error: imageError } = await supabase
    .from("post_images")
    .select("id")
    .eq("post_id", postId)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (imageError || !image) throw imageError ?? new Error("게시물 이미지를 찾지 못했어요.");
  const { error } = await supabase.from("post_images").update({
    pose_template: (poseTemplate as Json | null),
    pose_status: poseTemplate ? "ready" : "failed",
  }).eq("id", image.id);
  if (error) throw error;
}

/** Uses the authenticated Storage API when a signed URL cannot be decoded by MediaPipe/CORS. */
export async function downloadPostReferenceImage(id: string): Promise<Blob> {
  await requireUser();
  const postId = remoteId(id);
  const { data: image, error: imageError } = await supabase
    .from("post_images")
    .select("image_url")
    .eq("post_id", postId)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (imageError || !image) throw imageError ?? new Error("참고 사진을 찾지 못했어요.");
  const { data, error } = await supabase.storage.from(bucket).download(image.image_url);
  if (error || !data) throw error ?? new Error("참고 사진을 불러오지 못했어요.");
  return data;
}

/** One feed subscription per mounted Home screen. The caller refreshes from DB, not from event payloads. */
export async function subscribeToSocialChanges(onChange: () => void) {
  await ensureAnonymousSession();
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onChange, 180);
  };
  const channel = supabase
    .channel("bada-social-feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, schedule)
    .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, schedule)
    .subscribe();
  return () => {
    window.clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}
