import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Camera,
  ChevronLeft,
  Flame,
  FolderHeart,
  Grid2X2,
  Heart,
  ImagePlus,
  MessageCircle,
  Moon,
  RotateCw,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { SeaLionMascot } from "./components/SeaLionMascot";
import { PoseOverlay } from "./components/PoseOverlay";
import {
  analyseReferencePose,
  analyseUploadedPose,
  type PoseGuide,
} from "./services/poseDetectionService";
import {
  deletePhoto,
  deleteUpload,
  getPhotos,
  getUploads,
  savePhoto,
  type StoredPhoto,
  type UploadedPhoto,
} from "./services/storageService";
import { getCameraGuide } from "./services/cameraGuideService";
import { isInappropriateComment } from "./services/commentModerationService";
import {
  deletePublicComment,
  downloadPostReferenceImage,
  getSavedPostIds,
  getSavedPosts,
  getPublicComments,
  getPublicPosts,
  publishPublicComment,
  publishPublicPost,
  savePostImagePoseTemplate,
  subscribeToSocialChanges,
  toggleSavedPost,
  togglePublicLike,
  updateMyProfile,
} from "./services/supabaseService";
import {
  analysePhotoForEdit,
  defaultEditSettings,
  getRecommendedCaption,
  renderCrop,
  type CropData,
  type EditRecommendation,
  type EditSettings,
} from "./services/photoAnalysisService";
declare global {
  interface MediaTrackConstraintSet {
    zoom?: number;
    torch?: boolean;
  }
}
type Screen = "onboarding" | "home" | "guide" | "camera" | "saved" | "my" | "editor" | "post";
type PostDraft = {
  images: string[];
  originalImages: string[];
  crops: (CropData | undefined)[];
  activeIndex: number;
  edits: EditSettings[];
  caption: string;
  hashtags: string[];
  location: string;
  commentsAllowed: boolean;
  customPoseAllowed: boolean;
  clientRequestId: string;
};
const assetBase = import.meta.env.BASE_URL;
const cards: [string, string, string, number, string?][] = [
  ["standing-wave", "@seaside.jun", `${assetBase}custom-photos/standing-wave.jpg`, 245],
  ["sitting-beach", "@ocean.day", `${assetBase}custom-photos/sitting-beach.jpg`, 328],
  ["side-standing", "@bluewalk", `${assetBase}custom-photos/side-standing.jpg`, 186],
  ["wing-pose", "@summerframe", `${assetBase}custom-photos/wing-pose.jpg`, 219],
];
function App() {
  const [screen, setScreen] = useState<Screen>(() => localStorage.getItem("bada-onboarding") === "done" ? "home" : "onboarding");
  const [guide, setGuide] = useState<PoseGuide>();
  const [place, setPlace] = useState("자유 촬영");
  const [referenceImage, setReferenceImage] = useState("");
  const [saved, setSaved] = useState<StoredPhoto[]>([]);
  const [savedPosts, setSavedPosts] = useState<UploadedPhoto[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [pendingDetail, setPendingDetail] = useState<UploadedPhoto | null>(null);
  const [uploaded, setUploaded] = useState<UploadedPhoto[]>([]);
  const [browseMode, setBrowseMode] = useState(false);
  const [guideClosing, setGuideClosing] = useState(false);
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const publishLock = useRef(false);
  const cameraAnalysisRequest = useRef(0);
  const [dark, setDark] = useState(
    () => localStorage.getItem("bada-dark") === "true",
  );
  const openCamera = async (p = "자유 촬영", image = "", storedGuide?: PoseGuide) => {
    const requestId = ++cameraAnalysisRequest.current;
    setPlace(p);
    setReferenceImage(image);
    setGuide(storedGuide);
    setScreen("camera");
    if (p === "자유 촬영" || storedGuide) return;
    void (async () => {
      try {
        const source = p.startsWith("uploaded-remote-")
          ? await downloadPostReferenceImage(p).catch(() => image)
          : image;
        const next = source
          ? await analyseUploadedPose(source, "참고 사진 포즈")
          : await analyseReferencePose(p);
        if (next && requestId === cameraAnalysisRequest.current) {
          setGuide(next);
          if (p.startsWith("uploaded-remote-")) void savePostImagePoseTemplate(p, next).catch(() => undefined);
        }
      } catch {
        // A reference image can still be used when local pose analysis is unavailable.
      }
    })();
  };
  const refresh = () =>
    getPhotos()
      .then(setSaved)
      .catch(() => setSaved([]));
  const refreshUploads = useCallback(async () => {
    const [local, remote] = await Promise.all([getUploads(), getPublicPosts().catch(() => [])]);
    setUploaded([...local, ...remote]);
  }, []);
  const refreshSavedPosts = useCallback(async () => {
    const [ids, posts] = await Promise.all([getSavedPostIds(), getSavedPosts()]);
    setSavedPostIds(ids);
    setSavedPosts(posts);
  }, []);
  useEffect(() => {
    void refresh();
    void refreshUploads().catch(() => setUploaded([]));
    void refreshSavedPosts().catch(() => { setSavedPostIds(new Set()); setSavedPosts([]); });
  }, [refreshSavedPosts, refreshUploads]);
  const capture = async (data: string) => {
    const filename = `bada-photo-${Date.now()}.jpg`;
    const blob = await (await fetch(data)).blob();
    const file = new File([blob], filename, { type: "image/jpeg" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "바다사진" });
      } else {
        const link = document.createElement("a");
        link.href = data;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") throw error;
    }
    await savePhoto({
      id: crypto.randomUUID(),
      dataUrl: data,
      place,
      poseName: guide?.label,
      createdAt: Date.now(),
    });
    await refresh();
  };
  const toggleDark = () =>
    setDark((value) => {
      const next = !value;
      localStorage.setItem("bada-dark", String(next));
      return next;
    });
  const closeGuide = () => {
    if (guideClosing) return;
    setGuideClosing(true);
    window.setTimeout(() => {
      setScreen("home");
      setGuideClosing(false);
    }, 260);
  };
  const beginPostDraft = (images: string[]) => {
    if (!images.length) return;
    setDraft({
      images,
      originalImages: images,
      crops: images.map(() => undefined),
      activeIndex: 0,
      edits: images.map(() => ({ ...defaultEditSettings })),
      caption: getRecommendedCaption(0),
      hashtags: ["바다사진", "부산바다"],
      location: "부산 · 해운대",
      commentsAllowed: true,
      customPoseAllowed: true,
      clientRequestId: crypto.randomUUID(),
    });
    setScreen("editor");
  };
  const publishDraft = async () => {
    if (!draft || publishLock.current) return;
    publishLock.current = true;
    try {
      const location = draft.location === "장소 없음" ? undefined : draft.location.split("·").pop()?.trim();
      const authorName = localStorage.getItem("bada-profile-name") || "바다랑";
      const photos = await Promise.all(draft.images.map(async (dataUrl, index) => ({ id: crypto.randomUUID(), dataUrl, createdAt: Date.now(), location, cropData: draft.crops[index], customPoseAllowed: draft.customPoseAllowed, poseTemplate: draft.customPoseAllowed ? (await analyseUploadedPose(dataUrl).catch(() => null)) ?? undefined : undefined })));
      await publishPublicPost({
        photos,
        authorName,
        caption: draft.caption,
        hashtags: draft.hashtags,
        location,
        commentsAllowed: draft.commentsAllowed,
        customPoseAllowed: draft.customPoseAllowed,
        isPublic: true,
        clientRequestId: draft.clientRequestId,
      });
      await refreshUploads();
      setDraft(null);
      setScreen("home");
    } catch {
      window.alert("게시물 업로드에 실패했어요. 인터넷 연결과 Supabase 설정을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      publishLock.current = false;
    }
  };
  return (
    <main className={`app-shell ${dark ? "dark" : ""}`}>
      {screen === "onboarding" && <Onboarding onStart={() => { localStorage.setItem("bada-onboarding", "done"); setScreen("home"); }} />}
      {screen === "home" && (
        <Home
          onCustom={openCamera}
          uploaded={uploaded}
          onUpload={beginPostDraft}
          onRemoveUpload={async (id) => { await deleteUpload(id); await refreshUploads(); }}
          dark={dark}
          onToggleDark={toggleDark}
          onBrowseModeChange={setBrowseMode}
          onGuide={() => {
            setGuideClosing(false);
            setScreen("guide");
          }}
          onRefreshSocial={refreshUploads}
          savedPostIds={savedPostIds}
          onToggleSaved={async (id) => { const result = await toggleSavedPost(id); await refreshSavedPosts(); return result; }}
          initialDetail={pendingDetail}
          onInitialDetailShown={() => setPendingDetail(null)}
        />
      )}{" "}
      {screen === "guide" && <Guide closing={guideClosing} onClose={closeGuide} />}
      {screen === "editor" && draft && <PhotoEditor draft={draft} onChange={setDraft} onBack={() => setScreen("home")} onNext={() => setScreen("post")} />}
      {screen === "post" && draft && <NewPost draft={draft} onChange={setDraft} onBack={() => setScreen("editor")} onPublish={() => void publishDraft()} />}
      {screen === "camera" && (
        <CameraScreen
          guide={guide}
          referenceImage={referenceImage}
          latestPhoto={saved[0]?.dataUrl}
          onClose={() => setScreen("home")}
          onCapture={capture}
          onGallery={() => { void refresh(); setScreen("saved"); }}
        />
      )}{" "}
      {screen === "saved" && (
        <Saved
          photos={saved}
          onHome={() => setScreen("home")}
          onCamera={() => openCamera()}
          onDelete={async (id) => {
            await deletePhoto(id);
            await refresh();
          }}
          savedPosts={savedPosts}
          onOpenSavedPost={(post) => { setPendingDetail(post); setScreen("home"); }}
        />
      )}{" "}
      {screen === "my" && (
        <My onHome={() => setScreen("home")} onCamera={() => openCamera()} />
      )}{" "}
      {["saved", "my"].includes(screen) || (screen === "home" && !browseMode) ? (
        <Nav
          goHome={() => setScreen("home")}
          goSaved={() => {
            void refresh();
            setScreen("saved");
          }}
          goMy={() => setScreen("my")}
          onCamera={() => openCamera()}
        />
      ) : null}
    </main>
  );
}
function Onboarding({ onStart }: { onStart: () => void }) {
  return <section className="onboarding page-enter"><SeaLionMascot /><h1>바다를 더 멋지게 담아보세요</h1><p>마음에 드는 바다 사진의 포즈를 골라<br/>AI 가이드와 함께 나만의 사진을 촬영할 수 있어요.</p><button className="primary" onClick={onStart}>준비되셨나요?</button></section>;
}

function Home({
  onCustom,
  uploaded,
  onUpload,
  onRemoveUpload,
  dark,
  onToggleDark,
  onBrowseModeChange,
  onGuide,
  onRefreshSocial,
  savedPostIds,
  onToggleSaved,
  initialDetail,
  onInitialDetailShown,
}: {
  onCustom: (p: string, image?: string, storedGuide?: PoseGuide) => void;
  uploaded: UploadedPhoto[];
  onUpload: (images: string[]) => void;
  onRemoveUpload: (id: string) => void | Promise<void>;
  dark: boolean;
  onToggleDark: () => void;
  onBrowseModeChange: (active: boolean) => void;
  onGuide: () => void;
  onRefreshSocial: () => void;
  savedPostIds: Set<string>;
  onToggleSaved: (id: string) => Promise<{ saved: boolean }>;
  initialDetail: UploadedPhoto | null;
  onInitialDetailShown: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [searching, setSearching] = useState(false);
  const [likes, setLikes] = useState<Record<string, boolean>>(() =>
    JSON.parse(localStorage.getItem("bada-likes") || "{}"),
  );
  const [detail, setDetail] = useState<{
    id: string;
    account: string;
    image: string;
    customAllowed: boolean;
    likeCount: number;
    commentCount: number;
    commentsAllowed: boolean;
    caption?: string;
    hashtags: string[];
  } | null>(null);
  type CommentItem = { id?: string; text: string; author: "me" | "other" };
  const [comments, setComments] = useState<Record<string, CommentItem[]>>(() => {
    const saved = JSON.parse(localStorage.getItem("bada-comments") || "{}");
    return Object.fromEntries(Object.entries(saved).map(([id, items]) => [id, (items as (string | CommentItem)[]).map((item) => typeof item === "string" ? { text: item, author: "other" as const } : item)]));
  });
  const [comment, setComment] = useState("");
  const [detailClosing, setDetailClosing] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsClosing, setCommentsClosing] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [saveOverride, setSaveOverride] = useState<boolean | undefined>();
  const [saveNotice, setSaveNotice] = useState("");
  const nickname = localStorage.getItem("bada-profile-name") || "바다랑";
  useEffect(() => {
    if (!initialDetail || detailClosing) return;
    setDetail({
      id: `uploaded-${initialDetail.id}`,
      account: `@${initialDetail.authorName || nickname}`,
      image: initialDetail.dataUrl,
      customAllowed: initialDetail.customPoseAllowed === true,
      likeCount: initialDetail.likesCount || 0,
      commentCount: initialDetail.commentsCount || 0,
      commentsAllowed: initialDetail.commentsAllowed !== false,
      caption: initialDetail.caption,
      hashtags: initialDetail.hashtags || [],
    });
    setCaptionExpanded(false);
    setCommentsOpen(false);
    void loadRemoteComments(`uploaded-${initialDetail.id}`);
    onInitialDetailShown();
  }, [detailClosing, initialDetail, nickname, onInitialDetailShown]);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void subscribeToSocialChanges(onRefreshSocial).then((cleanup) => { unsubscribe = cleanup; }).catch(() => undefined);
    return () => unsubscribe?.();
  }, [onRefreshSocial]);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    Promise.all(files.map((file) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    }))).then(onUpload);
  };
  useEffect(() => {
    setLikes((current) => {
      const next = { ...current };
      uploaded.forEach((photo) => {
        if (photo.id.startsWith("remote-")) next[`uploaded-${photo.id}`] = photo.likedByMe === true;
      });
      return next;
    });
  }, [uploaded]);
  const toggleLike = (id: string) =>
    setLikes((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem("bada-likes", JSON.stringify(next));
      if (id.startsWith("uploaded-remote-")) void togglePublicLike(id)
        .catch(() => setLikes(current));
      return next;
    });
  const saveComments = (next: Record<string, CommentItem[]>) => {
    setComments(next);
    localStorage.setItem("bada-comments", JSON.stringify(next));
  };
  const closeViewer = () => {
    if (detailClosing) return;
    setDetailClosing(true);
    window.setTimeout(() => { setDetail(null); setCommentsOpen(false); setDetailClosing(false); }, 260);
  };
  const closeComments = () => {
    if (commentsClosing) return;
    setCommentsClosing(true);
    window.setTimeout(() => { setCommentsOpen(false); setCommentsClosing(false); }, 260);
  };
  const loadRemoteComments = async (id: string) => {
    if (!id.startsWith("uploaded-remote-")) return;
    const rows = await getPublicComments(id);
    setComments((current) => ({
      ...current,
      [id]: rows.map((row) => ({ id: row.id, text: row.content, author: row.isOwn ? "me" : "other" })),
    }));
  };
  const uploadedPoseByDisplayId = new Map(uploaded.map((photo) => [`uploaded-${photo.id}`, photo.poseTemplate]));
  const displayCards: [string, string, string, number, string, boolean, number, boolean, string | undefined, string[]][] = [
    ...uploaded.map(
      (u) =>
        [`uploaded-${u.id}`, `@${u.authorName || nickname}`, u.dataUrl, u.likesCount || 0, u.location || "", u.customPoseAllowed === true, u.commentsCount || 0, u.commentsAllowed !== false, u.caption, (u.hashtags || []).map((tag) => tag.replace(/^#+/, "")).filter(Boolean)] as [
          string,
          string,
          string,
          number,
          string,
          boolean,
          number,
          boolean,
          string | undefined,
          string[],
        ],
    ),
    ...cards.map((card) => [card[0], card[1], card[2], card[3], card[4] || "", true, 0, true, undefined, []] as [string, string, string, number, string, boolean, number, boolean, string | undefined, string[]]),
  ].filter(([, account]) =>
    account.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page home page-enter">
      <header>
        <div className="brand">
          <SeaLionMascot small />
          <b>바다사진</b>
        </div>
        <div>
          <button
            onClick={() => setSearching((x) => !x)}
            aria-label="사진 검색"
          >
            <Search />
          </button>
          <button onClick={onToggleDark} aria-label="다크 모드 전환">
            {dark ? <Sun /> : <Moon />}
          </button>
          <button aria-label="알림">
            <Bell />
          </button>
        </div>
      </header>
      {(searching || showAll) && (
        <div className="search-bar">
          <Search />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="계정으로 검색"
            aria-label="커스텀 사진 계정 검색"
          />
          <button
            onClick={() => {
              setQuery("");
              setSearching(false);
            }}
            aria-label="검색 닫기"
          >
            <X />
          </button>
        </div>
      )}
      {!showAll && (
        <button className="guide-entry" onClick={onGuide} aria-label="앱 사용 가이드 열기">
          <Sparkles />
          <span><b>앱 사용 가이드</b><small>바다사진을 처음 이용하시나요? 순서대로 안내해 드려요.</small></span>
          <ChevronLeft />
        </button>
      )}
      <div className="section-title">
        <h2>
          <Flame /> 커스텀 사진
        </h2>
        <button onClick={() => { const next = !showAll; setShowAll(next); setSearching(next); onBrowseModeChange(next); }} aria-label="커스텀 사진 전체보기">{showAll ? "접기" : "전체보기 ›"}</button>
      </div>
      <div className={`photo-grid photo-grid-scroll ${showAll ? "photo-grid-expanded" : ""}`}>
        {displayCards.map(([id, account, img, count, location, customAllowed, commentCount, commentsAllowed, caption, hashtags]) => (
          <article className="photo-card" key={id + img}>
            <button
              className="photo-open"
              onClick={() => {
                if (!detailClosing) { setDetail({ id, account, image: img, customAllowed, likeCount: count, commentCount, commentsAllowed, caption, hashtags }); setCaptionExpanded(false); setSaveOverride(undefined); setSaveNotice(""); setCommentsOpen(false); void loadRemoteComments(id); }
              }}
              aria-label={`${account} 사진 댓글 보기`}
            >
              <img src={img} alt={`${account} 업로드 사진`} />
            </button>
            <div className="photo-shade" />
            <div className="card-top">
              <div className="card-identity"><b>{account}</b>{location && <span className="card-place-name">· {location}</span>}</div>
              <button
                className={likes[id] ? "liked" : ""}
                onClick={() => toggleLike(id)}
                aria-label={`${account} 사진 좋아요`}
              >
                <Heart fill={likes[id] ? "currentColor" : "none"} />
                <span>{count + (likes[id] ? 1 : 0)}</span>
              </button>
            </div>
              <div className="card-bottom">
                {id.startsWith("uploaded-") && !id.startsWith("uploaded-remote-") && (
                <button
                  className="remove-upload"
                  onClick={() => onRemoveUpload(id.replace("uploaded-", ""))}
                  aria-label="내가 올린 사진 삭제"
                >
                  <Trash2 />
                </button>
              )}
              {customAllowed && <button
                onClick={() => onCustom(id, img, uploadedPoseByDisplayId.get(id))}
                aria-label={`${account} 사진으로 촬영하기`}
              >
                커스텀
              </button>}
              </div>
          </article>
        ))}
      </div>
      {!displayCards.length && <p className="no-search">검색 결과가 없어요.</p>}
      <label className="upload-card separate-upload-card">
        <ImagePlus /> 내 갤러리에서 사진 추가
        <input type="file" accept="image/*" multiple onChange={pick} />
      </label>
      {detail && (
        <section className={`photo-detail-viewer ${detailClosing ? "is-closing" : ""}`}>
          <header className="detail-header"><div><SeaLionMascot small /><b>{detail.account}</b></div><button onClick={closeViewer} aria-label="사진 상세 닫기"><X /></button></header>
          <div className="detail-image-wrap"><img src={detail.image} alt={`${detail.account}의 커스텀 사진`} /></div>
          {(detail.caption || detail.hashtags.length > 0) && <section className="detail-post-copy">
            {detail.caption && <div className={captionExpanded ? "detail-caption expanded" : "detail-caption"}><b>{detail.account}</b><p>{detail.caption}</p>{detail.caption.length > 90 && <button onClick={() => setCaptionExpanded((value) => !value)} aria-label="게시물 문구 더보기">{captionExpanded ? "접기" : "더보기"}</button>}</div>}
            {detail.hashtags.length > 0 && <div className="detail-tags">{detail.hashtags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
          </section>}
          <div className="detail-actions">
            <button onClick={() => toggleLike(detail.id)} aria-label="사진 좋아요"><Heart fill={likes[detail.id] ? "currentColor" : "none"}/><span>{detail.id.startsWith("uploaded-remote-") ? detail.likeCount : detail.likeCount + (likes[detail.id] ? 1 : 0)}</span></button>
            <button onClick={() => { setCommentsClosing(false); setCommentsOpen(true); void loadRemoteComments(detail.id); }} aria-label="댓글 열기"><MessageCircle /><span>{(comments[detail.id] || []).length || detail.commentCount}</span></button>
            <button onClick={() => {
              if (!detail.id.startsWith("uploaded-remote-")) { setSaveNotice("Supabase 게시물만 저장할 수 있어요."); return; }
              const postId = detail.id.replace(/^uploaded-remote-/, "");
              const before = saveOverride ?? savedPostIds.has(postId);
              setSavingPost(true); setSaveOverride(!before); setSaveNotice("");
              void onToggleSaved(detail.id).then((result) => { setSaveOverride(result.saved); setSaveNotice(result.saved ? "저장했어요." : "저장을 취소했어요."); }).catch(() => { setSaveOverride(before); setSaveNotice("저장하지 못했어요. 다시 시도해 주세요."); }).finally(() => setSavingPost(false));
            }} aria-label="게시물 저장 또는 저장 취소" aria-pressed={saveOverride ?? savedPostIds.has(detail.id.replace(/^uploaded-remote-/, ""))} disabled={savingPost}><FolderHeart fill={(saveOverride ?? savedPostIds.has(detail.id.replace(/^uploaded-remote-/, ""))) ? "currentColor" : "none"}/><span>{(saveOverride ?? savedPostIds.has(detail.id.replace(/^uploaded-remote-/, ""))) ? "저장됨" : "저장"}</span></button>
            {detail.customAllowed && <button className="detail-custom" onClick={() => onCustom(detail.id, detail.image, uploadedPoseByDisplayId.get(detail.id))} aria-label="이 포즈로 커스텀 촬영"><Camera /><span>커스텀 촬영</span></button>}
          </div>
          {saveNotice && <p className="save-notice" role="status">{saveNotice}</p>}
          {commentsOpen && <div className={`sheet-layer ${commentsClosing ? "is-closing" : ""}`} onClick={closeComments}>
        <section className="comment-sheet" onClick={(event) => event.stopPropagation()}>
          <button
            className="sheet-close"
            onClick={closeComments}
            aria-label="댓글 닫기"
          >
            <X />
          </button>
          <img src={detail.image} alt="댓글을 작성할 사진" />
          <b>{detail.account}</b>
          <div className="comments">
            {(comments[detail.id] || []).map((item, index) => (
              <p key={`${item.text}-${index}`}>
                <span>{item.text}</span>
                {item.author === "me" ? <button onClick={() => { if (item.id) void deletePublicComment(item.id).then(() => void loadRemoteComments(detail.id)); else saveComments({ ...comments, [detail.id]: (comments[detail.id] || []).filter((_, i) => i !== index) }); }} aria-label="내 댓글 삭제"><Trash2 /></button> : <button onClick={() => { if (isInappropriateComment(item.text)) window.alert("신고가 접수되었어요."); else window.alert("AI 안전 필터가 부적절한 표현을 찾지 못했어요."); }} aria-label="댓글 신고"><ShieldAlert /></button>}
              </p>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (comment.trim() && detail.commentsAllowed) {
                const content = comment.trim();
                if (detail.id.startsWith("uploaded-remote-")) {
                  void publishPublicComment(detail.id, content, nickname)
                    .then(() => void loadRemoteComments(detail.id))
                    .catch(() => window.alert("댓글을 등록하지 못했어요. 다시 시도해 주세요."));
                } else saveComments({
                  ...comments,
                  [detail.id]: [...(comments[detail.id] || []), { text: content, author: "me" }],
                });
                setComment("");
              }
            }}
          >
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={detail.commentsAllowed ? "댓글을 입력하세요" : "댓글이 허용되지 않은 게시물이에요"}
              aria-label="댓글 입력"
              disabled={!detail.commentsAllowed}
            />
            <button aria-label="댓글 등록" disabled={!detail.commentsAllowed}>
              <MessageCircle />
            </button>
          </form>
        </section>
          </div>}
        </section>
      )}
    </div>
  );
}
function Guide({ onClose, closing }: { onClose: () => void; closing: boolean }) {
  return (
    <section className={`page guide-page ${closing ? "is-closing" : ""}`}>
      <header>
        <button onClick={onClose} aria-label="가이드 닫기"><ChevronLeft /></button>
        <b>앱 사용 가이드</b>
        <span />
      </header>
      <section className="guide-hero">
        <SeaLionMascot small />
        <div><b>바다사진, 이렇게 사용해 보세요!</b><p>사진은 내 기기 안에서 다루며, 인물의 외모나 몸매를 평가하지 않아요.</p></div>
      </section>
      <div className="guide-list">
        <GuideItem number="1" title="커스텀 사진 둘러보기">
          홈의 사진을 눌러 다른 이용자의 사진에 좋아요를 누르거나 댓글을 남길 수 있어요. 상단 돋보기로 계정을 검색하고, <b>전체보기</b>를 누르면 모든 커스텀 사진을 볼 수 있어요.
        </GuideItem>
        <GuideItem number="2" title="마음에 드는 포즈로 촬영하기">
          사진 오른쪽 아래의 <b>커스텀</b>을 누르면 그 사진의 인물 자세를 참고하는 촬영 화면으로 이동해요. 사진 속 배경을 복사하는 기능이 아니라, 사람의 위치와 자세를 맞춰 보는 촬영 가이드예요.
        </GuideItem>
        <GuideItem number="3" title="자유롭게 촬영하기">
          아래 가운데의 큰 <b>촬영</b> 버튼을 누르면 포즈 참고 없이 카메라를 열 수 있어요. 자유 촬영에는 참고 사진 배경이나 포즈 틀이 표시되지 않아요.
        </GuideItem>
        <GuideItem number="4" title="카메라 화면의 AI 가이드">
          카메라에서 <b>AI 가이드 ON</b> 상태이면 삼등분 구도선, 수평계, 포즈 틀과 바다사자의 안내가 보여요. 포즈 틀 밖에 있으면 위치를 옮기라는 안내를 하고, 잘 맞으면 촬영을 권해요. 이 점수는 외모 평가가 아니라 관절 위치와 구도의 정렬 정도만 알려줘요.
        </GuideItem>
        <GuideItem number="5" title="확대와 카메라 전환">
          화면 아래의 <b>1× · 1.5× · 2×</b>를 눌러 확대를 바꿀 수 있어요. 오른쪽 아래의 회전 아이콘으로 전면·후면 카메라를 바꿉니다. 기기마다 지원하는 확대 배율은 조금 다를 수 있어요.
        </GuideItem>
        <GuideItem number="6" title="사진 촬영과 저장">
          가운데 셔터를 누르면 사진이 바로 기기에 내려받아지고, 동시에 앱의 <b>갤러리</b>에도 저장돼요. 연속 촬영이 가능하며, 왼쪽 아래의 작은 사진을 누르면 갤러리로 바로 이동합니다.
        </GuideItem>
        <GuideItem number="7" title="갤러리 관리">
          아래 메뉴의 <b>갤러리</b>에서 촬영한 사진을 다시 볼 수 있어요. 각 사진의 휴지통 버튼을 눌러 원하는 사진만 골라 삭제할 수 있어요.
        </GuideItem>
        <GuideItem number="8" title="내 사진 올리기와 댓글">
          홈 아래의 <b>내 갤러리에서 사진 추가</b>를 눌러 내 기기의 사진을 커스텀 사진으로 올릴 수 있어요. 올린 사진에는 내 닉네임이 표시되며, 휴지통으로 개별 삭제할 수 있어요. 내 댓글만 직접 지울 수 있고, 다른 사람 댓글은 신고 시 안전 필터가 확인해요.
        </GuideItem>
        <GuideItem number="9" title="MY와 화면 설정">
          아래 메뉴의 <b>MY</b>에서 이름과 프로필 사진을 바꿀 수 있어요. 홈 오른쪽 위 달·해 아이콘으로 앱 다크 모드를 켜거나 끌 수 있어요. <b>휴대폰과 브라우저 환경에 따라 화면이 다르게 보일 수 있어 다크 모드 사용은 권장하지 않아요.</b>
        </GuideItem>
        <GuideItem number="10" title="카메라가 열리지 않을 때">
          처음 촬영할 때 카메라 권한을 <b>허용</b>해 주세요. 거부했다면 휴대폰 설정 또는 브라우저 사이트 설정에서 카메라를 허용한 뒤 다시 시도하세요. 카메라가 없는 PC에서는 데모 화면으로도 기능을 살펴볼 수 있어요.
        </GuideItem>
      </div>
      <button className="primary guide-start" onClick={onClose} aria-label="홈으로 돌아가 바다사진 시작하기"><Camera /> 이제 바다사진 시작하기</button>
    </section>
  );
}
function GuideItem({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <article className="guide-item"><span>{number}</span><div><h2>{title}</h2><p>{children}</p></div></article>;
}
function PhotoEditor({ draft, onChange, onBack, onNext }: { draft: PostDraft; onChange: (draft: PostDraft) => void; onBack: () => void; onNext: () => void }) {
  const [recommendation, setRecommendation] = useState<EditRecommendation | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const [compare, setCompare] = useState(50);
  const [cropping, setCropping] = useState(false);
  const activeEdit = draft.edits[draft.activeIndex];
  const analyse = async (attempt = analysisAttempt) => { if (isAnalysing) return; setIsAnalysing(true); setAnalysisError(""); try { setRecommendation(await analysePhotoForEdit(draft.images[draft.activeIndex], attempt)); } catch { setAnalysisError("다시 분석하지 못했어요. 한 번 더 시도해 주세요."); } finally { setIsAnalysing(false); } };
  // The active photo is the only trigger; retry attempts are started directly by its button.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void analyse(analysisAttempt); }, [draft.activeIndex]);
  const updateEdit = (next: Partial<EditSettings>) => onChange({ ...draft, edits: draft.edits.map((edit, index) => index === draft.activeIndex ? { ...edit, ...next } : edit) });
  const applyAi = () => { if (recommendation) updateEdit({ mode: "ai", brightness: recommendation.brightness, saturation: recommendation.saturation, contrast: recommendation.contrast, temperature: recommendation.temperature }); };
  const reset = () => updateEdit({ ...defaultEditSettings });
  const filter = `brightness(${100 + activeEdit.brightness}%) saturate(${100 + activeEdit.saturation}%) contrast(${100 + activeEdit.contrast}%)`;
  if (cropping) return <CropEditor image={draft.originalImages[draft.activeIndex]} initialCrop={draft.crops[draft.activeIndex]} onCancel={() => setCropping(false)} onApply={async (crop) => {
    const output = await renderCrop(draft.originalImages[draft.activeIndex], crop);
    onChange({ ...draft, images: draft.images.map((image, index) => index === draft.activeIndex ? output : image), crops: draft.crops.map((item, index) => index === draft.activeIndex ? crop : item) });
    setCropping(false);
  }} />;
  return <section className="page editor-page page-enter">
    <header><button onClick={onBack} aria-label="사진 선택으로 돌아가기"><ChevronLeft /></button><b>사진 편집</b><button className="header-action" onClick={onNext} aria-label="새 게시물로 다음 단계">다음</button></header>
    <div className="edit-preview" style={{ transform: `rotate(${activeEdit.horizon}deg)` }}>
      <img src={draft.images[draft.activeIndex]} alt="원본 사진" />
      <div className="edit-after" style={{ width: `${compare}%` }}><img src={draft.images[draft.activeIndex]} style={{ filter }} alt="보정 미리보기" /></div>
      <span className="compare-line" style={{ left: `${compare}%` }}>‹›</span>
    </div>
    <input className="compare-range" type="range" min="0" max="100" value={compare} onChange={(event) => setCompare(Number(event.target.value))} aria-label="원본과 보정 비교 비율" />
    <div className="original-toggle"><button onClick={reset} className={activeEdit.mode === "original" ? "selected" : ""}>원본</button><button onClick={applyAi} className={activeEdit.mode !== "original" ? "selected" : ""}>보정</button></div>
    {draft.images.length > 1 && <div className="edit-pagination"><button disabled={draft.activeIndex === 0} onClick={() => onChange({ ...draft, activeIndex: draft.activeIndex - 1 })}>‹ 이전</button><b>{draft.activeIndex + 1} / {draft.images.length}</b><button disabled={draft.activeIndex === draft.images.length - 1} onClick={() => onChange({ ...draft, activeIndex: draft.activeIndex + 1 })}>다음 ›</button></div>}
    <div className="edit-tools">{([ ["original", "원본"], ["ai", "AI 보정"], ["brightness", "밝기"], ["tone", "색감"], ["horizon", "수평"], ["crop", "자르기"] ] as [EditSettings["mode"], string][]).map(([mode, label]) => <button key={mode} onClick={() => mode === "crop" ? setCropping(true) : mode === "ai" ? applyAi() : updateEdit({ mode })} className={activeEdit.mode === mode ? "selected" : ""} aria-label={`${label} 편집 선택`}><span>{mode === "ai" ? <Sparkles /> : mode === "brightness" ? "☀" : mode === "tone" ? "◉" : mode === "horizon" ? "⌁" : mode === "crop" ? "⌗" : "▣"}</span>{label}</button>)}</div>
    {(activeEdit.mode === "brightness" || activeEdit.mode === "tone" || activeEdit.mode === "horizon") && <label className="edit-slider">{activeEdit.mode === "brightness" ? "밝기" : activeEdit.mode === "tone" ? "색감" : "수평"}<input type="range" min={activeEdit.mode === "horizon" ? -3 : -20} max={activeEdit.mode === "horizon" ? 3 : 20} step={activeEdit.mode === "horizon" ? .5 : 1} value={activeEdit.mode === "brightness" ? activeEdit.brightness : activeEdit.mode === "tone" ? activeEdit.saturation : activeEdit.horizon} onChange={(event) => updateEdit(activeEdit.mode === "brightness" ? { brightness: Number(event.target.value) } : activeEdit.mode === "tone" ? { saturation: Number(event.target.value) } : { horizon: Number(event.target.value) })} /></label>}
    <section className="ai-recommendation"><div><Sparkles /><b>AI 추천 보정</b><button onClick={() => { const next = analysisAttempt + 1; setAnalysisAttempt(next); void analyse(next); }} disabled={isAnalysing} aria-label="사진 다시 추천">↻ 다시 추천</button><button onClick={reset} aria-label="추천 보정 되돌리기">되돌리기</button></div><p>{isAnalysing ? "사진을 다시 분석하고 있어요…" : analysisError || recommendation?.message || "사진을 살펴보고 있어요."}</p><ul><li>밝기 <b>+{recommendation?.brightness ?? 8}</b></li><li>대비 <b>+{recommendation?.contrast ?? 6}</b></li><li>바다 색감 <b>+{recommendation?.saturation ?? 12}</b></li><li>색온도 <b>+{recommendation?.temperature ?? 3}</b></li></ul><button className="apply-recommendation" onClick={applyAi} disabled={isAnalysing || !recommendation}>추천값 적용</button></section>
    <button className="primary editor-next" onClick={onNext} aria-label="사진 편집 후 새 게시물 작성"><Camera /> 다음: 게시물 작성</button>
  </section>;
}
function CropEditor({ image, initialCrop, onCancel, onApply }: { image: string; initialCrop?: CropData; onCancel: () => void; onApply: (crop: CropData) => void }) {
  const [crop, setCrop] = useState<CropData>(initialCrop || { x: .08, y: .08, width: .84, height: .84, ratio: "자유" });
  const ratios: Record<string, number | null> = { "AI 추천": null, "자유": null, "1:1": 1, "4:5": .8, "3:4": .75, "16:9": 16 / 9 };
  const choose = (ratio: string) => setCrop((current) => {
    if (ratio === "AI 추천") return { x: .08, y: .05, width: .84, height: .84, ratio };
    const value = ratios[ratio]; if (!value) return { ...current, ratio };
    const width = Math.min(.9, current.width); const height = Math.min(.9, width / value);
    return { x: (1 - width) / 2, y: (1 - height) / 2, width, height, ratio };
  });
  return <section className="crop-page">
    <header><button onClick={onCancel}>취소</button><b>사진 자르기</b><button className="header-action" onClick={() => onApply(crop)}>적용</button></header>
    <div className="crop-stage"><img src={image} alt="자르기 사진" /><div className="crop-shade" /><div className="crop-box" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}><i /><i /><i /><i /></div></div>
    <div className="crop-adjust"><label>가로 위치<input type="range" min="0" max={Math.max(0, 1 - crop.width)} step=".01" value={crop.x} onChange={(e) => setCrop({ ...crop, x: Number(e.target.value) })} /></label><label>세로 위치<input type="range" min="0" max={Math.max(0, 1 - crop.height)} step=".01" value={crop.y} onChange={(e) => setCrop({ ...crop, y: Number(e.target.value) })} /></label><label>크기<input type="range" min=".35" max=".95" step=".01" value={crop.width} onChange={(e) => setCrop({ ...crop, width: Number(e.target.value), height: crop.ratio in ratios && ratios[crop.ratio] ? Math.min(.95, Number(e.target.value) / (ratios[crop.ratio] || 1)) : crop.height })} /></label></div>
    <div className="crop-ratios">{Object.keys(ratios).map((ratio) => <button key={ratio} className={crop.ratio === ratio ? "selected" : ""} onClick={() => choose(ratio)}>{ratio}</button>)}</div><button className="crop-reset" onClick={() => setCrop({ x: .08, y: .08, width: .84, height: .84, ratio: "자유" })}>초기화</button>
  </section>;
}
function NewPost({ draft, onChange, onBack, onPublish }: { draft: PostDraft; onChange: (draft: PostDraft) => void; onBack: () => void; onPublish: () => void }) {
  const [tagInput, setTagInput] = useState("");
  const [captionIndex, setCaptionIndex] = useState(0);
  const caption = getRecommendedCaption(captionIndex);
  const addTag = () => { const tag = tagInput.trim().replace(/^#+/, "").replace(/\s+/g, ""); if (tag && !draft.hashtags.includes(tag)) onChange({ ...draft, hashtags: [...draft.hashtags, tag] }); setTagInput(""); };
  return <section className="page post-page page-enter">
    <header><button onClick={onBack} aria-label="사진 편집으로 돌아가기"><ChevronLeft /></button><b>새 게시물</b><span /></header>
    <div className="post-preview">{draft.images.map((image, index) => <img key={image} src={image} alt={`편집한 사진 ${index + 1}`} />)}</div>
    <textarea className="caption-input" value={draft.caption} onChange={(event) => onChange({ ...draft, caption: event.target.value })} aria-label="게시물 설명" placeholder="사진 설명을 입력하세요" />
    <section className="caption-recommendation"><SeaLionMascot small /><div><b>AI 문구 추천</b><p>{caption}</p><button onClick={() => setCaptionIndex((value) => value + 1)} aria-label="추천 문구 다시 받기">다시 추천</button><button onClick={() => onChange({ ...draft, caption })} aria-label="추천 문구 적용">적용</button></div></section>
    <div className="tag-list">{draft.hashtags.map((tag) => <button key={tag} onClick={() => onChange({ ...draft, hashtags: draft.hashtags.filter((item) => item !== tag) })} aria-label={`${tag} 태그 삭제`}>#{tag} ×</button>)}</div>
    <div className="inline-add"><input value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="해시태그 추가" aria-label="해시태그 입력" /><button onClick={addTag} aria-label="해시태그 추가">추가</button></div>
    <div className="post-settings"><label>장소<select value={draft.location} onChange={(event) => onChange({ ...draft, location: event.target.value })} aria-label="장소 선택"><option>부산 · 해운대</option><option>부산 · 광안리</option><option>부산 · 송도</option><option>장소 없음</option></select></label></div>
    <div className="switch-row"><span><b>댓글 허용</b><small>다른 이용자가 댓글을 남길 수 있어요.</small></span><button className={draft.commentsAllowed ? "switch on" : "switch"} onClick={() => onChange({ ...draft, commentsAllowed: !draft.commentsAllowed })} aria-label="댓글 허용 전환"><i /></button></div>
    <div className="switch-row"><span><b>커스텀 포즈 허용</b><small>다른 이용자가 이 포즈를 촬영 가이드로 사용할 수 있어요.</small></span><button className={draft.customPoseAllowed ? "switch on" : "switch"} onClick={() => onChange({ ...draft, customPoseAllowed: !draft.customPoseAllowed })} aria-label="커스텀 포즈 허용 전환"><i /></button></div>
    <button className="primary publish-button" onClick={onPublish} aria-label="게시물 업로드하기"><ImagePlus /> 업로드하기</button>
  </section>;
}
function Nav({
  goHome,
  goSaved,
  goMy,
  onCamera,
}: {
  goHome: () => void;
  goSaved: () => void;
  goMy: () => void;
  onCamera: () => void;
}) {
  return (
    <nav className="bottom-nav">
      <button aria-label="홈으로 이동" onClick={goHome}>
        <Grid2X2 />
        <span>홈</span>
      </button>
      <button className="nav-camera" aria-label="촬영하기" onClick={onCamera}>
        <Camera />
        <span>촬영</span>
      </button>
      <button aria-label="갤러리" onClick={goSaved}>
        <FolderHeart />
        <span>갤러리</span>
      </button>
      <button aria-label="내 정보" onClick={goMy}>
        <UserRound />
        <span>MY</span>
      </button>
    </nav>
  );
}
function CameraScreen({
  guide,
  referenceImage,
  latestPhoto,
  onClose,
  onCapture,
  onGallery,
}: {
  guide?: PoseGuide;
  referenceImage: string;
  latestPhoto?: string;
  onClose: () => void;
  onCapture: (v: string) => void;
  onGallery: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "live" | "demo" | "denied">(
    "loading",
  );
  const [guideOn, setGuideOn] = useState(true);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [zoom, setZoom] = useState(1);
  const [permissionAttempt, setPermissionAttempt] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchUnsupported, setTorchUnsupported] = useState(false);
  const [flashNotice, setFlashNotice] = useState("");
  const cameraGuide = getCameraGuide(guide);
  useEffect(() => {
    let stream: MediaStream;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
          setStatus("live");
        }
      } catch {
        setStatus("denied");
      }
    };
    void start();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [facing, permissionAttempt]);
  const changeZoom = async (next: number) => {
    setZoom(next);
    const track = (
      video.current?.srcObject as MediaStream | undefined
    )?.getVideoTracks()[0];
    try {
      await track?.applyConstraints({
        advanced: [{ zoom: next }],
      } as MediaTrackConstraints);
    } catch {
      /* 미지원 기기는 화면 확대를 사용 */
    }
  };
  const toggleTorch = async () => {
    const track = (video.current?.srcObject as MediaStream | undefined)?.getVideoTracks()[0];
    if (!track) {
      setFlashNotice("카메라를 연결한 뒤 플래시를 사용할 수 있어요.");
      setTorchUnsupported(true);
      window.setTimeout(() => setFlashNotice(""), 2200);
      return;
    }
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] } as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setFlashNotice("현재 브라우저에서는 플래시 제어를 지원하지 않습니다.");
      setTorchUnsupported(true);
      window.setTimeout(() => setFlashNotice(""), 2200);
    }
  };
  const snap = () => {
    if (status === "live" && video.current && canvas.current) {
      canvas.current.width = video.current.videoWidth;
      canvas.current.height = video.current.videoHeight;
      canvas.current.getContext("2d")?.drawImage(video.current, 0, 0);
      onCapture(canvas.current.toDataURL("image/jpeg", 0.92));
    } else
      onCapture(
        guide
          ? referenceImage || cards[0][2]
          : "data:image/svg+xml," +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960"><rect width="100%" height="100%" fill="#263342"/><text x="50%" y="50%" fill="white" text-anchor="middle" font-size="28">바다사진 일반 촬영</text></svg>',
              ),
      );
  };
  return (
    <section
      className={"camera-screen page-enter " + (guide ? "custom-camera" : "plain-camera")}
    >
      <div className={"camera-bg " + (status === "live" ? "live" : "")}>
        <video
          ref={video}
          style={{ transform: `scale(${zoom})` }}
          playsInline
          muted
        />
        {guide && <div className="demo-water" />}
      </div>
      <canvas ref={canvas} hidden />
      <div className="camera-ui">
        <div className="camera-top">
          <button onClick={onClose} aria-label="촬영 닫기">
            <X />
          </button>
          <button
            className="ai-toggle"
            onClick={() => setGuideOn(!guideOn)}
            aria-label="AI 가이드 켜기 또는 끄기"
          >
            <Sparkles /> AI 가이드 {guideOn ? "ON" : "OFF"}
          </button>
          <button className={torchOn ? "flash-on" : ""} onClick={() => void toggleTorch()} aria-label="플래시 켜기 또는 끄기" aria-pressed={torchOn} disabled={torchUnsupported}>
            <Zap />
          </button>
        </div>
        {flashNotice && <p className="flash-notice" role="status">{flashNotice}</p>}
        <div className="level" aria-label="수평계">
          <i />
          <i />
          <b /> <i />
          <i />
        </div>
        {guideOn && (
          <>
            <div className="thirds">
              <i />
              <i />
              <i />
              <i />
            </div>
            <PoseOverlay guide={guide} active />
            {guide && referenceImage && (
              <img
                className="reference-photo"
                src={referenceImage}
                alt="선택한 포즈 참고 사진"
              />
            )}
            <div className="match">
              {guide ? `포즈 ${cameraGuide.score}% 정렬` : "수평 안내"}
            </div>
            <div className="guide-bubble">
              <SeaLionMascot small />
              <p>{cameraGuide.message}</p>
            </div>
          </>
        )}{" "}
        {status === "denied" && (
          <div className="camera-note">
            <b>카메라 권한이 필요해요</b>
            <br />
            카메라를 허용하면 실제 화면으로 촬영합니다.
            <button onClick={() => setPermissionAttempt((x) => x + 1)}>
              카메라 권한 다시 요청
            </button>
            <button onClick={() => setStatus("demo")}>
              데모 화면으로 계속
            </button>
          </div>
        )}
        <div className="camera-bottom">
          <div className="zoom">
            <button
              onClick={() => changeZoom(1)}
              className={zoom === 1 ? "chosen" : ""}
            >
              1×
            </button>
            <button
              onClick={() => changeZoom(1.5)}
              className={zoom === 1.5 ? "chosen" : ""}
            >
              1.5×
            </button>
            <button
              onClick={() => changeZoom(2)}
              className={zoom === 2 ? "chosen" : ""}
            >
              2×
            </button>
          </div>
          <div className="tip">
            💡{" "}
            {guide
              ? "참고 사진의 포즈 틀에 들어오도록 위치를 맞춰 주세요."
              : "원하는 장면을 자유롭게 촬영해 보세요."}
          </div>
          <div className="shutter-row">
            <button className="thumb" onClick={onGallery} aria-label="갤러리 열기">
              <img src={latestPhoto || referenceImage || cards[0][2]} alt="가장 최근 촬영 사진" />
            </button>
            <button className="shutter" onClick={snap} aria-label="사진 촬영">
              <i />
            </button>
            <button
              onClick={() =>
                setFacing((x) => (x === "environment" ? "user" : "environment"))
              }
              aria-label="카메라 전환"
            >
              <RotateCw />
            </button>
          </div>
          <div className="mode">
            <b>사진</b>
            <span>영상 (준비 중)</span>
          </div>
        </div>
      </div>
    </section>
  );
}
function Saved({
  photos,
  onHome,
  onCamera,
  onDelete,
  savedPosts,
  onOpenSavedPost,
}: {
  photos: StoredPhoto[];
  onHome: () => void;
  onCamera: () => void;
  onDelete: (id: string) => void;
  savedPosts: UploadedPhoto[];
  onOpenSavedPost: (post: UploadedPhoto) => void;
}) {
  return (
    <section className="page saved page-enter">
      <header>
        <button onClick={onHome} aria-label="홈으로 돌아가기">
          <ChevronLeft />
        </button>
        <b>갤러리</b>
        <span />
      </header>
      {photos.length ? (
        <div className="saved-grid">
          {photos.map((p) => (
            <article key={p.id}>
              <img src={p.dataUrl} />
              <button
                className="delete-photo"
                onClick={() => onDelete(p.id)}
                aria-label="갤러리 사진 삭제"
              >
                <Trash2 />
              </button>
              <b>{p.place}</b>
              <small>{p.poseName || "자유 촬영"}</small>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <SeaLionMascot />
          <h2>아직 촬영한 사진이 없어요</h2>
          <p>마음에 드는 바다 풍경을 촬영해 보세요.</p>
          <button className="primary" onClick={onCamera}>
            <Camera /> 촬영 시작
          </button>
        </div>
      )}
      {savedPosts.length > 0 && <section className="saved-custom-section">
        <h2>저장한 커스텀 사진</h2>
        <div className="saved-custom-grid">{savedPosts.map((post) => <button key={post.id} onClick={() => onOpenSavedPost(post)} aria-label={`${post.authorName || "사용자"}의 저장한 커스텀 사진 열기`}><img src={post.dataUrl} alt="저장한 커스텀 사진" /><span>@{post.authorName || "바다사진 사용자"}</span></button>)}</div>
      </section>}
    </section>
  );
}
function My({
  onHome,
  onCamera,
}: {
  onHome: () => void;
  onCamera: () => void;
}) {
  const [name, setName] = useState(
    () => localStorage.getItem("bada-profile-name") || "바다랑",
  );
  const [avatar, setAvatar] = useState(
    () => localStorage.getItem("bada-profile-avatar") || "",
  );
  const [editing, setEditing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    () => localStorage.getItem("bada-profile-status") || "부산 바다여행자",
  );
  const [editingStatus, setEditingStatus] = useState(false);
  const syncProfile = (nextName = name, nextStatus = statusMessage, nextAvatar = avatar) =>
    void updateMyProfile({ nickname: nextName, bio: nextStatus, avatarUrl: nextAvatar }).catch(() => undefined);
  const saveName = () => {
    const next = name.trim() || "바다랑";
    setName(next);
    localStorage.setItem("bada-profile-name", next);
    syncProfile(next);
    setEditing(false);
  };
  const saveStatus = () => {
    const next = statusMessage.trim() || "부산 바다여행자";
    setStatusMessage(next);
    localStorage.setItem("bada-profile-status", next);
    syncProfile(name, next);
    setEditingStatus(false);
  };
  const changeAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      setAvatar(value);
      localStorage.setItem("bada-profile-avatar", value);
      syncProfile(name, statusMessage, value);
    };
    reader.readAsDataURL(file);
  };
  return (
    <section className="page my page-enter">
      <header>
        <button onClick={onHome} aria-label="홈으로 돌아가기">
          <ChevronLeft />
        </button>
        <b>MY</b>
        <span />
      </header>
      <div className="my-profile">
        <label className="avatar-edit" aria-label="프로필 사진 변경">
          {avatar ? (
            <img src={avatar} alt="내 프로필 사진" />
          ) : (
            <SeaLionMascot />
          )}
          <span>사진 변경</span>
          <input type="file" accept="image/*" onChange={changeAvatar} />
        </label>
        <div>
          {editing ? (
            <div className="name-edit">
              <input
                aria-label="내 이름"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
              />
              <button onClick={saveName}>저장</button>
            </div>
          ) : (
            <>
              <h2>{name}</h2>
              <button
                className="edit-name"
                onClick={() => setEditing(true)}
                aria-label="내 이름 변경"
              >
                이름 변경
              </button>
            </>
          )}
          {editingStatus ? (
            <div className="status-edit">
              <input aria-label="상태 메시지" value={statusMessage} maxLength={60} onChange={(e) => setStatusMessage(e.target.value)} />
              <button onClick={saveStatus}>저장</button>
            </div>
          ) : (
            <div className="status-message"><p>{statusMessage}</p><button onClick={() => setEditingStatus(true)} aria-label="상태 메시지 변경">상태 메시지 변경</button></div>
          )}
        </div>
      </div>
      <section className="my-card">
        <h3>나의 바다사진</h3>
        <p>좋아하는 바다의 구도와 포즈를 저장해 보세요.</p>
        <button className="primary" onClick={onCamera}>
          <Camera /> 새 사진 촬영
        </button>
      </section>
    </section>
  );
}
export default App;
