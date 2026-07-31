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
  return Promise.all(rows.map(async (row) => ({
    id: `remote-${row.id}`,
    dataUrl: await resolveImageUrl(row.image_url),
    createdAt: new Date(row.created_at).getTime(),
    location: row.location || undefined,
    customPoseAllowed: row.custom_pose_allowed,
    poseTemplate: (row.pose_template as PoseTemplate | null) || undefined,
    authorName: row.author_name,
    authorId: row.author_id || undefined,
    authorAvatar: row.author_avatar || undefined,
    caption: row.caption,
    hashtags: row.hashtags,
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
      author_avatar: input.authorAvatar || null, caption: input.caption, hashtags: input.hashtags,
      location: input.location || null, is_public: input.isPublic,
      comments_allowed: input.commentsAllowed, custom_pose_allowed: input.customPoseAllowed,
      pose_template: (first?.poseTemplate as Json | undefined) || null,
      client_request_id: input.clientRequestId,
    }).select("id").single();
    if (postError) throw postError;
    if (paths.length > 1) {
      const { error: imagesError } = await supabase.from("post_images").insert(paths.map((image_url, sort_order) => ({ post_id: post.id, image_url, sort_order })));
      if (imagesError) throw imagesError;
    }
    return post.id;
  } catch (error) {
    if (paths.length) await supabase.storage.from(bucket).remove(paths);
    throw error;
  }
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
