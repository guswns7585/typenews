import { getSupabaseClient } from "@/lib/supabase/client";

const STORAGE_KEY = "typenews.active-practice-profile.v1";
const CHANGE_EVENT = "typenews:practice-profile-change";

export type TypingPracticeProfile = {
  id: string;
  name: string;
  generation: number;
  is_default: boolean;
  archived: boolean;
};

let activeProfile: TypingPracticeProfile | null = null;
let loadingProfile: Promise<TypingPracticeProfile | null> | null = null;

function storedId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function getActivePracticeProfile() {
  return activeProfile;
}

export async function loadPracticeProfiles() {
  const supabase = getSupabaseClient();
  if (!supabase) return [] as TypingPracticeProfile[];
  const { data, error } = await supabase.rpc("get_my_typing_practice_profiles");
  if (error) throw error;
  return (data ?? []) as TypingPracticeProfile[];
}

export async function ensureActivePracticeProfile() {
  if (activeProfile) return activeProfile;
  if (loadingProfile) return loadingProfile;
  loadingProfile = loadPracticeProfiles()
    .then((profiles) => {
      const selected = profiles.find((profile) => profile.id === storedId() && !profile.archived)
        ?? profiles.find((profile) => profile.is_default && !profile.archived)
        ?? profiles.find((profile) => !profile.archived)
        ?? null;
      activeProfile = selected;
      if (selected && typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, selected.id);
      return selected;
    })
    .catch(() => null)
    .finally(() => { loadingProfile = null; });
  return loadingProfile;
}

export function setActivePracticeProfile(profile: TypingPracticeProfile | null) {
  activeProfile = profile;
  if (typeof window === "undefined") return;
  if (profile) window.localStorage.setItem(STORAGE_KEY, profile.id);
  else window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: profile }));
}

export function subscribePracticeProfile(listener: (profile: TypingPracticeProfile | null) => void) {
  if (typeof window === "undefined") return () => {};
  const onChange = (event: Event) => listener((event as CustomEvent<TypingPracticeProfile | null>).detail);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

export function clearPracticeProfileSession() {
  activeProfile = null;
  loadingProfile = null;
}
