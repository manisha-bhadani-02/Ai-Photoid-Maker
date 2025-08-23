import React, { useState, useRef, useCallback } from 'react';
import { Cropper } from 'react-advanced-cropper';
import 'react-advanced-cropper/dist/style.css';
import { PDFDocument, rgb } from 'pdf-lib';
import { Upload, Download, Image as ImageIcon, Palette, Crop, Grid, FileText, Camera, ChevronRight, Check, Loader2, Sparkles, Settings, Eye } from 'lucide-react';

const PhotoProcessingDashboard = () => {
  // State management
  const [currentStep, setCurrentStep] = useState(1);
  const [originalImage, setOriginalImage] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [croppedImage, setCroppedImage] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cropDimensions, setCropDimensions] = useState({ width: 300, height: 300 });
  const [pageSize, setPageSize] = useState('A4');
  const [customPageSize, setCustomPageSize] = useState({ width: 800, height: 600 });
  const [photoSize, setPhotoSize] = useState({ width: 35, height: 45 }); // Default passport size in mm
  const [arrangedPhotos, setArrangedPhotos] = useState([]);
  const [photosPerPage, setPhotosPerPage] = useState(0);
  const [exportFormat, setExportFormat] = useState('png');
  const fileInputRef = useRef(null);
  const cropperRef = useRef(null);
  
  // Define DPI for conversion (96 for screen, 72 for PDF points)
  const SCREEN_DPI = 300; 
  const PDF_DPI = 300;

  // Convert mm → px (for screen preview)
  const mmToPx = (mm) => (mm / 25.4) * SCREEN_DPI;

  // Convert mm → PDF points (1 pt = 1/72 inch)
  const mmToPt = (mm) => (mm / 25.4) * PDF_DPI;

  const pageSizes = {
    A4: { width: mmToPx(210), height: mmToPx(297), pdfWidth: mmToPt(210), pdfHeight: mmToPt(297) },
    A3: { width: mmToPx(297), height: mmToPx(420), pdfWidth: mmToPt(297), pdfHeight: mmToPt(420) },
    Letter: { width: mmToPx(216), height: mmToPx(279), pdfWidth: mmToPt(216), pdfHeight: mmToPt(279) },
    '4x6': { width: mmToPx(102), height: mmToPx(152), pdfWidth: mmToPt(102), pdfHeight: mmToPt(152) },
    '5x7': { width: mmToPx(127), height: mmToPx(178), pdfWidth: mmToPt(127), pdfHeight: mmToPt(178) },
    Custom: { 
      width: mmToPx(customPageSize.width), 
      height: mmToPx(customPageSize.height), 
      pdfWidth: mmToPt(customPageSize.width), 
      pdfHeight: mmToPt(customPageSize.height) 
    }
  };

  // Step configurations
  const steps = [
    { id: 1, title: 'Upload Image', icon: Upload, description: 'Select or upload your photo', color: 'blue' },
    { id: 2, title: 'Remove Background', icon: Sparkles, description: 'AI background removal', color: 'purple' },
    { id: 3, title: 'Change Background', icon: Palette, description: 'Choose new background', color: 'pink' },
    { id: 4, title: 'Crop & Size', icon: Crop, description: 'Set dimensions', color: 'emerald' },
    { id: 5, title: 'Arrange Photos', icon: Grid, description: 'Auto-arrange layout', color: 'amber' },
    { id: 6, title: 'Export', icon: Download, description: 'Download results', color: 'indigo' }
  ];

  // Background removal function
  const removeBackground = async (useUrl = false) => {
    if (!croppedImage && !originalImage) return;
    
    setIsProcessing(true);
    
    try {
      let response;
      const imageToProcess = croppedImage || originalImage;
      
      if (useUrl && imageUrl) {
        response = await fetch('http://localhost:8000/remove-background/url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image_url: imageUrl }),
        });
      } else {
        const formData = new FormData();
        
        if (imageToProcess && imageToProcess.startsWith('data:')) {
          const response = await fetch(imageToProcess);
          const blob = await response.blob();
          formData.append('file', blob, 'image.jpg');
        }
        
        response = await fetch('http://localhost:8000/remove-background', {
          method: 'POST',
          headers: {
            'accept': 'image/png',
          },
          body: formData,
        });
      }
      
      if (response && response.ok) {
        const blob = await response.blob();
        const processedImageUrl = URL.createObjectURL(blob);
        setProcessedImage(processedImageUrl);
        setCurrentStep(3);
      } else {
        console.error('Background removal failed');
        setProcessedImage(imageToProcess);
        setCurrentStep(3);
      }
    } catch (error) {
      console.error('Error removing background:', error);
      setProcessedImage(croppedImage || originalImage);
      setCurrentStep(3);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setOriginalImage(e.target.result);
        setCroppedImage(e.target.result);
        setCurrentStep(2);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle URL input
  const handleUrlInput = () => {
    if (imageUrl) {
      setOriginalImage(imageUrl);
      setCroppedImage(imageUrl);
      setCurrentStep(2);
    }
  };

  // Handle cropper change
  const onCropperChange = useCallback((cropper) => {
    if (cropper) {
      const canvas = cropper.getCanvas();
      if (canvas) {
        setCroppedImage(canvas.toDataURL());
      }
    }
  }, []);

  // Apply background color
  const applyBackgroundColor = () => {
    if (!processedImage) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      const finalImage = canvas.toDataURL();
      setProcessedImage(finalImage);
      setCurrentStep(4);
    };

    img.src = processedImage;
  };

  // Calculate auto arrangement
  const calculateAutoArrangement = () => {
    const currentPageSize = pageSizes[pageSize];
    const { width: pageWidth, height: pageHeight } = currentPageSize;

    const photoWidthPx = mmToPx(photoSize.width);
    const photoHeightPx = mmToPx(photoSize.height);

    let paddingPx, spacingPx, photosPerRow, photosPerCol;

    const inchWidth = pageWidth / mmToPx(25.4);
    const inchHeight = pageHeight / mmToPx(25.4);
    const isFourBySix =
      (Math.round(inchWidth) === 4 && Math.round(inchHeight) === 6) ||
      (Math.round(inchWidth) === 6 && Math.round(inchHeight) === 4);

    if (isFourBySix) {
      paddingPx = mmToPx(3);
      spacingPx = Math.max(mmToPx(2), Math.min(photoWidthPx, photoHeightPx) * 0.08);

      const usableWidth = pageWidth - (paddingPx * 2);
      const usableHeight = pageHeight - (paddingPx * 2);

      if (photoWidthPx <= usableWidth / 3 && photoHeightPx <= usableHeight / 4) {
        photosPerRow = 3;
        photosPerCol = 4;
      } else if (photoWidthPx <= usableWidth / 3 && photoHeightPx <= usableHeight / 3) {
        photosPerRow = 3;
        photosPerCol = 3;
      } else {
        photosPerRow = 3;
        photosPerCol = 2;
      }
    } else {
      paddingPx = Math.max(mmToPx(2), pageWidth * 0.03); 
      spacingPx = Math.max(mmToPx(2), Math.min(photoWidthPx, photoHeightPx) * 0.08);

      const usableWidth = pageWidth - (paddingPx * 2);
      const usableHeight = pageHeight - (paddingPx * 2);

      photosPerRow = Math.floor(usableWidth / (photoWidthPx + spacingPx));
      photosPerCol = Math.floor(usableHeight / (photoHeightPx + spacingPx));
    }

    const totalPhotos = photosPerRow * photosPerCol;
    setPhotosPerPage(totalPhotos);

    const totalUsedWidth = photosPerRow * photoWidthPx + (photosPerRow - 1) * spacingPx;
    const totalUsedHeight = photosPerCol * photoHeightPx + (photosPerCol - 1) * spacingPx;
    const offsetX = (pageWidth - totalUsedWidth) / 2;
    const offsetY = (pageHeight - totalUsedHeight) / 2;

    const arrangement = [];
    for (let row = 0; row < photosPerCol; row++) {
      for (let col = 0; col < photosPerRow; col++) {
        arrangement.push({
          x: offsetX + col * (photoWidthPx + spacingPx),
          y: offsetY + row * (photoHeightPx + spacingPx),
          width: photoWidthPx,
          height: photoHeightPx,
        });
      }
    }

    setArrangedPhotos(arrangement);
    setCurrentStep(5);
  };

  // Export as PNG
  const exportAsPNG = () => {
    const currentPageSize = pageSizes[pageSize];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = currentPageSize.width;
    canvas.height = currentPageSize.height;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const img = new Image();
    img.onload = () => {
      arrangedPhotos.forEach(photo => {
        ctx.drawImage(img, photo.x, photo.y, photo.width, photo.height);
      });
      
      const link = document.createElement('a');
      link.download = 'photo-arrangement.png';
      link.href = canvas.toDataURL();
      link.click();
    };
    
    img.src = croppedImage || processedImage;
  };

  // Export as PDF using pdf-lib
  const exportAsPDF = async () => {
    try {
      setIsProcessing(true);
      
      const pdfDoc = await PDFDocument.create();
      const currentPageSize = pageSizes[pageSize];
      const page = pdfDoc.addPage([currentPageSize.pdfWidth, currentPageSize.pdfHeight]);
      
      const imageResponse = await fetch(croppedImage || processedImage);
      const imageArrayBuffer = await imageResponse.arrayBuffer();
      
      let pdfImage;
      if (processedImage.includes('data:image/png')) {
        pdfImage = await pdfDoc.embedPng(imageArrayBuffer);
      } else {
        pdfImage = await pdfDoc.embedJpg(imageArrayBuffer);
      }
      
      arrangedPhotos.forEach(photo => {
        const pdfX = (photo.x / currentPageSize.width) * currentPageSize.pdfWidth;
        const pdfY = currentPageSize.pdfHeight - ((photo.y + photo.height) / currentPageSize.height) * currentPageSize.pdfHeight;
        const pdfWidth = (photo.width / currentPageSize.width) * currentPageSize.pdfWidth;
        const pdfHeight = (photo.height / currentPageSize.height) * currentPageSize.pdfHeight;
        
        page.drawImage(pdfImage, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
        });
      });
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'photo-arrangement.pdf';
      link.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error creating PDF:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle export
  const handleExport = () => {
    if (exportFormat === 'png') {
      exportAsPNG();
    } else {
      exportAsPDF();
    }
  };

  // Common photo size presets
  const photoSizePresets = [
    { name: 'Passport', width: 35, height: 45 },
    { name: 'Visa', width: 51, height: 51 },
    { name: 'ID Card', width: 25, height: 32 },
    { name: 'Driving License', width: 24, height: 32 }
  ];

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl mb-4">
                <Upload className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Your Photo</h2>
              <p className="text-gray-600">Start by selecting an image file or entering a URL</p>
            </div>

            <div className="max-w-2xl mx-auto">
              <div className="relative border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center hover:border-blue-400 transition-colors group bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-purple-50/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative z-10">
                  <Upload className="mx-auto h-12 w-12 text-gray-400 group-hover:text-blue-500 mb-4 transition-colors" />
                  <h3 className="text-lg font-semibold mb-2 text-gray-900">Drop your image here</h3>
                  <p className="text-gray-500 mb-6">Support for JPG, PNG, WebP files up to 10MB</p>
                  
                  <div className="space-y-4">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-3 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg"
                    >
                      Choose File
                    </button>
                    
                    <div className="flex items-center my-6">
                      <div className="flex-1 h-px bg-gray-300"></div>
                      <span className="px-4 text-sm text-gray-500 bg-gray-50 rounded-full">or</span>
                      <div className="flex-1 h-px bg-gray-300"></div>
                    </div>

                    <div className="flex space-x-3">
                      <input
                        type="url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="Enter image URL"
                        className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                      <button
                        onClick={handleUrlInput}
                        className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105"
                      >
                        Load URL
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {originalImage && (
              <div className="text-center animate-fade-in">
                <div className="bg-white rounded-2xl p-6 shadow-xl max-w-lg mx-auto">
                  <img src={originalImage} alt="Original" className="w-full h-64 object-contain rounded-xl mb-4" />
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg inline-flex items-center"
                  >
                    Next Step
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl mb-4">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">AI Background Removal</h2>
              <p className="text-gray-600">Let AI automatically remove the background from your photo</p>
            </div>

            {croppedImage && (
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-2xl p-6 shadow-xl">
                  <div className="aspect-video bg-gray-50 rounded-xl flex items-center justify-center mb-6 overflow-hidden">
                    <img src={croppedImage} alt="To Process" className="max-w-full max-h-full object-contain" />
                  </div>
                  
                  <div className="flex flex-wrap gap-4 justify-center">
                    <button
                      onClick={() => removeBackground(false)}
                      disabled={isProcessing}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105 inline-flex items-center disabled:transform-none shadow-lg"
                    >
                      {isProcessing ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Sparkles className="h-5 w-5 mr-2" />}
                      {isProcessing ? 'Processing...' : 'Remove Background'}
                    </button>
                    
                    {imageUrl && (
                      <button
                        onClick={() => removeBackground(true)}
                        disabled={isProcessing}
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105"
                      >
                        Use URL Method
                      </button>
                    )}
                    
                    <button
                      onClick={() => {
                        setProcessedImage(croppedImage);
                        setCurrentStep(3);
                      }}
                      className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-6 py-3 rounded-xl font-medium transition-all transform hover:scale-105"
                    >
                      Skip This Step
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl mb-4">
                <Palette className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Change Background</h2>
              <p className="text-gray-600">Choose a new background color for your photo</p>
            </div>
            
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl p-6 shadow-xl">
                    <label className="block text-lg font-semibold mb-4 text-gray-900">Background Color</label>
                    <div className="space-y-6">
                      <div className="relative">
                        <input
                          type="color"
                          value={backgroundColor}
                          onChange={(e) => setBackgroundColor(e.target.value)}
                          className="w-full h-16 rounded-xl cursor-pointer border-4 border-gray-200 shadow-lg"
                        />
                        <div className="absolute top-2 left-2 bg-white rounded-lg px-2 py-1 text-xs font-medium text-gray-600 shadow">
                          {backgroundColor.toUpperCase()}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-3 text-gray-700">Popular Colors</label>
                        <div className="grid grid-cols-4 gap-3">
                          {['#ffffff', '#f3f4f6', '#1f2937', '#dc2626', '#16a34a', '#2563eb', '#7c3aed', '#ea580c'].map(color => (
                            <button
                              key={color}
                              onClick={() => setBackgroundColor(color)}
                              className={`w-12 h-12 rounded-xl border-4 transition-all transform hover:scale-110 shadow-lg ${
                                backgroundColor === color ? 'border-blue-500 scale-110' : 'border-gray-200'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {processedImage && (
                    <div className="bg-white rounded-2xl p-6 shadow-xl">
                      <label className="block text-lg font-semibold mb-4 text-gray-900">Preview</label>
                      <div className="aspect-square bg-gray-50 rounded-xl flex items-center justify-center overflow-hidden border-4 border-gray-100">
                        <img src={processedImage} alt="Processed" className="max-w-full max-h-full object-contain" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="text-center mt-8">
                <button
                  onClick={applyBackgroundColor}
                  className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white px-8 py-4 rounded-xl font-semibold transition-all transform hover:scale-105 shadow-lg inline-flex items-center text-lg"
                >
                  <Check className="mr-2 h-5 w-5" />
                  Apply Background
                </button>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl mb-4">
                <Crop className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Crop & Size Settings</h2>
              <p className="text-gray-600">Configure your photo and page dimensions</p>
            </div>
            
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl p-6 shadow-xl">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 flex items-center">
                      <Settings className="mr-2 h-5 w-5" />
                      Photo Settings
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-3 text-gray-700">Quick Presets</label>
                        <div className="grid grid-cols-2 gap-2">
                          {photoSizePresets.map(preset => (
                            <button
                              key={preset.name}
                              onClick={() => setPhotoSize({ width: preset.width, height: preset.height })}
                              className="px-3 py-2 text-sm border-2 border-gray-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition-all font-medium"
                            >
                              {preset.name}
                              <br />
                              <span className="text-xs text-gray-500">{preset.width}×{preset.height}mm</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-3 text-gray-700">Custom Size (mm)</label>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Width</label>
                            <input
                              type="number"
                              step="any"
                              value={photoSize.width}
                              onChange={(e) =>
                                setPhotoSize((prev) => ({
                                  ...prev,
                                  width: parseFloat(e.target.value) || 35,
                                }))
                              }
                              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Height</label>
                            <input
                              type="number"
                              step="any"
                              value={photoSize.height}
                              onChange={(e) =>
                                setPhotoSize((prev) => ({
                                  ...prev,
                                  height: parseFloat(e.target.value) || 45,
                                }))
                              }
                              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-3 text-gray-700">Page Size</label>
                        <select
                          value={pageSize}
                          onChange={(e) => setPageSize(e.target.value)}
                          className="w-full px-3 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-medium"
                        >
                          {Object.keys(pageSizes).map(size => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </select>
                      </div>
                      
                      {pageSize === 'Custom' && (
                        <div>
                          <label className="block text-sm font-medium mb-3 text-gray-700">Custom Page Size (mm)</label>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Width</label>
                              <input
                                type="number"
                                value={customPageSize.width}
                                onChange={(e) => setCustomPageSize(prev => ({ ...prev, width: parseInt(e.target.value) || 800 }))}
                                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Height</label>
                              <input
                                type="number"
                                value={customPageSize.height}
                                onChange={(e) => setCustomPageSize(prev => ({ ...prev, height: parseInt(e.target.value) || 600 }))}
                                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {processedImage && (
                    <div className="bg-white rounded-2xl p-6 shadow-xl">
                      <h3 className="text-lg font-semibold mb-4 text-gray-900 flex items-center">
                        <Eye className="mr-2 h-5 w-5" />
                        Crop Preview
                      </h3>
                      <div className="bg-gray-50 rounded-xl p-4" style={{ height: '400px' }}>
                        <Cropper
                          ref={cropperRef}
                          src={processedImage}
                          onChange={onCropperChange}
                          className="cropper"
                          stencilProps={{
                            aspectRatio: photoSize.width / photoSize.height
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="text-center mt-8">
                <button
                  onClick={calculateAutoArrangement}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-8 py-4 rounded-xl font-semibold transition-all transform hover:scale-105 shadow-lg inline-flex items-center text-lg"
                >
                  <Grid className="mr-2 h-5 w-5" />
                  Calculate Arrangement
                </button>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl mb-4">
                <Grid className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Auto Arrange Photos</h2>
              <p className="text-gray-600">Intelligent layout optimization for maximum space efficiency</p>
            </div>
            
            <div className="max-w-6xl mx-auto">
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 mb-8 border border-amber-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 flex items-center">
                  <Settings className="mr-2 h-5 w-5 text-amber-600" />
                  Arrangement Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold text-gray-900">{pageSize}</div>
                    <div className="text-sm text-gray-600">Page Size</div>
                  </div>
                  <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold text-emerald-600">{photoSize.width}×{photoSize.height}</div>
                    <div className="text-sm text-gray-600">Photo Size (mm)</div>
                  </div>
                  <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold text-blue-600">{photosPerPage}</div>
                    <div className="text-sm text-gray-600">Photos per Page</div>
                  </div>
                  <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold text-purple-600">{arrangedPhotos.length}</div>
                    <div className="text-sm text-gray-600">Total Positions</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-2xl p-8 shadow-xl">
                <h3 className="text-lg font-semibold mb-6 text-gray-900 flex items-center">
                  <Eye className="mr-2 h-5 w-5" />
                  Layout Preview
                </h3>
                <div className="flex justify-center">
                  <div 
                    className="border-4 border-gray-300 bg-white shadow-xl rounded-lg relative overflow-hidden"
                    style={{ 
                      width: Math.min(500, pageSizes[pageSize].width / 3), 
                      height: Math.min(600, pageSizes[pageSize].height / 3),
                      aspectRatio: `${pageSizes[pageSize].width} / ${pageSizes[pageSize].height}`
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100"></div>
                    {arrangedPhotos.map((photo, index) => (
                      <div
                        key={index}
                        className="absolute border-2 border-blue-400 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg shadow-sm transition-all hover:shadow-md hover:scale-105 cursor-pointer"
                        style={{
                          left: `${(photo.x / pageSizes[pageSize].width) * 100}%`,
                          top: `${(photo.y / pageSizes[pageSize].height) * 100}%`,
                          width: `${(photo.width / pageSizes[pageSize].width) * 100}%`,
                          height: `${(photo.height / pageSizes[pageSize].height) * 100}%`,
                        }}
                      >
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="bg-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold text-blue-600 shadow">
                            {index + 1}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Page dimensions indicator */}
                    <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs font-medium">
                      {pageSize}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="text-center mt-8">
                <button
                  onClick={() => setCurrentStep(6)}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-8 py-4 rounded-xl font-semibold transition-all transform hover:scale-105 shadow-lg inline-flex items-center text-lg"
                >
                  Proceed to Export
                  <ChevronRight className="ml-2 h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4">
                <Download className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Export Your Photos</h2>
              <p className="text-gray-600">Download your perfectly arranged photos in high quality</p>
            </div>
            
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Export Options */}
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl p-6 shadow-xl">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 flex items-center">
                      <FileText className="mr-2 h-5 w-5" />
                      Export Format
                    </h3>
                    <div className="space-y-4">
                      <label className="flex items-center p-4 border-2 border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-all">
                        <input
                          type="radio"
                          value="png"
                          checked={exportFormat === "png"}
                          onChange={(e) => setExportFormat(e.target.value)}
                          className="w-4 h-4 text-blue-600 mr-4"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">PNG Format</div>
                          <div className="text-sm text-gray-600">High quality, transparent background support</div>
                        </div>
                        <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                          Recommended
                        </div>
                      </label>
                      <label className="flex items-center p-4 border-2 border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-all">
                        <input
                          type="radio"
                          value="pdf"
                          checked={exportFormat === "pdf"}
                          onChange={(e) => setExportFormat(e.target.value)}
                          className="w-4 h-4 text-blue-600 mr-4"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">PDF Format</div>
                          <div className="text-sm text-gray-600">Print-ready, vector quality</div>
                        </div>
                        <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium">
                          Print Ready
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-200">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900">Export Summary</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white rounded-xl p-3 text-center">
                        <div className="font-bold text-indigo-600">{exportFormat.toUpperCase()}</div>
                        <div className="text-xs text-gray-600">Format</div>
                      </div>
                      <div className="bg-white rounded-xl p-3 text-center">
                        <div className="font-bold text-purple-600">{pageSize}</div>
                        <div className="text-xs text-gray-600">Page Size</div>
                      </div>
                      <div className="bg-white rounded-xl p-3 text-center">
                        <div className="font-bold text-emerald-600">{arrangedPhotos.length}</div>
                        <div className="text-xs text-gray-600">Photos</div>
                      </div>
                      <div className="bg-white rounded-xl p-3 text-center">
                        <div className="font-bold text-amber-600">{photoSize.width}×{photoSize.height}</div>
                        <div className="text-xs text-gray-600">Size (mm)</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Final Preview */}
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl p-6 shadow-xl">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 flex items-center">
                      <Eye className="mr-2 h-5 w-5" />
                      Final Preview
                    </h3>
                    <div className="flex justify-center">
                      <div
                        className="relative border-4 border-gray-300 bg-white shadow-lg rounded-lg overflow-hidden"
                        style={{
                          width: 250,
                          height: 250 * (pageSizes[pageSize].height / pageSizes[pageSize].width),
                          aspectRatio: `${pageSizes[pageSize].width} / ${pageSizes[pageSize].height}`,
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-white"></div>
                        {arrangedPhotos.map((photo, index) => (
                          <div
                            key={index}
                            className="absolute bg-gradient-to-br from-blue-200 to-purple-200 border border-blue-300 rounded shadow-sm"
                            style={{
                              left: `${(photo.x / pageSizes[pageSize].width) * 100}%`,
                              top: `${(photo.y / pageSizes[pageSize].height) * 100}%`,
                              width: `${(photo.width / pageSizes[pageSize].width) * 100}%`,
                              height: `${(photo.height / pageSizes[pageSize].height) * 100}%`,
                            }}
                          />
                        ))}
                        <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
                          {arrangedPhotos.length} photos
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Export Button */}
              <div className="text-center mt-8">
                <button
                  onClick={handleExport}
                  disabled={isProcessing || !processedImage || arrangedPhotos.length === 0}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-12 py-4 rounded-2xl font-bold transition-all transform hover:scale-105 disabled:transform-none shadow-2xl inline-flex items-center text-xl"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="animate-spin h-6 w-6 mr-3" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-6 w-6 mr-3" />
                      Export {exportFormat.toUpperCase()}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg shadow-sm border-b border-gray-200/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center">
              <div className="bg-gradient-to-br from-blue-600 to-purple-600 p-2 rounded-xl mr-4">
                <Camera className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  Photo Processing Studio
                </h1>
                <p className="text-sm text-gray-600">Professional photo arrangement made easy</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Enhanced Vertical Stepper */}
          <div className="lg:col-span-1">
            <div className="bg-white/60 backdrop-blur-lg rounded-2xl shadow-xl p-6 sticky top-28">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Process Steps</h2>
              <nav className="space-y-3">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;
                  const isAccessible = currentStep >= step.id || isCompleted;

                  return (
                    <div key={step.id} className="relative">
                      {/* Connector line */}
                      {index < steps.length - 1 && (
                        <div className={`absolute left-5 top-12 w-0.5 h-8 ${
                          isCompleted ? 'bg-gradient-to-b from-green-500 to-green-400' : 'bg-gray-200'
                        }`} />
                      )}
                      
                      <button
                        onClick={() => isAccessible && setCurrentStep(step.id)}
                        disabled={!isAccessible}
                        className={`w-full flex items-center p-4 rounded-xl transition-all duration-300 transform ${
                          isActive
                            ? `bg-gradient-to-r from-${step.color}-50 to-${step.color}-100 border-2 border-${step.color}-200 scale-105 shadow-lg`
                            : isCompleted
                            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 hover:scale-102 hover:shadow-md'
                            : isAccessible
                            ? 'bg-white border-2 border-gray-200 hover:border-gray-300 hover:shadow-md hover:scale-102'
                            : 'bg-gray-50 border-2 border-gray-100 cursor-not-allowed opacity-60'
                        }`}
                      >
                        <div
                          className={`flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-all ${
                            isActive
                              ? `bg-gradient-to-br from-${step.color}-500 to-${step.color}-600 text-white shadow-lg`
                              : isCompleted
                              ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-md'
                              : 'bg-gray-300 text-gray-600'
                          }`}
                        >
                          {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                        </div>
                        <div className="ml-4 flex-1 text-left">
                          <p className={`font-semibold ${
                            isActive ? `text-${step.color}-900` : isCompleted ? 'text-green-900' : 'text-gray-700'
                          }`}>
                            {step.title}
                          </p>
                          <p className={`text-xs ${
                            isActive ? `text-${step.color}-700` : isCompleted ? 'text-green-700' : 'text-gray-500'
                          }`}>
                            {step.description}
                          </p>
                        </div>
                        {isActive && <ChevronRight className={`h-5 w-5 text-${step.color}-600`} />}
                      </button>
                    </div>
                  );
                })}
              </nav>
              
              {/* Progress indicator */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                  <span>Progress</span>
                  <span>{Math.round((currentStep / steps.length) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(currentStep / steps.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-white/70 backdrop-blur-lg rounded-2xl shadow-xl p-8 min-h-[600px]">
              {renderStepContent()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Floating particles background effect */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-4 -right-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-8 -left-4 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>
    </div>
  );
};

export default PhotoProcessingDashboard;