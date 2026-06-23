import { useState, useRef, useEffect, useCallback } from 'react';
import './AdvancedColorPicker.css';

// Color math helpers
const hexToRgb = (hex) => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  return { r, g, b };
};

const rgbToHex = (r, g, b) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const hslToRgb = (h, s, l) => {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    let p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
};

const BASIC_COLORS = [
  '#FF8080', '#FFFF80', '#80FF80', '#00FF80', '#80FFFF', '#0080FF', '#FF80C0', '#FF80FF',
  '#FF0000', '#FFFF00', '#80FF00', '#00FF40', '#00FFFF', '#0080C0', '#8080C0', '#FF00FF',
  '#804040', '#FF8040', '#00FF00', '#008080', '#004080', '#8080FF', '#800040', '#FF0080',
  '#800000', '#FF8000', '#008000', '#008040', '#0000FF', '#0000A0', '#800080', '#8000FF',
  '#400000', '#804000', '#004000', '#004040', '#000080', '#000040', '#400040', '#400080',
  '#000000', '#808000', '#808040', '#808080', '#408080', '#C0C0C0', '#400040', '#FFFFFF'
];

export const AdvancedColorPicker = ({ color, onChange, onClose, title, isBackground }) => {
  const [hexColor, setHexColor] = useState(color === 'transparent' ? '#000000' : color);
  const [hsl, setHsl] = useState({ h: 0, s: 100, l: 50 });
  const [rgb, setRgb] = useState({ r: 0, g: 0, b: 0 });
  const [customColors, setCustomColors] = useState(Array(16).fill('#FFFFFF'));
  const [selectedCustomIndex, setSelectedCustomIndex] = useState(0);

  const hueSatMapRef = useRef(null);
  const lumSliderRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('windowsCustomColors');
      if (saved) setCustomColors(JSON.parse(saved));
    } catch (e) {}
  }, []);

  const saveCustomColors = (colors) => {
    setCustomColors(colors);
    localStorage.setItem('windowsCustomColors', JSON.stringify(colors));
  };

  useEffect(() => {
    if (hexColor && hexColor !== 'transparent') {
      const { r, g, b } = hexToRgb(hexColor);
      setRgb({ r, g, b });
      setHsl(rgbToHsl(r, g, b));
    }
  }, []); // Only on mount

  const updateFromHex = (hex) => {
    if (/^#[0-9A-F]{6}$/i.test(hex) || /^#[0-9A-F]{3}$/i.test(hex)) {
      let fullHex = hex;
      if (hex.length === 4) {
        fullHex = "#" + hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3];
      }
      setHexColor(fullHex.toUpperCase());
      const newRgb = hexToRgb(fullHex);
      setRgb(newRgb);
      setHsl(rgbToHsl(newRgb.r, newRgb.g, newRgb.b));
    }
  };

  const updateFromHsl = (newHsl) => {
    setHsl(newHsl);
    const newRgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    setRgb(newRgb);
    setHexColor(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
  };

  const updateFromRgb = (newRgb) => {
    setRgb(newRgb);
    setHsl(rgbToHsl(newRgb.r, newRgb.g, newRgb.b));
    setHexColor(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
  };

  const handleHueSatDrag = useCallback((e) => {
    if (!hueSatMapRef.current) return;
    const rect = hueSatMapRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    x = Math.max(0, Math.min(x, rect.width));
    y = Math.max(0, Math.min(y, rect.height));
    
    // Windows map: X is Hue (0-360), Y is inverted Saturation (0-100)
    const h = Math.round((x / rect.width) * 360);
    const s = Math.round((1 - y / rect.height) * 100);
    updateFromHsl({ ...hsl, h, s });
  }, [hsl]);

  const handleLumDrag = useCallback((e) => {
    if (!lumSliderRef.current) return;
    const rect = lumSliderRef.current.getBoundingClientRect();
    let y = e.clientY - rect.top;
    y = Math.max(0, Math.min(y, rect.height));
    
    // Windows map: Y is inverted Luminance (0-100)
    const l = Math.round((1 - y / rect.height) * 100);
    updateFromHsl({ ...hsl, l });
  }, [hsl]);

  const onPointerDownHueSat = (e) => {
    e.preventDefault();
    handleHueSatDrag(e);
    const move = (eMove) => handleHueSatDrag(eMove);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onPointerDownLum = (e) => {
    e.preventDefault();
    handleLumDrag(e);
    const move = (eMove) => handleLumDrag(eMove);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handleAddCustomColor = () => {
    const newColors = [...customColors];
    newColors[selectedCustomIndex] = hexColor;
    saveCustomColors(newColors);
    setSelectedCustomIndex((selectedCustomIndex + 1) % 16);
  };

  const handleOk = () => {
    onChange(hexColor);
    onClose();
  };

  return (
    <>
      <div className="adv-color-cover" onClick={onClose} />
      <div className="adv-color-modal">
        <div className="adv-header">
          <h3>{title}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="adv-body">
          <div className="adv-left-panel">
            <div className="swatch-section">
              <label>Basic colors:</label>
              <div className="basic-swatches-grid">
                {BASIC_COLORS.map((c, i) => (
                  <div 
                    key={i} 
                    className={`adv-swatch ${hexColor === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => updateFromHex(c)}
                  />
                ))}
              </div>
            </div>

            <div className="swatch-section">
              <label>Custom colors:</label>
              <div className="custom-swatches-grid">
                {customColors.map((c, i) => (
                  <div 
                    key={i} 
                    className={`adv-swatch custom ${selectedCustomIndex === i ? 'active-slot' : ''} ${hexColor === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => {
                      setSelectedCustomIndex(i);
                      if (c !== '#FFFFFF') updateFromHex(c);
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="left-panel-actions">
              {isBackground && (
                <button 
                  className={`adv-btn transparent-btn ${color === 'transparent' ? 'active' : ''}`}
                  onClick={() => onChange('transparent')}
                >
                  <div className="transparent-checker" /> Make Transparent
                </button>
              )}
            </div>
          </div>

          <div className="adv-right-panel">
            <div className="interactive-maps">
              {/* Hue/Sat Map */}
              <div 
                className="hue-sat-map" 
                ref={hueSatMapRef}
                onPointerDown={onPointerDownHueSat}
                style={{
                  background: `
                    linear-gradient(to bottom, transparent, #808080),
                    linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)
                  `
                }}
              >
                <div 
                  className="hue-sat-pointer" 
                  style={{
                    left: `${(hsl.h / 360) * 100}%`,
                    top: `${100 - hsl.s}%`
                  }}
                >
                  <div className="crosshair-h" />
                  <div className="crosshair-v" />
                </div>
              </div>

              {/* Luminance Slider */}
              <div className="lum-slider-wrapper">
                <div 
                  className="lum-slider"
                  ref={lumSliderRef}
                  onPointerDown={onPointerDownLum}
                  style={{
                    background: `linear-gradient(to bottom, #fff, hsl(${hsl.h}, ${hsl.s}%, 50%), #000)`
                  }}
                >
                  <div 
                    className="lum-pointer"
                    style={{ top: `${100 - hsl.l}%` }}
                  >
                    <div className="lum-arrow" />
                  </div>
                </div>
              </div>
            </div>

            <div className="adv-inputs-row">
              <div className="color-preview-box">
                <div className="preview-label">Color|Solid</div>
                <div className="preview-color" style={{ backgroundColor: hexColor }}></div>
              </div>

              <div className="color-inputs-grid">
                <div className="input-group">
                  <label>Hue:</label>
                  <input type="number" min="0" max="360" value={hsl.h} onChange={(e) => updateFromHsl({...hsl, h: Number(e.target.value)})} />
                </div>
                <div className="input-group">
                  <label>Sat:</label>
                  <input type="number" min="0" max="100" value={hsl.s} onChange={(e) => updateFromHsl({...hsl, s: Number(e.target.value)})} />
                </div>
                <div className="input-group">
                  <label>Lum:</label>
                  <input type="number" min="0" max="100" value={hsl.l} onChange={(e) => updateFromHsl({...hsl, l: Number(e.target.value)})} />
                </div>

                <div className="input-group">
                  <label>Red:</label>
                  <input type="number" min="0" max="255" value={rgb.r} onChange={(e) => updateFromRgb({...rgb, r: Number(e.target.value)})} />
                </div>
                <div className="input-group">
                  <label>Green:</label>
                  <input type="number" min="0" max="255" value={rgb.g} onChange={(e) => updateFromRgb({...rgb, g: Number(e.target.value)})} />
                </div>
                <div className="input-group">
                  <label>Blue:</label>
                  <input type="number" min="0" max="255" value={rgb.b} onChange={(e) => updateFromRgb({...rgb, b: Number(e.target.value)})} />
                </div>
              </div>
            </div>

            <div className="adv-actions">
              <button className="adv-btn secondary block" onClick={handleAddCustomColor}>Add to Custom Colors</button>
              <div className="action-buttons-right">
                <button className="adv-btn primary" onClick={handleOk}>OK</button>
                <button className="adv-btn secondary" onClick={onClose}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
