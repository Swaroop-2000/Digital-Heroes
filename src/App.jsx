import { useState, useRef, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

import { AdvancedColorPicker } from './AdvancedColorPicker';

const DEFAULT_WATERMARK = {
  text: '',
  fontFamily: 'Arial',
  fontSize: 10, // percentage of image height
  isBold: false,
  isItalic: false,
  isUnderline: false,
  color: '#ffffff',
  backgroundColor: 'transparent', // using rgba or transparent
  x: 50, // percentage 0-100
  y: 50  // percentage 0-100
};

const FONT_OPTIONS = [
  { value: 'Arial', label: 'Arial' },
  { value: "'Arial Black'", label: 'Arial Black' },
  { value: 'Calibri', label: 'Calibri' },
  { value: 'Cambria', label: 'Cambria' },
  { value: 'Candara', label: 'Candara' },
  { value: "'Century Gothic'", label: 'Century Gothic' },
  { value: "'Comic Sans MS'", label: 'Comic Sans MS' },
  { value: 'Consolas', label: 'Consolas' },
  { value: 'Constantia', label: 'Constantia' },
  { value: 'Copperplate', label: 'Copperplate' },
  { value: 'Corbel', label: 'Corbel' },
  { value: "'Courier New'", label: 'Courier New' },
  { value: 'Didot', label: 'Didot' },
  { value: "'Franklin Gothic Medium'", label: 'Franklin Gothic Medium' },
  { value: 'Garamond', label: 'Garamond' },
  { value: 'Geneva', label: 'Geneva' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Impact', label: 'Impact' },
  { value: "'Lucida Console'", label: 'Lucida Console' },
  { value: "'Lucida Sans Unicode'", label: 'Lucida Sans Unicode' },
  { value: 'Optima', label: 'Optima' },
  { value: "'Palatino Linotype'", label: 'Palatino Linotype' },
  { value: 'Papyrus', label: 'Papyrus' },
  { value: "'Segoe UI'", label: 'Segoe UI' },
  { value: 'Sylfaen', label: 'Sylfaen' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: "'Times New Roman'", label: 'Times New Roman' },
  { value: "'Trebuchet MS'", label: 'Trebuchet MS' },
  { value: 'Verdana', label: 'Verdana' },
  { value: "'Brush Script MT'", label: 'Brush Script MT' },
  { value: 'system-ui', label: 'System UI' },
];

function App() {
  const [files, setFiles] = useState([]);
  const [quality, setQuality] = useState(80);
  const [outputFormat, setOutputFormat] = useState('webp');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [imgLoadedCount, setImgLoadedCount] = useState(0);

  // Watermark Modal State
  const [wmModalOpen, setWmModalOpen] = useState(false);
  const [wmTargetFileId, setWmTargetFileId] = useState(null); // null means global
  const [currentWm, setCurrentWm] = useState(DEFAULT_WATERMARK);
  const [previewImage, setPreviewImage] = useState(null);
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);

  // Compare Modal State
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareFile, setCompareFile] = useState(null);
  const [compareSliderValue, setCompareSliderValue] = useState(50);

  const processGenerationRef = useRef(0);

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const previewImgRef = useRef(null);
  const draggableCanvasRef = useRef(null);

  const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const processSingleImage = (fileObj, currentQuality, format) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Use a dedicated offscreen canvas for each image to guarantee thread-safety during concurrent Batch Processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const targetMime = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : `image/${format}`;
        
        // Detect if the browser actually supports encoding this format (AVIF is often unsupported and falls back to PNG)
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 1; testCanvas.height = 1;
        const isSupported = testCanvas.toDataURL(targetMime).startsWith(`data:${targetMime}`);

        // Simulate compression for formats that lack native lossy quality support (PNG/GIF) 
        // OR formats that the browser failed to support natively and fell back to lossless PNG (like AVIF on unsupported browsers)
        let scale = 1;
        if (format === 'png' || format === 'gif' || !isSupported) {
          scale = Math.max(0.1, currentQuality / 100);
        }
        
        canvas.width = Math.max(1, img.width * scale);
        canvas.height = Math.max(1, img.height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const wm = fileObj.watermark;
        if (wm && wm.text && wm.text.trim() !== '') {
          ctx.save();
          
          // Calculate absolute sizes (no clamping, ensure 1:1 WYSIWYG scaling)
          const fontSizePx = (wm.fontSize / 100) * canvas.height;
          
          ctx.globalAlpha = wm.opacity / 100;
          
          // Font string
          let fontStr = '';
          if (wm.isItalic) fontStr += 'italic ';
          if (wm.isBold) fontStr += 'bold ';
          fontStr += `${Math.round(fontSizePx)}px ${wm.fontFamily}`;
          ctx.font = fontStr;
          
          ctx.textAlign = 'center';
          // We don't set textBaseline here because we set it right before drawing text
          
          // Measure text for background and underline
          const metrics = ctx.measureText(wm.text);
          const textWidth = metrics.width;
          const textHeight = fontSizePx; // Approximate
          
          const padX = fontSizePx * 0.2;
          const padY = fontSizePx * 0.2;
          const boxHeight = fontSizePx * 1.0;

          // Advanced clamping: Map 0-100% to the "available sliding space" 
          // instead of absolute center coordinates.
          const halfWidth = (textWidth / 2) + padX;
          const halfHeight = (boxHeight / 2) + padY;
          
          const availableW = canvas.width - (halfWidth * 2);
          const availableH = canvas.height - (halfHeight * 2);
          
          const xPx = availableW > 0 ? halfWidth + (wm.x / 100) * availableW : canvas.width / 2;
          const yPx = availableH > 0 ? halfHeight + (wm.y / 100) * availableH : canvas.height / 2;
          
          
          // Draw Background if not transparent
          if (wm.backgroundColor !== 'transparent') {
            ctx.fillStyle = wm.backgroundColor;
            ctx.fillRect(
              xPx - textWidth/2 - padX, 
              yPx - boxHeight/2 - padY, 
              textWidth + padX*2, 
              boxHeight + padY*2
            );
          }
          
          // Draw Text
          ctx.fillStyle = wm.color;
          ctx.textBaseline = 'middle';
          ctx.fillText(wm.text, xPx, yPx);
          
          // Draw Underline
          if (wm.isUnderline) {
            ctx.beginPath();
            ctx.moveTo(xPx - textWidth/2, yPx + fontSizePx * 0.45);
            ctx.lineTo(xPx + textWidth/2, yPx + fontSizePx * 0.45);
            ctx.strokeStyle = wm.color;
            ctx.lineWidth = Math.max(1, fontSizePx * 0.05);
            ctx.stroke();
          }
          
          ctx.restore();
        }
        
        const mimeType = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : `image/${format}`;
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const newUrl = URL.createObjectURL(blob);
              resolve({
                ...fileObj,
                compressedBlob: blob,
                compressedUrl: newUrl,
                compressedSize: blob.size,
                status: 'done'
              });
            } else {
              resolve({ ...fileObj, status: 'error' });
            }
          },
          mimeType,
          currentQuality / 100
        );
      };
      img.src = fileObj.originalUrl;
    });
  };

  const processAllImages = useCallback(async (currentFiles, q, f) => {
    if (currentFiles.length === 0) return;
    const currentGen = ++processGenerationRef.current;
    setIsProcessing(true);
    const updatedFiles = await Promise.all(
      currentFiles.map(fileObj => processSingleImage(fileObj, q, f))
    );
    if (processGenerationRef.current === currentGen) {
      setFiles(prevFiles => {
        const map = new Map(prevFiles.map(item => [item.id, item]));
        updatedFiles.forEach(item => {
          if (map.has(item.id)) map.set(item.id, item);
        });
        return Array.from(map.values());
      });
      setIsProcessing(false);
    }
  }, []);

  const handleFiles = async (selectedFiles) => {
    const validFiles = Array.from(selectedFiles).filter(f => f.type.startsWith('image/'));
    const invalidFiles = Array.from(selectedFiles).filter(f => !f.type.startsWith('image/'));

    if (invalidFiles.length > 0) {
      setErrorMsg('Invalid document. Only images are supported.');
      setTimeout(() => setErrorMsg(''), 4000);
    }

    const newFiles = validFiles.map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        file: f,
        name: f.name,
        originalUrl: URL.createObjectURL(f),
        originalSize: f.size,
        compressedBlob: null,
        compressedUrl: '',
        compressedSize: 0,
        status: 'processing',
        watermark: { ...DEFAULT_WATERMARK }
      }));

    if (newFiles.length === 0) return;

    setFiles(prev => [...prev, ...newFiles]);
    
    const currentGen = ++processGenerationRef.current;
    setIsProcessing(true);
    const processedNewFiles = await Promise.all(
      newFiles.map(f => processSingleImage(f, quality, outputFormat))
    );
    
    if (processGenerationRef.current === currentGen) {
      setFiles(prevFiles => {
        const map = new Map(prevFiles.map(item => [item.id, item]));
        processedNewFiles.forEach(item => {
          if (map.has(item.id)) map.set(item.id, item);
        });
        return Array.from(map.values());
      });
      setIsProcessing(false);
    }
  };

  // Re-compress when global quality/format changes with debounce for speed and accuracy
  useEffect(() => {
    if (files.length > 0) {
      const timeoutId = setTimeout(() => {
        processAllImages(files, quality, outputFormat);
      }, 250);
      return () => clearTimeout(timeoutId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, outputFormat]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };
  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
  };

  const clearAll = () => {
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadSingle = (fileObj) => {
    if (!fileObj.compressedUrl) return;
    const a = document.createElement('a');
    a.href = fileObj.compressedUrl;
    const originalName = fileObj.name.substring(0, fileObj.name.lastIndexOf('.')) || fileObj.name;
    const extension = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
    a.download = `${originalName}-converted.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAllZip = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    const zip = new JSZip();
    const extension = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
    files.forEach((fileObj, index) => {
      if (fileObj.compressedBlob) {
        let originalName = fileObj.name.substring(0, fileObj.name.lastIndexOf('.')) || fileObj.name;
        let fileName = `${originalName}.${extension}`;
        if (zip.file(fileName)) fileName = `${originalName}-${index}.${extension}`;
        zip.file(fileName, fileObj.compressedBlob);
      }
    });
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'images-converted.zip');
    setIsProcessing(false);
  };

  const calculateSavings = (orig, comp) => {
    if (!orig || !comp) return 0;
    const savings = ((orig - comp) / orig) * 100;
    return savings > 0 ? savings.toFixed(1) : 0;
  };

  // --- Watermark Modal Logic ---
  const openWatermarkModal = (fileId = null) => {
    setWmTargetFileId(fileId);
    if (fileId) {
      const file = files.find(f => f.id === fileId);
      setCurrentWm({ ...file.watermark });
      setPreviewImage(file.originalUrl);
    } else {
      // Global
      setCurrentWm({ ...DEFAULT_WATERMARK });
      setPreviewImage(files[0].originalUrl);
    }
    setWmModalOpen(true);
  };

  const closeWatermarkModal = () => {
    setWmModalOpen(false);
  };

  const openCompareModal = (fileObj) => {
    setCompareFile(fileObj);
    setCompareSliderValue(50);
    setCompareModalOpen(true);
  };

  const closeCompareModal = () => {
    setCompareModalOpen(false);
    setCompareFile(null);
  };

  const applyWatermark = async () => {
    setWmModalOpen(false);
    
    let updatedFiles = [...files];
    let filesToProcess;
    
    if (wmTargetFileId) {
      // Apply to single
      const index = updatedFiles.findIndex(f => f.id === wmTargetFileId);
      updatedFiles[index] = { ...updatedFiles[index], watermark: currentWm };
      filesToProcess = [updatedFiles[index]];
    } else {
      // Apply to all
      updatedFiles = updatedFiles.map(f => ({ ...f, watermark: currentWm }));
      filesToProcess = updatedFiles;
    }
    
    setFiles(updatedFiles);

    const currentGen = ++processGenerationRef.current;
    setIsProcessing(true);
    
    try {
      const processedFiles = await Promise.all(filesToProcess.map(f => processSingleImage(f, quality, outputFormat)));
      
      if (processGenerationRef.current === currentGen) {
        setFiles(prevFiles => {
          const map = new Map(prevFiles.map(item => [item.id, item]));
          processedFiles.forEach(item => {
            if (map.has(item.id)) map.set(item.id, item);
          });
          return Array.from(map.values());
        });
        setIsProcessing(false);
      }
    } catch (err) {
      console.error(err);
      if (processGenerationRef.current === currentGen) {
        setIsProcessing(false);
      }
    }
  };

  // Draggable logic for Watermark text
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeColorPicker, setActiveColorPicker] = useState(null); // 'text' | 'bg' | null

  // Draw preview watermark on the canvas exactly as it will appear in final output
  useEffect(() => {
    if (!wmModalOpen || !previewImgRef.current || !draggableCanvasRef.current || !currentWm.text) return;
    
    const drawPreviewCanvas = () => {
      const imgRect = previewImgRef.current.getBoundingClientRect();
      const canvas = draggableCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      
      const fontSizePx = (currentWm.fontSize / 100) * imgRect.height;
      if (fontSizePx <= 0) return;
      
      let fontStr = '';
      if (currentWm.isItalic) fontStr += 'italic ';
      if (currentWm.isBold) fontStr += 'bold ';
      fontStr += `${Math.round(fontSizePx)}px ${currentWm.fontFamily}`;
      
      ctx.font = fontStr;
      const metrics = ctx.measureText(currentWm.text);
      const textWidth = metrics.width;
      
      const padX = fontSizePx * 0.2;
      const padY = fontSizePx * 0.2;
      const boxHeight = fontSizePx * 1.0;
      
      const logicalWidth = textWidth + padX * 2 + fontSizePx * 0.5;
      const logicalHeight = boxHeight + padY * 2 + fontSizePx * 0.5;
      
      const dpr = window.devicePixelRatio || 1;
      canvas.width = logicalWidth * dpr;
      canvas.height = logicalHeight * dpr;
      canvas.style.width = `${logicalWidth}px`;
      canvas.style.height = `${logicalHeight}px`;
      
      // Enforce physical boundary clamping on the preview canvas
      const halfW = logicalWidth / 2;
      const halfH = logicalHeight / 2;
      
      const availableW = imgRect.width - (halfW * 2);
      const availableH = imgRect.height - (halfH * 2);
      
      const xPx = availableW > 0 ? halfW + (currentWm.x / 100) * availableW : imgRect.width / 2;
      const yPx = availableH > 0 ? halfH + (currentWm.y / 100) * availableH : imgRect.height / 2;
      
      canvas.style.left = `${(xPx / imgRect.width) * 100}%`;
      canvas.style.top = `${(yPx / imgRect.height) * 100}%`;
      canvas.style.visibility = 'visible';
      
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);
      
      const cx = logicalWidth / 2;
      const cy = logicalHeight / 2;
      
      ctx.font = fontStr;
      ctx.textAlign = 'center';
      
      if (currentWm.backgroundColor !== 'transparent') {
        ctx.fillStyle = currentWm.backgroundColor;
        ctx.fillRect(
          cx - textWidth/2 - padX, 
          cy - boxHeight/2 - padY, 
          textWidth + padX*2, 
          boxHeight + padY*2
        );
      }
      
      ctx.fillStyle = currentWm.color;
      ctx.textBaseline = 'middle';
      ctx.fillText(currentWm.text, cx, cy);
      
      if (currentWm.isUnderline) {
        ctx.beginPath();
        ctx.moveTo(cx - textWidth/2, cy + fontSizePx * 0.45);
        ctx.lineTo(cx + textWidth/2, cy + fontSizePx * 0.45);
        ctx.strokeStyle = currentWm.color;
        ctx.lineWidth = Math.max(1, fontSizePx * 0.05);
        ctx.stroke();
      }
    };

    drawPreviewCanvas();
    
    const observer = new ResizeObserver(drawPreviewCanvas);
    observer.observe(previewImgRef.current);
    return () => observer.disconnect();
  }, [currentWm, wmModalOpen, previewImage]);

  // Prevent background scrolling when modals are open
  useEffect(() => {
    if (wmModalOpen || compareModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [wmModalOpen, compareModalOpen]);

  const handlePointerDown = (e) => {
    e.preventDefault();
    if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
    setIsDraggingText(true);
    
    if (previewImgRef.current) {
      const rect = previewImgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const textRect = draggableCanvasRef.current.getBoundingClientRect();
      const halfW = textRect.width / 2;
      const halfH = textRect.height / 2;
      const availableW = rect.width - (halfW * 2);
      const availableH = rect.height - (halfH * 2);
      const textXPx = availableW > 0 ? halfW + (currentWm.x / 100) * availableW : rect.width / 2;
      const textYPx = availableH > 0 ? halfH + (currentWm.y / 100) * availableH : rect.height / 2;
      setDragOffset({ x: mouseX - textXPx, y: mouseY - textYPx });
    }
  };

  const handlePointerMove = (e) => {
    if (!isDraggingText || !previewImgRef.current || !draggableCanvasRef.current) return;
    const rect = previewImgRef.current.getBoundingClientRect();
    const textRect = draggableCanvasRef.current.getBoundingClientRect();
    
    let xPx = e.clientX - rect.left - dragOffset.x;
    let yPx = e.clientY - rect.top - dragOffset.y;
    
    const halfW = textRect.width / 2;
    const halfH = textRect.height / 2;
    
    xPx = Math.max(halfW, Math.min(xPx, rect.width - halfW));
    yPx = Math.max(halfH, Math.min(yPx, rect.height - halfH));
    
    const availableW = rect.width - (halfW * 2);
    const availableH = rect.height - (halfH * 2);

    setCurrentWm(prev => ({
      ...prev,
      x: availableW > 0 ? ((xPx - halfW) / availableW) * 100 : 50,
      y: availableH > 0 ? ((yPx - halfH) / availableH) * 100 : 50
    }));
  };

  const handlePointerUp = (e) => {
    setIsDraggingText(false);
    if (e.target.releasePointerCapture) e.target.releasePointerCapture(e.pointerId);
  };

  return (
    <div className={`app-container ${files.length > 0 ? 'has-files' : ''}`}>
      <header className="header">
        <h1 className="header-title">WebP Master</h1>
        <p className="header-subtitle">
          Batch compress and convert your images to next-gen formats.
          100% private, processed securely in your browser.
        </p>
      </header>

      <main className="main-content">
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        
        {files.length > 0 && (
          <div className="global-settings">
            <div className="control-group">
              <div className="control-header">
                <label>Target Format</label>
              </div>
              <div className="format-selector">
                <button className={`format-btn ${outputFormat === 'webp' ? 'active' : ''}`} onClick={() => setOutputFormat('webp')}>WebP</button>
                <button className={`format-btn ${outputFormat === 'jpeg' ? 'active' : ''}`} onClick={() => setOutputFormat('jpeg')}>JPEG</button>
                <button className={`format-btn ${outputFormat === 'png' ? 'active' : ''}`} onClick={() => setOutputFormat('png')}>PNG</button>
              </div>
            </div>

            <div className="control-group">
              <div className="control-header">
                <label>Quality</label>
                <span className="quality-value">{quality}%</span>
              </div>
              <input 
                type="range" min="1" max="100" 
                value={quality} onChange={(e) => setQuality(parseInt(e.target.value))}
                className="slider"
              />
            </div>

            <div className="control-group">
              <div className="control-header">
                <label>Global Watermark</label>
              </div>
              <button className="btn-outline" onClick={() => openWatermarkModal(null)}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Apply to All Images
              </button>
            </div>
          </div>
        )}

        <div 
          className={`dropzone ${files.length > 0 ? 'compact' : ''} ${isDragging ? 'active' : ''} ${errorMsg ? 'has-error' : ''}`}
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        >
          <input 
            type="file" className="file-input" accept="image/*" multiple
            onChange={handleInputChange} ref={fileInputRef}
          />
          {errorMsg ? (
            <div className="dropzone-error">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{errorMsg}</span>
            </div>
          ) : (
            <>
              {files.length === 0 && (
                <div className="dropzone-empty-state">
                  <div className="floating-icons">
                    <svg className="float-icon float-icon-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <svg className="float-icon float-icon-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                    <svg className="float-icon float-icon-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                  </div>
                  <div className="main-icon-wrapper">
                    <svg className="dropzone-icon-main" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                </div>
              )}
              <div className="dropzone-text">
                {files.length > 0 ? (
                  <div className="add-more-btn">
                     <svg className="add-more-icon" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                     Add more images
                  </div>
                ) : 'Drop your images here'}
              </div>
              {files.length === 0 && <div className="dropzone-subtext">or click to browse (Batch processing supported)</div>}
            </>
          )}
        </div>

        {files.length === 0 && (
          <div className="features-section">
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h3>100% Secure & Private</h3>
              <p>Everything runs entirely inside your browser. Your files never leave your device and are absolutely never uploaded to any cloud server.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h3>Lightning Fast</h3>
              <p>Built with modern web technologies to harness your device's multi-core processor. Compress dozens of high-res images instantly.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <h3>Pro Formats & Tools</h3>
              <p>Convert natively between WebP, JPEG, and PNG. Create premium text watermarks and instantly compare visual quality side-by-side.</p>
            </div>
          </div>
        )}

        {files.length > 0 && (
          <>
            <div className="image-grid">
              {files.map((fileObj) => (
                <div key={fileObj.id} className="image-card hover-reveal">
                  <img src={fileObj.compressedUrl || fileObj.originalUrl} alt={fileObj.name} className="gallery-img" />
                  
                  <div className="image-card-overlay">
                    <div className="overlay-top">
                      <div className="image-name" title={fileObj.name}>{fileObj.name}</div>
                      <div className="image-stats">
                        <span>Orig. <strong>{formatBytes(fileObj.originalSize)}</strong></span>
                        <span style={{textAlign: 'right'}}>New <strong>{fileObj.compressedSize ? formatBytes(fileObj.compressedSize) : '...'}</strong></span>
                      </div>
                      <div className="image-savings">
                        {calculateSavings(fileObj.originalSize, fileObj.compressedSize)}% smaller
                      </div>
                    </div>
                    
                    <div className="overlay-bottom image-card-actions">
                      <button className="image-card-action" onClick={() => openCompareModal(fileObj)} disabled={!fileObj.compressedUrl}>
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Compare
                      </button>
                      <button className="image-card-action" onClick={() => openWatermarkModal(fileObj.id)}>
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        Edit
                      </button>
                      <button className="image-card-action" onClick={() => downloadSingle(fileObj)} disabled={!fileObj.compressedUrl}>
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="batch-actions">
              <button className="btn-secondary" onClick={clearAll}>Clear All</button>
              <button className="btn-primary" onClick={downloadAllZip} disabled={isProcessing || files.length === 0}>
                {!isProcessing && <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                {isProcessing ? 'Processing...' : `Download All (ZIP)`}
              </button>
            </div>
          </>
        )}
      </main>

      {/* Watermark Editor Modal */}
      {wmModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{wmTargetFileId ? 'Edit Image Watermark' : 'Global Watermark Editor'}</h2>
              <button className="modal-close-btn" onClick={closeWatermarkModal}>
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="modal-body">
              <div className="watermark-toolbar">
                <input 
                  type="text" 
                  placeholder="Watermark Text" 
                  className="toolbar-input"
                  value={currentWm.text}
                  onChange={(e) => setCurrentWm({...currentWm, text: e.target.value})}
                  style={{ flex: 1, minWidth: '150px' }}
                />
                <div className="toolbar-divider"></div>
                <div style={{ position: 'relative' }}>
                  <button 
                    className="toolbar-input"
                    onClick={() => setIsFontDropdownOpen(!isFontDropdownOpen)}
                    style={{ width: '130px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontFamily: currentWm.fontFamily }}
                  >
                    <span>
                      {FONT_OPTIONS.find(f => f.value === currentWm.fontFamily)?.label || 'Arial'}
                    </span>
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  
                  {isFontDropdownOpen && (
                    <>
                      <div className="dropdown-overlay" onClick={() => setIsFontDropdownOpen(false)} />
                      <div className="custom-dropdown-menu">
                        {FONT_OPTIONS.map(font => (
                          <div 
                            key={font.value}
                            className={`custom-dropdown-item ${currentWm.fontFamily === font.value ? 'active' : ''}`}
                            style={{ fontFamily: font.value }}
                            onClick={() => {
                              setCurrentWm({...currentWm, fontFamily: font.value});
                              setIsFontDropdownOpen(false);
                            }}
                          >
                            {font.label}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="toolbar-divider"></div>
                <button 
                  className={`toolbar-btn ${currentWm.isBold ? 'active' : ''}`}
                  onClick={() => setCurrentWm({...currentWm, isBold: !currentWm.isBold})}
                  title="Bold"
                >
                  <strong>B</strong>
                </button>
                <button 
                  className={`toolbar-btn ${currentWm.isItalic ? 'active' : ''}`}
                  onClick={() => setCurrentWm({...currentWm, isItalic: !currentWm.isItalic})}
                  title="Italic"
                >
                  <em>I</em>
                </button>
                <button 
                  className={`toolbar-btn ${currentWm.isUnderline ? 'active' : ''}`}
                  onClick={() => setCurrentWm({...currentWm, isUnderline: !currentWm.isUnderline})}
                  title="Underline"
                >
                  <span style={{textDecoration: 'underline'}}>U</span>
                </button>
                <div className="toolbar-divider"></div>
                <div className="color-picker-wrapper" title="Text Color">
                  <div 
                    className="color-picker-input" 
                    style={{ backgroundColor: currentWm.color }}
                    onClick={() => setActiveColorPicker(activeColorPicker === 'text' ? null : 'text')}
                  />
                </div>
                <div className="color-picker-wrapper" title="Background Color">
                  <div 
                    className="color-picker-input" 
                    style={{ backgroundColor: currentWm.backgroundColor === 'transparent' ? '#000000' : currentWm.backgroundColor }}
                    onClick={() => setActiveColorPicker(activeColorPicker === 'bg' ? null : 'bg')}
                  />
                </div>
                <button 
                  className={`toolbar-btn ${currentWm.backgroundColor === 'transparent' ? 'active' : ''}`}
                  onClick={() => setCurrentWm({...currentWm, backgroundColor: currentWm.backgroundColor === 'transparent' ? '#000000' : 'transparent'})}
                  title="Toggle Transparent Background"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M9 9h6v6H9z"/></svg>
                </button>
                <div className="toolbar-divider"></div>
                <input 
                  type="range" min="1" max="100" title="Opacity"
                  className="slider wm-slider"
                  value={currentWm.opacity}
                  onChange={(e) => setCurrentWm({...currentWm, opacity: parseInt(e.target.value)})}
                />
              </div>

              <div className="canvas-container">
                <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                  <img 
                    ref={previewImgRef}
                    src={previewImage} 
                    alt="Preview" 
                    className="preview-image"
                    draggable={false}
                    onLoad={() => setImgLoadedCount(c => c + 1)}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  />
                  
                  {currentWm.text && (
                    <canvas 
                      ref={draggableCanvasRef}
                      className="draggable-text"
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      style={{
                        transform: 'translate(-50%, -50%)',
                        opacity: currentWm.opacity / 100,
                        visibility: 'hidden'
                      }}
                    />
                  )}
                  {!currentWm.text && (
                    <div style={{ 
                      position: 'absolute', 
                      top: '50%', left: '50%', 
                      transform: 'translate(-50%, -50%)', 
                      color: 'rgba(255,255,255,0.7)', 
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      lineHeight: 'normal',
                      textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5)',
                      fontWeight: '500'
                    }}>
                      Type text in the toolbar to see preview
                    </div>
                  )}
                </div>
              </div>
              <p style={{textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0}}>
                {currentWm.text ? 'Drag the text to position it' : ''}
              </p>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeWatermarkModal}>Cancel</button>
              <button className="btn-primary" onClick={applyWatermark}>Apply Watermark</button>
            </div>
          </div>
        </div>
      )}

      {/* Compare Modal */}
      {compareModalOpen && compareFile && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
            <div className="modal-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{compareFile.name}</h2>
                <button className="modal-close-btn" onClick={closeCompareModal}>&times;</button>
              </div>
            </div>
            
            <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="compare-legend">
                <span className="legend-text original-text">Original ({formatBytes(compareFile.originalSize)})</span>
                <span className="legend-text compressed-text">Compressed ({formatBytes(compareFile.compressedSize)})</span>
              </div>
              <div className="compare-container">

                {/* Base Image: After (Compressed) */}
                <img 
                  src={compareFile.compressedUrl} 
                  alt="Compressed" 
                  className="compare-img" 
                  style={{ clipPath: `inset(0 0 0 ${compareSliderValue}%)` }}
                />

                {/* Overlay Image: Before (Original) */}
                <img 
                  src={compareFile.originalUrl} 
                  alt="Original" 
                  className="compare-img" 
                  style={{ clipPath: `inset(0 ${100 - compareSliderValue}% 0 0)` }}
                />

                {/* Slider Handle (Visual) */}
                <div className="compare-handle" style={{ left: `${compareSliderValue}%` }}>
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-3 3 3 3m8-6l3 3-3 3" /></svg>
                </div>
                
                {/* Visual Line */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${compareSliderValue}%`, width: '2px', background: 'white', zIndex: 5, pointerEvents: 'none', boxShadow: '0 0 15px rgba(255,255,255,0.8), 0 0 5px rgba(255,255,255,0.8)' }}></div>

                {/* Invisible Range Slider (Functional) */}
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={compareSliderValue} 
                  onChange={(e) => setCompareSliderValue(e.target.value)} 
                  className="compare-slider"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeCompareModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Render Color Pickers at the root to prevent clipping by modal's overflow:hidden */}
      {activeColorPicker === 'text' && (
        <AdvancedColorPicker 
          color={currentWm.color} 
          onChange={(c) => setCurrentWm({...currentWm, color: c})} 
          onClose={() => setActiveColorPicker(null)}
          title="Text Color"
        />
      )}
      {activeColorPicker === 'bg' && (
        <AdvancedColorPicker 
          color={currentWm.backgroundColor} 
          onChange={(c) => setCurrentWm({...currentWm, backgroundColor: c})} 
          onClose={() => setActiveColorPicker(null)}
          title="Background Color"
          isBackground={true}
        />
      )}

      <footer className="footer">
        <div className="developer-info">
          Developer: <span>R Swaroop</span> | Email: <a href="mailto:rswaroop2000@gmail.com" className="email-link">rswaroop2000@gmail.com</a>
        </div>
        <a href="https://digitalheroesco.com" target="_blank" rel="noopener noreferrer" className="dh-button">
          Built for Digital Heroes
        </a>
      </footer>
    </div>
  );
}

export default App;
