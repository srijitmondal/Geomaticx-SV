// store.ts
import { create } from 'zustand';

interface ImageStore {
  selectedImage: string | null;
  setSelectedImage: (image: string | null) => void;
}

export const useImageStore = create<ImageStore>((set) => ({
  selectedImage: null,
  setSelectedImage: (image) => set({ selectedImage: image }),
}));