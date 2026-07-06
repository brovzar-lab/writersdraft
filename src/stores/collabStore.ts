/** Live collaboration state: connected peers and their active elements. */
import { create } from 'zustand'
import type { PresenceInfo } from '../firebase/sync'

export const PEER_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']

export interface CollabState {
  /** This user's presence identity. */
  selfId: string | null
  selfColor: string
  peers: PresenceInfo[]
  setSelf: (id: string) => void
  setPeers: (peers: PresenceInfo[]) => void
  /** Peers (excluding self) currently on a given element. */
  peersOn: (elementId: string) => PresenceInfo[]
}

export const useCollabStore = create<CollabState>((set, get) => ({
  selfId: null,
  selfColor: PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)],
  peers: [],
  setSelf: (selfId) => set({ selfId }),
  setPeers: (peers) => set({ peers }),
  peersOn: (elementId) =>
    get().peers.filter((p) => p.elementId === elementId && p.userId !== get().selfId),
}))
