import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Camera,
  ChevronLeft,
  Flame,
  FolderHeart,
  Grid2X2,
  Heart,
  ImagePlus,
  MapPin,
  MessageCircle,
  Moon,
  MoreHorizontal,
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
  type PoseGuide,
} from "./services/poseDetectionService";
import {
  deletePhoto,
  deleteUpload,
  getPhotos,
  getUploads,
  savePhoto,
  saveUpload,
  type StoredPhoto,
  type UploadedPhoto,
} from "./services/storageService";
import { getCameraGuide } from "./services/cameraGuideService";
import { isInappropriateComment } from "./services/commentModerationService";
declare global {
  interface MediaTrackConstraintSet {
    zoom?: number;
  }
}
type Screen = "onboarding" | "home" | "camera" | "saved" | "my";
const assetBase = import.meta.env.BASE_URL;
const cards: [string, string, string, number][] = [
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
  const [uploaded, setUploaded] = useState<UploadedPhoto[]>([]);
  const [browseMode, setBrowseMode] = useState(false);
  const [dark, setDark] = useState(
    () => localStorage.getItem("bada-dark") === "true",
  );
  const openCamera = async (p = "자유 촬영", image = "") => {
    setPlace(p);
    setReferenceImage(image);
    setGuide(
      p === "자유 촬영"
        ? undefined
        : ((await analyseReferencePose(p)) ?? undefined),
    );
    setScreen("camera");
  };
  const refresh = () =>
    getPhotos()
      .then(setSaved)
      .catch(() => setSaved([]));
  useEffect(() => {
    void refresh();
    void getUploads().then(setUploaded).catch(() => setUploaded([]));
  }, []);
  const capture = async (data: string) => {
    const link = document.createElement("a");
    link.href = data;
    link.download = `bada-photo-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
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
  return (
    <main className={`app-shell ${dark ? "dark" : ""}`}>
      {screen === "onboarding" && <Onboarding onStart={() => { localStorage.setItem("bada-onboarding", "done"); setScreen("home"); }} />}
      {screen === "home" && (
        <Home
          onCustom={openCamera}
          uploaded={uploaded}
          onUpload={async (dataUrl) => { await saveUpload({ id: crypto.randomUUID(), dataUrl, createdAt: Date.now() }); setUploaded(await getUploads()); }}
          onRemoveUpload={async (id) => { await deleteUpload(id); setUploaded(await getUploads()); }}
          dark={dark}
          onToggleDark={toggleDark}
          onBrowseModeChange={setBrowseMode}
        />
      )}{" "}
      {screen === "camera" && (
        <CameraScreen
          place={place}
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
  return <section className="onboarding"><SeaLionMascot /><h1>바다를 더 멋지게 담아보세요</h1><p>마음에 드는 바다 사진의 포즈를 골라<br/>AI 가이드와 함께 나만의 사진을 촬영할 수 있어요.</p><button className="primary" onClick={onStart}>준비되셨나요?</button></section>;
}

function Home({
  onCustom,
  uploaded,
  onUpload,
  onRemoveUpload,
  dark,
  onToggleDark,
  onBrowseModeChange,
}: {
  onCustom: (p: string, image?: string) => void;
  uploaded: UploadedPhoto[];
  onUpload: (u: string) => void | Promise<void>;
  onRemoveUpload: (id: string) => void | Promise<void>;
  dark: boolean;
  onToggleDark: () => void;
  onBrowseModeChange: (active: boolean) => void;
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
  } | null>(null);
  type CommentItem = { text: string; author: "me" | "other" };
  const [comments, setComments] = useState<Record<string, CommentItem[]>>(() => {
    const saved = JSON.parse(localStorage.getItem("bada-comments") || "{}");
    return Object.fromEntries(Object.entries(saved).map(([id, items]) => [id, (items as (string | CommentItem)[]).map((item) => typeof item === "string" ? { text: item, author: "other" as const } : item)]));
  });
  const [comment, setComment] = useState("");
  const nickname = localStorage.getItem("bada-profile-name") || "바다랑";
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => onUpload(String(r.result));
      r.readAsDataURL(f);
    }
  };
  const toggleLike = (id: string) =>
    setLikes((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem("bada-likes", JSON.stringify(next));
      return next;
    });
  const saveComments = (next: Record<string, CommentItem[]>) => {
    setComments(next);
    localStorage.setItem("bada-comments", JSON.stringify(next));
  };
  const displayCards: [string, string, string, number][] = [
    ...uploaded.map(
      (u) =>
        [`uploaded-${u.id}`, `@${nickname}`, u.dataUrl, 0] as [
          string,
          string,
          string,
          number,
        ],
    ),
    ...cards,
  ].filter(([, account]) =>
    account.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page home">
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
      {!showAll && <section className="mascot-intro"><SeaLionMascot /><div className="mascot-speech"><b>안녕하세요! 바다사자 바다랑이에요.</b><p>마음에 드는 사진의 포즈를 골라<br/>더 멋진 바다사진을 촬영해 보세요!</p></div></section>}
      <div className="section-title">
        <h2>
          <Flame /> 커스텀 사진
        </h2>
        <button onClick={() => { const next = !showAll; setShowAll(next); setSearching(next); onBrowseModeChange(next); }} aria-label="커스텀 사진 전체보기">{showAll ? "접기" : "전체보기 ›"}</button>
      </div>
      <div className={`photo-grid photo-grid-scroll ${showAll ? "photo-grid-expanded" : ""}`}>
        {displayCards.map(([id, account, img, count]) => (
          <article className="photo-card" key={id + img}>
            <button
              className="photo-open"
              onClick={() => setDetail({ id, account, image: img })}
              aria-label={`${account} 사진 댓글 보기`}
            >
              <img src={img} alt={`${account} 업로드 사진`} />
            </button>
            <div className="photo-shade" />
            <div className="card-top">
              <b>{account}</b>
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
                {id.startsWith("uploaded-") && (
                <button
                  className="remove-upload"
                  onClick={() => onRemoveUpload(id.replace("uploaded-", ""))}
                  aria-label="내가 올린 사진 삭제"
                >
                  <Trash2 />
                </button>
              )}
              <button
                onClick={() => onCustom(id, img)}
                aria-label={`${account} 사진으로 촬영하기`}
              >
                커스텀
              </button>
              </div>
          </article>
        ))}
      </div>
      {!displayCards.length && <p className="no-search">검색 결과가 없어요.</p>}
      <label className="upload-card separate-upload-card">
        <ImagePlus /> 내 갤러리에서 사진 추가
        <input type="file" accept="image/*" onChange={pick} />
      </label>
      {detail && (
        <section className="comment-sheet">
          <button
            className="sheet-close"
            onClick={() => setDetail(null)}
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
                {item.author === "me" ? <button onClick={() => saveComments({ ...comments, [detail.id]: (comments[detail.id] || []).filter((_, i) => i !== index) })} aria-label="내 댓글 삭제"><Trash2 /></button> : <button onClick={() => { if (isInappropriateComment(item.text)) saveComments({ ...comments, [detail.id]: (comments[detail.id] || []).filter((_, i) => i !== index) }); else window.alert("AI 안전 필터가 부적절한 표현을 찾지 못했어요."); }} aria-label="댓글 신고"><ShieldAlert /></button>}
              </p>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (comment.trim()) {
                saveComments({
                  ...comments,
                  [detail.id]: [...(comments[detail.id] || []), { text: comment.trim(), author: "me" }],
                });
                setComment("");
              }
            }}
          >
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="댓글을 입력하세요"
              aria-label="댓글 입력"
            />
            <button aria-label="댓글 등록">
              <MessageCircle />
            </button>
          </form>
        </section>
      )}
    </div>
  );
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
  place,
  guide,
  referenceImage,
  latestPhoto,
  onClose,
  onCapture,
  onGallery,
}: {
  place: string;
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
      className={"camera-screen " + (guide ? "custom-camera" : "plain-camera")}
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
          <button aria-label="플래시">
            <Zap />
          </button>
          <button aria-label="추가 메뉴">
            <MoreHorizontal />
          </button>
        </div>
        <div className="camera-place">
          <MapPin /> {place}
        </div>
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
}: {
  photos: StoredPhoto[];
  onHome: () => void;
  onCamera: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="page saved">
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
  const saveName = () => {
    const next = name.trim() || "바다랑";
    setName(next);
    localStorage.setItem("bada-profile-name", next);
    setEditing(false);
  };
  const changeAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      setAvatar(value);
      localStorage.setItem("bada-profile-avatar", value);
    };
    reader.readAsDataURL(file);
  };
  return (
    <section className="page my">
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
          <p>부산 바다여행자</p>
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
