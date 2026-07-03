import React, { useState, useEffect, useRef } from "react";
import { uploadFile, generateI2I } from "../muapi.js";

export default function DrawModal({
  isOpen,
  onClose,
  apiKey,
  batchSize = 1,
  onAddHistoryItem,
}) {
  const [activeTab, setActiveTab] = useState("draw-to-edit"); // 'sketch-to-video' | 'draw-to-video' | 'draw-to-edit'
  const [viewState, setViewState] = useState("setup"); // 'setup' | 'canvas'
  const [bgImage, setBgImage] = useState(null); // Image object or dataURL
  const [aspectRatio, setAspectRatio] = useState("16:9"); // '16:9' | '1:1' | 'Auto'
  const [selectedModel, setSelectedModel] = useState("nano-banana-pro-edit"); // 'nano-banana-2-edit' | 'nano-banana-pro-edit'
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isArDropdownOpen, setIsArDropdownOpen] = useState(false);

  // Drawing Tools
  const [activeTool, setActiveTool] = useState("pencil"); // 'pointer' | 'pencil' | 'eraser' | 'rect' | 'arrow' | 'text'
  const [brushColor, setBrushColor] = useState("#eab308"); // default yellow
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [brushSize, setBrushSize] = useState(5);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);

  // Canvas Refs
  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const drawingState = useRef({
    isDrawing: false,
    startX: 0,
    startY: 0,
    history: [],
    historyIdx: -1,
  });

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fileInputRef = useRef(null);
  const modelDropdownRef = useRef(null);
  const arDropdownRef = useRef(null);

  // Predefined colors for drawing toolbar
  const PRESET_COLORS = [
    "#ef4444", // Red
    "#f97316", // Orange
    "#eab308", // Yellow
    "#22c55e", // Green
    "#3b82f6", // Blue
    "#a855f7", // Purple
    "#ffffff", // White
    "#000000", // Black
  ];

  // Adjust container clicks to close open menus
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setIsModelDropdownOpen(false);
      }
      if (arDropdownRef.current && !arDropdownRef.current.contains(e.target)) {
        setIsArDropdownOpen(false);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Save historical states for undo/redo
  const saveCanvasState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Slice any future history if we drew after undoing
    const newHistory = drawingState.current.history.slice(0, drawingState.current.historyIdx + 1);
    newHistory.push(imgData);

    drawingState.current.history = newHistory;
    drawingState.current.historyIdx = newHistory.length - 1;

    setCanUndo(drawingState.current.historyIdx > 0);
    setCanRedo(false);
  };

  // Restore states
  const restoreCanvasState = (index) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const imgData = drawingState.current.history[index];
    if (imgData) {
      ctx.putImageData(imgData, 0, 0);
      drawingState.current.historyIdx = index;
      setCanUndo(index > 0);
      setCanRedo(index < drawingState.current.history.length - 1);
    }
  };

  const handleUndo = () => {
    if (drawingState.current.historyIdx > 0) {
      restoreCanvasState(drawingState.current.historyIdx - 1);
    }
  };

  const handleRedo = () => {
    if (drawingState.current.historyIdx < drawingState.current.history.length - 1) {
      restoreCanvasState(drawingState.current.historyIdx + 1);
    }
  };

  // Initialize Canvas
  useEffect(() => {
    if (viewState !== "canvas") return;

    const canvas = canvasRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (!canvas || !bgCanvas) return;

    const ctx = canvas.getContext("2d");
    const bgCtx = bgCanvas.getContext("2d");

    // Resolve Dimensions based on Aspect Ratio and screen width
    let width = 800;
    let height = 450; // default 16:9

    if (aspectRatio === "1:1") {
      width = 600;
      height = 600;
    } else if (aspectRatio === "Auto" && bgImage) {
      const maxW = 800;
      const maxH = 500;
      let imgW = bgImage.naturalWidth || bgImage.width || 800;
      let imgH = bgImage.naturalHeight || bgImage.height || 500;

      const scale = Math.min(maxW / imgW, maxH / imgH);
      width = imgW * scale;
      height = imgH * scale;
    }

    canvas.width = width;
    canvas.height = height;
    bgCanvas.width = width;
    bgCanvas.height = height;

    // Draw background image if exists, else white background
    if (bgImage) {
      bgCtx.drawImage(bgImage, 0, 0, width, height);
    } else {
      bgCtx.fillStyle = "#ffffff";
      bgCtx.fillRect(0, 0, width, height);
    }

    // Reset transparent paint layer
    ctx.clearRect(0, 0, width, height);

    // Save initial state for history
    drawingState.current.history = [];
    drawingState.current.historyIdx = -1;
    saveCanvasState();
  }, [viewState, aspectRatio, bgImage]);

  // Drawing Event Handlers
  const getCanvasMousePos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handleStartDraw = (e) => {
    if (activeTool === "pointer") return;
    const pos = getCanvasMousePos(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    drawingState.current.isDrawing = true;
    drawingState.current.startX = pos.x;
    drawingState.current.startY = pos.y;

    if (activeTool === "pencil" || activeTool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushSize;

      if (activeTool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = brushColor;
      }
    }
  };

  const handleDrawing = (e) => {
    if (!drawingState.current.isDrawing) return;
    const pos = getCanvasMousePos(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (activeTool === "pencil" || activeTool === "eraser") {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const handleEndDraw = (e) => {
    if (!drawingState.current.isDrawing) return;
    drawingState.current.isDrawing = false;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pos = getCanvasMousePos(e);

    if (activeTool === "rect") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      const w = pos.x - drawingState.current.startX;
      const h = pos.y - drawingState.current.startY;
      ctx.strokeRect(drawingState.current.startX, drawingState.current.startY, w, h);
      saveCanvasState();
    } else if (activeTool === "arrow") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";

      const fromX = drawingState.current.startX;
      const fromY = drawingState.current.startY;
      const toX = pos.x;
      const toY = pos.y;

      // Draw arrow main line
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      // Draw arrow heads
      const angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - 15 * Math.cos(angle - Math.PI / 6), toY - 15 * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - 15 * Math.cos(angle + Math.PI / 6), toY - 15 * Math.sin(angle + Math.PI / 6));
      ctx.stroke();

      saveCanvasState();
    } else if (activeTool === "text") {
      const text = prompt("Enter text to add to canvas:");
      if (text) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = brushColor;
        ctx.font = `${brushSize * 4}px Inter, sans-serif`;
        ctx.fillText(text, drawingState.current.startX, drawingState.current.startY);
        saveCanvasState();
      }
    } else {
      // Pencil or Eraser finished stroke
      saveCanvasState();
    }
  };

  // Upload background file
  const handleUploadBg = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setBgImage(img);
        setAspectRatio("Auto");
        setViewState("canvas");
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Clear Canvas
  const handleClearCanvas = () => {
    if (confirm("Clear your drawings? Background will be kept.")) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      saveCanvasState();
    }
  };

  // Merge Background + Drawing layers and Generate
  const handleGenerateClick = async () => {
    if (generating) return;

    const canvas = canvasRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (!canvas || !bgCanvas) return;

    setGenerating(true);

    try {
      // Create output canvas to merge background + drawing layer
      const mergeCanvas = document.createElement("canvas");
      mergeCanvas.width = canvas.width;
      mergeCanvas.height = canvas.height;
      const mCtx = mergeCanvas.getContext("2d");

      // Draw background
      mCtx.drawImage(bgCanvas, 0, 0);
      // Draw transparent drawing overlay on top
      mCtx.drawImage(canvas, 0, 0);

      // Convert to blob
      const blob = await new Promise((resolve) => mergeCanvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("Canvas serialization failed");

      // Upload file to get URL
      const uploadedUrl = await uploadFile(apiKey, blob);

      // Generate Image using nano-banana-2-edit or nano-banana-pro-edit
      const results = await Promise.all(
        Array.from({ length: batchSize }).map(async () => {
          const genParams = {
            model: selectedModel,
            image_url: uploadedUrl,
            aspect_ratio: aspectRatio === "Auto" ? "1:1" : aspectRatio,
          };
          return await generateI2I(apiKey, genParams);
        })
      );

      // Add each output to history
      results.forEach((res) => {
        if (res && res.url) {
          const entry = {
            id: res.id || Math.random().toString(36).substring(7),
            url: res.url,
            prompt: `Draw to Edit with ${selectedModel === "nano-banana-pro-edit" ? "Nano Banana Pro Edit" : "Nano Banana 2 Edit"}`,
            model: selectedModel,
            aspect_ratio: aspectRatio === "Auto" ? "1:1" : aspectRatio,
            timestamp: new Date().toISOString(),
          };
          onAddHistoryItem(entry);
        }
      });

      alert("Generations complete!");
      onClose();
    } catch (e) {
      console.error("[DrawModal] Generation failed:", e);
      alert(`Generation failed: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      {/* Modal Box */}
      <div className="relative w-full max-w-5xl bg-[#0b0b0d] border border-white/10 rounded-2xl flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden h-[90vh]">
        
        {/* Header Tab Selector */}
        <div className="flex items-center justify-between border-b border-white/5 p-4 shrink-0 bg-[#0f0f12]">
          <div className="flex items-center gap-1.5 bg-[#131316]/60 border border-white/5 p-1 rounded-full select-none">
            <button
              onClick={() => setActiveTab("sketch-to-video")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === "sketch-to-video" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              Sketch to Video
              <span className="bg-[#b5f500] text-black text-[8px] font-black px-1 rounded">NEW</span>
            </button>
            <button
              onClick={() => setActiveTab("draw-to-video")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeTab === "draw-to-video" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              Draw to Video
            </button>
            <button
              onClick={() => setActiveTab("draw-to-edit")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeTab === "draw-to-edit" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              Draw to Edit
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 transition-all"
          >
            ×
          </button>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto custom-scrollbar relative">
          
          {viewState === "setup" ? (
            /* Setup Card */
            <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 max-w-md w-full text-center flex flex-col items-center gap-6 bg-[#070708]/30">
              <div className="w-56 h-36 rounded-xl border border-white/5 overflow-hidden shadow-lg select-none relative bg-black/40">
                <img
                  src="https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/neta-lumina.avif"
                  alt="Draw visual representation"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-md rounded-md p-1 px-2 border border-white/5 flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse"></div>
                  <span className="text-[9px] text-white/50 tracking-wider uppercase font-bold">Sketchpad active</span>
                </div>
              </div>

              <div>
                <h2 className="text-white font-extrabold text-lg tracking-wide mb-1.5 uppercase">
                  DRAW TO EDIT
                </h2>
                <p className="text-white/40 text-xs font-medium max-w-xs leading-relaxed mx-auto">
                  From sketch to a complete picture in a second. No prompt needed.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 w-full max-w-[240px]">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white hover:bg-white/90 text-black font-bold text-sm px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  </svg>
                  Upload Media
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleUploadBg}
                  accept="image/*"
                  className="hidden"
                />

                <button
                  onClick={() => {
                    setBgImage(null);
                    setViewState("canvas");
                  }}
                  className="bg-[#131316]/80 hover:bg-[#1c1c22] text-white border border-white/10 font-bold text-sm px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-inner"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  </svg>
                  Create blank
                </button>
              </div>
            </div>
          ) : (
            /* Canvas Screen */
            <div className="flex-1 flex flex-col items-center justify-center w-full relative h-full">
              {/* Stacked Canvases */}
              <div
                className="relative border border-white/10 shadow-2xl rounded-lg overflow-hidden bg-white max-w-full max-h-[60vh] flex items-center justify-center"
                style={{
                  width: canvasRef.current ? canvasRef.current.width : "800px",
                  height: canvasRef.current ? canvasRef.current.height : "450px",
                }}
              >
                {/* Background Image/White Color Layer */}
                <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

                {/* Drawing Ink Layer */}
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleStartDraw}
                  onMouseMove={handleDrawing}
                  onMouseUp={handleEndDraw}
                  onMouseLeave={handleEndDraw}
                  onTouchStart={handleStartDraw}
                  onTouchMove={handleDrawing}
                  onTouchEnd={handleEndDraw}
                  className={`absolute inset-0 w-full h-full ${
                    activeTool === "pointer" ? "cursor-default" : "cursor-crosshair"
                  }`}
                />
              </div>

              {/* Bottom Draw Toolbar */}
              <div className="mt-6 bg-[#0f0f11]/90 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-2xl z-20 select-none">
                {/* Pointer tool */}
                <button
                  onClick={() => setActiveTool("pointer")}
                  title="Selection pointer"
                  className={`p-1.5 rounded-lg transition-all ${
                    activeTool === "pointer" ? "bg-white text-black" : "text-white/60 hover:text-white"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                  </svg>
                </button>

                {/* Pencil tool */}
                <button
                  onClick={() => setActiveTool("pencil")}
                  title="Draw pencil"
                  className={`p-1.5 rounded-lg transition-all ${
                    activeTool === "pencil" ? "bg-white text-black" : "text-white/60 hover:text-white"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </button>

                {/* Eraser tool */}
                <button
                  onClick={() => setActiveTool("eraser")}
                  title="Eraser"
                  className={`p-1.5 rounded-lg transition-all ${
                    activeTool === "eraser" ? "bg-white text-black" : "text-white/60 hover:text-white"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 20H7L3 16c-1-1-1-2.5 0-3.5L13 2c1-1 2.5-1 3.5 0l4 4c1 1 1 2.5 0 3.5L11 19l9 1z"/>
                  </svg>
                </button>

                {/* Shape rect tool */}
                <button
                  onClick={() => setActiveTool("rect")}
                  title="Rectangle shape"
                  className={`p-1.5 rounded-lg transition-all ${
                    activeTool === "rect" ? "bg-white text-black" : "text-white/60 hover:text-white"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  </svg>
                </button>

                {/* Arrow tool */}
                <button
                  onClick={() => setActiveTool("arrow")}
                  title="Arrow shape"
                  className={`p-1.5 rounded-lg transition-all ${
                    activeTool === "arrow" ? "bg-white text-black" : "text-white/60 hover:text-white"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="19" x2="19" y2="5"/>
                    <polyline points="12 5 19 5 19 12"/>
                  </svg>
                </button>

                {/* Text tool */}
                <button
                  onClick={() => setActiveTool("text")}
                  title="Text tool"
                  className={`p-1.5 rounded-lg transition-all ${
                    activeTool === "text" ? "bg-white text-black" : "text-white/60 hover:text-white"
                  }`}
                >
                  <span className="text-sm font-black tracking-tight select-none px-0.5">T</span>
                </button>

                {/* File picker helper */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload background image"
                  className="p-1.5 rounded-lg text-white/60 hover:text-white transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </button>

                {/* Color Selector */}
                <div className="relative">
                  <button
                    onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
                    title="Brush Color"
                    className="w-5 h-5 rounded-full border border-white/20 transition-transform active:scale-90 hover:scale-105"
                    style={{ backgroundColor: brushColor }}
                  />

                  {isColorPickerOpen && (
                    <div className="absolute bottom-[calc(100%+14px)] left-1/2 -translate-x-1/2 bg-[#131316] border border-white/10 rounded-xl p-2 flex gap-1.5 shadow-2xl">
                      {PRESET_COLORS.map((col) => (
                        <button
                          key={col}
                          onClick={() => {
                            setBrushColor(col);
                            setIsColorPickerOpen(false);
                          }}
                          className="w-4.5 h-4.5 rounded-full border border-white/10 hover:scale-110 transition-transform"
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-6 w-px bg-white/10 mx-0.5" />

                {/* Undo */}
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  title="Undo"
                  className="p-1.5 rounded-lg text-white/60 hover:text-white disabled:opacity-25 transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
                  </svg>
                </button>

                {/* Redo */}
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  title="Redo"
                  className="p-1.5 rounded-lg text-white/60 hover:text-white disabled:opacity-25 transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 7v6h-6M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/>
                  </svg>
                </button>

                {/* Generate Action Button */}
                <button
                  onClick={handleGenerateClick}
                  disabled={generating}
                  className="ml-1 bg-[#b5f500] hover:opacity-90 active:scale-[0.97] transition-all text-black font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md shadow-[#b5f500]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? (
                    <>
                      <span className="animate-spin inline-block">◌</span>
                      Generating...
                    </>
                  ) : (
                    <>
                      Generate Image
                      <span className="opacity-80">✦ {batchSize}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Toolbar Secondary Floating Row (Model selector, Slider, aspect ratio, clear, info) */}
              <div className="absolute bottom-0 left-0 right-0 w-full flex items-center justify-between pointer-events-none z-10 px-2 select-none">
                
                {/* Left Side options */}
                <div className="flex items-center gap-2 pointer-events-auto">
                  {/* Model dropdown indicator */}
                  <div className="relative" ref={modelDropdownRef}>
                    <button
                      onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                      className="h-[38px] flex items-center gap-2 px-3 bg-[#131316]/80 hover:bg-[#1c1c22] rounded-xl border border-white/5 text-xs text-white/70 whitespace-nowrap shadow-xl"
                    >
                      <span className="text-[10px] text-[#b5f500] font-black bg-[#b5f500]/10 px-1.5 rounded border border-[#b5f500]/25">G</span>
                      {selectedModel === "nano-banana-pro-edit" ? "Nano Banana Pro Edit" : "Nano Banana 2 Edit"}
                      <span className="opacity-45 text-[8px] ml-0.5">▼</span>
                    </button>

                    {isModelDropdownOpen && (
                      <div className="absolute bottom-[calc(100%+8px)] left-0 bg-[#0f0f12] border border-white/10 rounded-2xl p-2 w-64 shadow-2xl flex flex-col gap-1">
                        <div className="text-[10px] font-black text-white/30 uppercase tracking-widest p-1.5 pb-1 select-none">Select model</div>
                        
                        {/* Nano Banana 2 Edit */}
                        <button
                          onClick={() => {
                            setSelectedModel("nano-banana-2-edit");
                            setIsModelDropdownOpen(false);
                          }}
                          className={`flex flex-col text-left p-2.5 rounded-xl transition-all ${
                            selectedModel === "nano-banana-2-edit" ? "bg-[#b5f500]/10 text-white" : "hover:bg-white/5 text-white/70"
                          }`}
                        >
                          <div className="text-xs font-bold flex items-center gap-1.5">
                            Nano Banana 2 Edit
                            {selectedModel === "nano-banana-2-edit" && <span className="text-[#b5f500]">✓</span>}
                          </div>
                          <div className="text-[9px] text-white/30 leading-snug mt-0.5">Google's Advanced Image Editing Model</div>
                        </button>

                        {/* Nano Banana Pro Edit */}
                        <button
                          onClick={() => {
                            setSelectedModel("nano-banana-pro-edit");
                            setIsModelDropdownOpen(false);
                          }}
                          className={`flex flex-col text-left p-2.5 rounded-xl transition-all ${
                            selectedModel === "nano-banana-pro-edit" ? "bg-[#b5f500]/10 text-white" : "hover:bg-white/5 text-white/70"
                          }`}
                        >
                          <div className="text-xs font-bold flex items-center gap-1.5">
                            Nano Banana Pro Edit
                            {selectedModel === "nano-banana-pro-edit" && <span className="text-[#b5f500]">✓</span>}
                          </div>
                          <div className="text-[9px] text-white/30 leading-snug mt-0.5">Best 4K Image Model Ever</div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Brush Size Slider */}
                  <div className="relative">
                    <button
                      onClick={() => setShowSettingsPopover(!showSettingsPopover)}
                      className="h-[38px] w-[38px] flex items-center justify-center bg-[#131316]/80 hover:bg-[#1c1c22] rounded-xl border border-white/5 text-white/60 shadow-xl transition-all"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="4" y1="21" x2="4" y2="14" />
                        <line x1="4" y1="10" x2="4" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12" y2="3" />
                        <line x1="20" y1="21" x2="20" y2="16" />
                        <line x1="20" y1="12" x2="20" y2="3" />
                        <line x1="1" y1="14" x2="7" y2="14" />
                        <line x1="9" y1="8" x2="15" y2="8" />
                        <line x1="17" y1="16" x2="23" y2="16" />
                      </svg>
                    </button>

                    {showSettingsPopover && (
                      <div className="absolute bottom-[calc(100%+8px)] left-0 bg-[#0f0f12] border border-white/10 rounded-2xl p-3.5 w-44 shadow-2xl flex flex-col gap-2 pointer-events-auto">
                        <div className="text-[10px] font-black text-white/30 uppercase tracking-widest">Brush Size</div>
                        <input
                          type="range"
                          min="1"
                          max="50"
                          value={brushSize}
                          onChange={(e) => setBrushSize(parseInt(e.target.value))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#b5f500]"
                        />
                        <span className="text-[11px] font-bold text-white/60 text-right">{brushSize}px</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side Options */}
                <div className="flex items-center gap-2 pointer-events-auto">
                  
                  {/* Aspect ratio selector */}
                  <div className="relative" ref={arDropdownRef}>
                    <button
                      onClick={() => setIsArDropdownOpen(!isArDropdownOpen)}
                      className="h-[38px] flex items-center gap-2 px-3 bg-[#131316]/80 hover:bg-[#1c1c22] rounded-xl border border-white/5 text-xs text-white/70 whitespace-nowrap shadow-xl"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-50">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      </svg>
                      {aspectRatio}
                      <span className="opacity-45 text-[8px] ml-0.5">▼</span>
                    </button>

                    {isArDropdownOpen && (
                      <div className="absolute bottom-[calc(100%+8px)] right-0 bg-[#0f0f12] border border-white/10 rounded-2xl p-2 w-32 shadow-2xl flex flex-col gap-1">
                        <div className="text-[10px] font-black text-white/30 uppercase tracking-widest p-1.5 pb-1 select-none">Aspect Ratio</div>
                        {["16:9", "1:1", "Auto"].map((r) => (
                          <button
                            key={r}
                            onClick={() => {
                              setAspectRatio(r);
                              setIsArDropdownOpen(false);
                            }}
                            className={`text-left p-1.5 px-2.5 rounded-xl text-xs font-bold transition-all ${
                              aspectRatio === r ? "bg-[#b5f500]/10 text-white" : "hover:bg-white/5 text-white/70"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Clear Canvas */}
                  <button
                    onClick={handleClearCanvas}
                    title="Clear drawings"
                    className="h-[38px] w-[38px] flex items-center justify-center bg-[#131316]/80 hover:bg-[#1c1c22] rounded-xl border border-white/5 text-white/60 shadow-xl transition-all"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>

                  {/* Info Tooltip Button */}
                  <button
                    onClick={() => alert("Draw to Edit: paint directly over an image or blank canvas to generate variations using Nano Banana models.")}
                    title="Info"
                    className="h-[38px] w-[38px] flex items-center justify-center bg-[#131316]/80 hover:bg-[#1c1c22] rounded-xl border border-white/5 text-white/60 shadow-xl transition-all"
                  >
                    <span className="text-xs font-bold leading-none">i</span>
                  </button>
                </div>

              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
