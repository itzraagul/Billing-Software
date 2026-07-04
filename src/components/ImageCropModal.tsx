import { useState, useRef, useCallback } from 'react';

interface ImageCropModalProps {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
  /** Output image size in px (square). Default 400. */
  outputSize?: number;
  title?: string;
}

/**
 * A lightweight circular photo cropper: drag to reposition, slider to zoom.
 * No external dependencies — pure canvas + pointer events.
 */
export default function ImageCropModal({ imageSrc, onCancel, onConfirm, outputSize = 400, title = 'Adjust Photo' }: ImageCropModalProps) {
  const VIEWPORT = 280; // css px, square crop viewport shown on screen
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // offset from center, in css px
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    setZoom(1);
    setPos({ x: 0, y: 0 });
  };

  // baseScale: the zoom=1 scale that makes the image fully COVER the viewport
  const baseScale = imgSize ? Math.max(VIEWPORT / imgSize.w, VIEWPORT / imgSize.h) : 1;
  const scale = baseScale * zoom;
  const dispW = imgSize ? imgSize.w * scale : 0;
  const dispH = imgSize ? imgSize.h * scale : 0;

  // Clamp position so the image always covers the viewport (no empty gaps)
  const clamp = useCallback((x: number, y: number) => {
    const maxX = Math.max(0, (dispW - VIEWPORT) / 2);
    const maxY = Math.max(0, (dispH - VIEWPORT) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }, [dispW, dispH]);

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(clamp(dragRef.current.origX + dx, dragRef.current.origY + dy));
  };
  const handlePointerUp = () => { dragRef.current = null; };

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    // re-clamp position for the new scale so image doesn't drift out of cover
    const newBaseScale = imgSize ? Math.max(VIEWPORT / imgSize.w, VIEWPORT / imgSize.h) : 1;
    const newScale = newBaseScale * newZoom;
    const newDispW = imgSize ? imgSize.w * newScale : 0;
    const newDispH = imgSize ? imgSize.h * newScale : 0;
    const maxX = Math.max(0, (newDispW - VIEWPORT) / 2);
    const maxY = Math.max(0, (newDispH - VIEWPORT) / 2);
    setPos(p => ({ x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) }));
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img || !imgSize) return;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d')!;
    // Map viewport-space crop (VIEWPORT x VIEWPORT, centered, offset by pos) to source image pixels
    const outScale = outputSize / VIEWPORT;
    // Source rect in original image pixel coordinates
    const srcScale = scale; // css px per source px
    const srcVisibleW = VIEWPORT / srcScale;
    const srcVisibleH = VIEWPORT / srcScale;
    const srcCenterX = imgSize.w / 2 - pos.x / srcScale;
    const srcCenterY = imgSize.h / 2 - pos.y / srcScale;
    const srcX = srcCenterX - srcVisibleW / 2;
    const srcY = srcCenterY - srcVisibleH / 2;
    ctx.drawImage(img, srcX, srcY, srcVisibleW, srcVisibleH, 0, 0, outputSize, outputSize);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    onConfirm(dataUrl);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Drag to reposition, use the slider to zoom.</p>

        <div
          className="relative mx-auto rounded-full overflow-hidden bg-gray-100 dark:bg-gray-900 cursor-move select-none touch-none"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img
            ref={imgRef}
            src={imageSrc}
            onLoad={onImgLoad}
            draggable={false}
            style={{
              position: 'absolute',
              left: `calc(50% + ${pos.x}px - ${dispW / 2}px)`,
              top: `calc(50% + ${pos.y}px - ${dispH / 2}px)`,
              width: dispW,
              height: dispH,
              maxWidth: 'none',
              pointerEvents: 'none',
            }}
          />
          {/* subtle ring to show the crop edge */}
          <div className="absolute inset-0 rounded-full ring-2 ring-inset ring-white/70 pointer-events-none" />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-gray-400">−</span>
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={e => handleZoomChange(parseFloat(e.target.value))}
            className="flex-1 accent-emerald-600"
          />
          <span className="text-xs text-gray-400">+</span>
        </div>

        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onCancel} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
            Use Photo
          </button>
        </div>
      </div>
    </div>
  );
}
