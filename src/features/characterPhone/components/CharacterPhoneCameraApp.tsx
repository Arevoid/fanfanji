import React, { useEffect, useMemo, useState } from "react";
import { Camera, Image, LoaderCircle, ScanLine, Type } from "lucide-react";
import type { Character } from "../../../types";
import type { CharacterPhoneImageSaveInput, CharacterPhoneRecord } from "../../../domain/characterPhone/types";
import { StoredCharacterPhoneImage } from "./StoredCharacterPhoneImage";
import { getCharacterPhoneGalleryImageDataUrl } from "../characterPhoneTextImage";

interface CharacterPhoneCameraAppProps {
  phone: CharacterPhoneRecord;
  character: Character;
  onSaveImage?: (input: CharacterPhoneImageSaveInput) => void | Promise<void>;
  onCreateTextImage?: (text: string) => boolean | Promise<boolean>;
  onOpenGallery: () => void;
}

function readImageDimensions(file: Blob): Promise<{ width?: number; height?: number }> {
  if (typeof createImageBitmap !== "function") return Promise.resolve({});
  return createImageBitmap(file)
    .then((bitmap) => {
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    })
    .catch(() => ({}));
}

export function CharacterPhoneCameraApp({
  phone,
  character,
  onSaveImage,
  onCreateTextImage,
  onOpenGallery,
}: CharacterPhoneCameraAppProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingTextImage, setIsCreatingTextImage] = useState(false);
  const [notice, setNotice] = useState("");
  const [textImageDraft, setTextImageDraft] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recentImages = useMemo(
    () => phone.galleryItems
      .filter((item) => !item.deletedAt && !item.hidden && (item.imageAssetId || getCharacterPhoneGalleryImageDataUrl(item)))
      .slice()
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 4),
    [phone.galleryItems],
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setNotice("");
    if (!file.type.startsWith("image/")) {
      setNotice("只能保存图片格式。");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setNotice("图片不能超过 12MB。");
      return;
    }
    if (!onSaveImage) {
      setNotice("当前角色手机没有可用的本地相册存储。");
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return nextPreviewUrl;
    });
    setIsSaving(true);
    try {
      const dimensions = await readImageDimensions(file);
      const now = Date.now();
      await onSaveImage({
        ownerIdentityId: phone.ownerIdentityId,
        characterId: phone.characterId,
        imageBlob: file,
        imageMimeType: file.type,
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        title: `${character.name || "角色"}的照片`,
        caption: "从相机保存的生活照片",
        source: "camera",
        sourceKey: `camera-${now}`,
      });
      setNotice("已保存到角色相册。相册中的照片会保留原始图片，不会上传到生成接口。");
    } catch {
      setNotice("保存照片失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateTextImage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = textImageDraft.trim().replace(/\s+/g, " ").slice(0, 160);
    if (!text) {
      setNotice("请输入文字图内容。");
      return;
    }
    if (!onCreateTextImage) {
      setNotice("当前角色手机没有可用的文字图存储。");
      return;
    }
    setIsCreatingTextImage(true);
    setNotice("");
    try {
      const created = await onCreateTextImage(text);
      if (created === false) {
        setNotice("相同内容的文字图已经存在。");
        return;
      }
      setTextImageDraft("");
      setNotice("文字图已保存到角色相册。");
    } catch {
      setNotice("文字图保存失败，请稍后重试。");
    } finally {
      setIsCreatingTextImage(false);
    }
  };

  return (
    <div className="-mx-5 flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#111418] px-4 pb-6 pt-4 text-white">
      <section className="relative flex min-h-[250px] flex-1 flex-col items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_50%_38%,rgba(119,136,162,0.28),transparent_48%),linear-gradient(145deg,#272d37,#0c0f14)] p-6 text-center shadow-[0_18px_40px_rgba(0,0,0,0.26)]">
        {previewUrl ? (
          <img src={previewUrl} alt="待保存的照片预览" className="absolute inset-0 h-full w-full object-contain opacity-80" />
        ) : (
          <>
            <ScanLine className="absolute inset-0 m-auto h-32 w-32 text-white/10" strokeWidth={1} />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl border border-white/15 bg-white/10 text-white/90">
              <Camera className="h-8 w-8" />
            </div>
          </>
        )}
        {isSaving && (
          <div className="absolute inset-x-4 bottom-4 flex items-center justify-center gap-2 rounded-full bg-black/45 px-3 py-2 text-[11px] text-white/90 backdrop-blur-md">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> 正在保存到相册…
          </div>
        )}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-xs font-bold text-neutral-900 shadow-lg transition-transform active:scale-95">
          <Camera className="h-4 w-4" />拍照 / 导入
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} disabled={isSaving} />
        </label>
        <button type="button" onClick={onOpenGallery} className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-3 text-xs font-bold text-white/90 transition-colors hover:bg-white/15">
          <Image className="h-4 w-4" />打开相册
        </button>
      </div>

      <form onSubmit={handleCreateTextImage} className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white/85">
          <Type className="h-4 w-4 text-white/60" />
          <span>文字图</span>
          <span className="ml-auto text-[10px] font-medium text-white/40">本地保存</span>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            aria-label="文字图内容"
            value={textImageDraft}
            onChange={(event) => setTextImageDraft(event.target.value)}
            placeholder="输入文字，例如：拍照"
            maxLength={160}
            className="min-w-0 flex-1 rounded-xl border border-white/10 !bg-black/30 !text-white px-3 py-2 text-xs outline-none placeholder:!text-white/55 focus:border-white/30"
            style={{ "--input-bg": "rgba(0,0,0,0.3)", "--text-primary": "#fff" } as React.CSSProperties}
            disabled={isCreatingTextImage}
          />
          <button
            type="submit"
            disabled={isCreatingTextImage}
            className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-neutral-900 transition-transform active:scale-95 disabled:cursor-wait disabled:opacity-60"
          >
            {isCreatingTextImage ? "生成中…" : "生成文字图"}
          </button>
        </div>
      </form>

      {notice && <p role="status" className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-center text-[11px] leading-5 text-white/75">{notice}</p>}

      <section className="mt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Recent captures</p>
            <h2 className="mt-1 text-sm font-bold text-white/90">最近保存</h2>
          </div>
          <span className="text-[10px] text-white/40">{recentImages.length} 张</span>
        </div>
        {recentImages.length > 0 ? (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {recentImages.map((item) => (
              <button key={item.id} type="button" onClick={onOpenGallery} className="aspect-square overflow-hidden rounded-xl bg-white/10 text-left">
                {item.imageAssetId ? <StoredCharacterPhoneImage assetId={item.imageAssetId} alt={item.title} className="h-full w-full object-cover" /> : getCharacterPhoneGalleryImageDataUrl(item) ? <img src={getCharacterPhoneGalleryImageDataUrl(item)} alt={item.title} className="h-full w-full object-cover" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
