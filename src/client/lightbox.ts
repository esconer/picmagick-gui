/**
 * Photo Lightbox / Modal Image Expander
 *
 * Provides a distraction-free, full-resolution preview overlay with
 * Next / Prev navigation buttons, keyboard navigation (left/right arrows, esc),
 * loading spinner, and image metadata.
 */
import { $, fmt } from "./dom";
import type { ScannedFile } from "./types";

export type LightboxController = {
  open: (rel: string, filesProvider?: () => ScannedFile[]) => void;
  close: () => void;
  isOpen: () => boolean;
};

export function createLightbox(getFiles: () => ScannedFile[]): LightboxController {
  const overlay = $("lightbox");
  const titleEl = $("lightboxTitle");
  const counterEl = $("lightboxCounter");
  const infoEl = $("lightboxInfo");
  const closeBtn = $("lightboxClose");
  const prevBtn = $("lightboxPrev") as HTMLButtonElement;
  const nextBtn = $("lightboxNext") as HTMLButtonElement;
  const imgEl = $("lightboxImg") as HTMLImageElement;
  const spinnerEl = $("lightboxSpinner");

  let currentFiles: ScannedFile[] = [];
  let currentIndex = -1;

  const update = (): void => {
    if (currentIndex < 0 || currentIndex >= currentFiles.length) return;
    const file = currentFiles[currentIndex];

    titleEl.textContent = file.name;
    counterEl.textContent = `${currentIndex + 1} of ${currentFiles.length}`;
    infoEl.textContent = `${fmt(file.size)} · ${file.ext.toUpperCase()}`;

    prevBtn.disabled = currentFiles.length <= 1;
    nextBtn.disabled = currentFiles.length <= 1;

    spinnerEl.classList.remove("hidden");
    imgEl.classList.add("loading");

    const fullSrc = `/api/view-image?rel=${encodeURIComponent(file.rel)}`;
    imgEl.src = fullSrc;
    imgEl.alt = file.name;
  };

  imgEl.addEventListener("load", () => {
    spinnerEl.classList.add("hidden");
    imgEl.classList.remove("loading");
  });

  imgEl.addEventListener("error", () => {
    spinnerEl.classList.add("hidden");
    imgEl.classList.remove("loading");
  });

  const next = (): void => {
    if (currentFiles.length <= 1) return;
    currentIndex = (currentIndex + 1) % currentFiles.length;
    update();
  };

  const prev = (): void => {
    if (currentFiles.length <= 1) return;
    currentIndex = (currentIndex - 1 + currentFiles.length) % currentFiles.length;
    update();
  };

  const close = (): void => {
    overlay.classList.add("hidden");
    imgEl.src = "";
    currentIndex = -1;
  };

  const open = (rel: string, filesProvider?: () => ScannedFile[]): void => {
    const list = filesProvider ? filesProvider() : getFiles();
    currentFiles = list;
    if (currentFiles.length === 0) return;
    const idx = currentFiles.findIndex((f) => f.rel === rel);
    currentIndex = idx >= 0 ? idx : 0;
    overlay.classList.remove("hidden");
    update();
  };

  closeBtn.addEventListener("click", close);
  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    next();
  });
  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    prev();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || (e.target as HTMLElement).classList.contains("lightbox-stage")) {
      close();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (overlay.classList.contains("hidden")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
  });

  return {
    open,
    close,
    isOpen: () => !overlay.classList.contains("hidden"),
  };
}
