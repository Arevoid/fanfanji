import type { ForumUserProfile } from "../../../types";
import { commitForumMutation } from "../../../core/storage/repositories/forumRepository";
import { imageAssetDb } from "../../../utils/imageAssetDb";
import { compressImage } from "../../../utils/stickerDb";

interface UseForumProfileActionsOptions {
  activeIdentityId: string;
  activeProfile: ForumUserProfile;
  profiles: readonly ForumUserProfile[];
  profileName: string;
  profileBio: string;
  onProfileSaved: () => void;
  onStorageError: () => void;
  setError: (message: string) => void;
}

export function useForumProfileActions({
  activeIdentityId,
  activeProfile,
  profiles,
  profileName,
  profileBio,
  onProfileSaved,
  onStorageError,
  setError,
}: UseForumProfileActionsOptions) {
  const saveProfile = () => {
    const displayName = profileName.trim();
    if (!displayName) {
      setError("昵称不能为空");
      return;
    }
    const nextProfile = {
      ...activeProfile,
      displayName: displayName.slice(0, 32),
      bio: profileBio.trim().slice(0, 160),
      updatedAt: Date.now(),
    };
    if (commitForumMutation({ profiles: [...profiles.filter((item) => item.ownerIdentityId !== activeIdentityId), nextProfile] })) {
      onProfileSaved();
    } else {
      onStorageError();
    }
  };

  const uploadProfileAvatar = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    try {
      const blob = await compressImage(file);
      const assetId = `forum-profile-avatar-${activeIdentityId}`;
      await imageAssetDb.saveImage(assetId, blob);
      const next = { ...activeProfile, avatarAssetId: assetId, updatedAt: Date.now() };
      if (!commitForumMutation({ profiles: [...profiles.filter((item) => item.ownerIdentityId !== activeIdentityId), next] })) onStorageError();
    } catch {
      setError("头像保存失败，请重试");
    }
  };

  return { saveProfile, uploadProfileAvatar };
}
