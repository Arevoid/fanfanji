import type { IdentityMusicState, MusicTrack, RelationshipMusicState } from "../../types";

const MUSIC_TOPIC_PATTERN = /(?:音乐|歌曲?|歌手|专辑|歌词|听歌|正在听|听什么歌|分享音乐|推荐(?:一首|点)?歌|播放(?:一首|这首|音乐)?)/i;

export const isMusicTopic = (userText: string) => MUSIC_TOPIC_PATTERN.test(userText.trim());

const describeTrack = (trackId: string | undefined, tracks: readonly MusicTrack[]) => {
  if (!trackId) return undefined;
  const track = tracks.find((item) => item.id === trackId);
  return track ? `《${track.title}》— ${track.artist}` : undefined;
};

export const buildRelationMusicContext = (input: {
  userText: string;
  ownerIdentityId: string;
  relationId: string;
  tracks: readonly MusicTrack[];
  identityStates: readonly IdentityMusicState[];
  relationshipStates: readonly RelationshipMusicState[];
}) => {
  if (!isMusicTopic(input.userText)) return "";
  const identityState = input.identityStates.find((state) => state.ownerIdentityId === input.ownerIdentityId);
  const relationshipState = input.relationshipStates.find((state) => state.relationId === input.relationId);
  const userTrack = describeTrack(identityState?.currentTrackId, input.tracks);
  const characterTrack = describeTrack(relationshipState?.currentTrackId, input.tracks);
  if (!userTrack && !characterTrack) return "";
  return `[Current relation music context]
- The user recently listened to: ${userTrack || "no recorded track"}.
- You recently listened to in this relationship: ${characterTrack || "no recorded track"}.
- You may naturally discuss, evaluate, recommend or share thoughts about these songs.
- Never autoplay music, send audio, or generate/send an image because of this context.`;
};
