/** Live collaboration state: connected peers and their active elements. */
import { create } from "zustand";
import type { PresenceInfo } from "../firebase/sync";

/* Collaborator cursor colors from the data set (cool, no amber/warm). */
export const PEER_COLORS = [
  "#2b54f0",
  "#6e4bf0",
  "#119c8b",
  "#ff6b5c",
  "#5e80ff",
  "#2fc9b0",
];

export interface CollabState {
  /** This user's presence identity. */
  selfId: string | null;
  selfColor: string;
  peers: PresenceInfo[];
  setSelf: (id: string) => void;
  setPeers: (peers: PresenceInfo[]) => void;
  /** Peers (excluding self) currently on a given element. */
  peersOn: (elementId: string) => PresenceInfo[];
}

export const useCollabStore = create<CollabState>((set, get) => ({
  selfId: null,
  selfColor: PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)],
  peers: [],
  setSelf: (selfId) => set({ selfId }),
  setPeers: (peers) => set({ peers }),
  peersOn: (elementId) =>
    get().peers.filter(
      (p) => p.elementId === elementId && p.userId !== get().selfId,
    ),
}));
