import warnings
warnings.filterwarnings("ignore", category=FutureWarning)

import os
import io
import asyncio
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import torch
from torchvision import transforms
from transformers import AutoModelForImageSegmentation
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model variable
model = None
device = 'cuda' if torch.cuda.is_available() else 'cpu'

class APIResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None

class ModelStatus(BaseModel):
    loaded: bool
    device: str
    model_name: str = "briaai/RMBG-2.0"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown"""
    # Startup
    try:
        await load_model()
        logger.info("API server started successfully")
    except Exception as e:
        logger.warning(f"Failed to load model on startup: {str(e)}")
        logger.info("Model can be loaded later via /load-model endpoint")
    
    yield
    
    # Shutdown
    logger.info("Shutting down API server")

# FastAPI app initialization
app = FastAPI(
    title="AI Background Removal API",
    description="Remove backgrounds from images using AI",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_hf_token():
    """Get Hugging Face token from environment variables"""
    return os.getenv('HUGGINGFACE_TOKEN') or os.getenv('HF_TOKEN')

async def load_model():
    """Load the RMBG model asynchronously"""
    global model
    
    if model is not None:
        return model
    
    try:
        logger.info("Loading AI model...")
        
        token = get_hf_token()
        kwargs = {'trust_remote_code': True}
        if token:
            kwargs['token'] = token
            logger.info("Using Hugging Face authentication token")
        
        model = AutoModelForImageSegmentation.from_pretrained(
            'briaai/RMBG-2.0',
            **kwargs
        )
        model.to(device)
        model.eval()
        
        logger.info(f"Model loaded successfully on {device}")
        return model
        
    except Exception as e:
        logger.error(f"Failed to load model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to load AI model: {str(e)}")

def validate_image(file: UploadFile):
    """Validate uploaded image file"""
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Check file size (limit to 10MB)
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 10MB")

def process_image(image: Image.Image) -> Image.Image:
    """Process image to remove background"""
    global model
    
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    try:
        # Transform image
        transform = transforms.Compose([
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
        
        # Process
        input_tensor = transform(image).unsqueeze(0).to(device)
        
        with torch.no_grad():
            pred = model(input_tensor)[-1].sigmoid().cpu()
        
        # Create result with alpha channel
        mask = transforms.ToPILImage()(pred[0].squeeze()).resize(image.size)
        result = image.copy()
        result.putalpha(mask)
        
        return result
        
    except Exception as e:
        logger.error(f"Image processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")



@app.get("/", response_model=APIResponse)
async def root():
    """Root endpoint"""
    return APIResponse(
        success=True,
        message="AI Background Removal API is running",
        data={
            "endpoints": {
                "POST /remove-background": "Remove background from image",
                "POST /remove-background/url": "Remove background from image URL", 
                "GET /status": "Get model status",
                "POST /load-model": "Load/reload model"
            }
        }
    )

@app.get("/status", response_model=ModelStatus)
async def get_status():
    """Get model loading status"""
    return ModelStatus(
        loaded=model is not None,
        device=device
    )

@app.post("/load-model", response_model=APIResponse)
async def load_model_endpoint(background_tasks: BackgroundTasks):
    """Load or reload the model"""
    global model
    
    try:
        model = None  # Reset model
        await load_model()
        return APIResponse(
            success=True,
            message="Model loaded successfully",
            data={"device": device}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/remove-background")
async def remove_background(file: UploadFile = File(...)):
    """
    Remove background from uploaded image
    
    - **file**: Image file to process (PNG, JPG, JPEG, BMP, TIFF)
    
    Returns the processed image with transparent background as PNG
    """
    
    # Validate file
    validate_image(file)
    
    # Ensure model is loaded
    if model is None:
        try:
            await load_model()
        except Exception:
            raise HTTPException(
                status_code=503, 
                detail="AI model not available. Try calling /load-model first."
            )
    
    try:
        # Read and process image
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        
        # Process image
        result_image = process_image(image)
        
        # Convert to bytes
        output_buffer = io.BytesIO()
        result_image.save(output_buffer, format='PNG')
        output_buffer.seek(0)
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(output_buffer.read()),
            media_type="image/png",
            headers={
                "Content-Disposition": "attachment; filename=background_removed.png"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/remove-background/url", response_model=APIResponse)
async def remove_background_url(image_url: str):
    """
    Remove background from image URL
    
    - **image_url**: URL of the image to process
    
    Returns base64 encoded PNG image with transparent background
    """
    
    if model is None:
        try:
            await load_model()
        except Exception:
            raise HTTPException(
                status_code=503,
                detail="AI model not available. Try calling /load-model first."
            )
    
    try:
        import requests
        import base64
        
        # Download image
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        
        # Validate content type
        if not response.headers.get('content-type', '').startswith('image/'):
            raise HTTPException(status_code=400, detail="URL does not point to an image")
        
        # Process image
        image = Image.open(io.BytesIO(response.content)).convert("RGB")
        result_image = process_image(image)
        
        # Convert to base64
        output_buffer = io.BytesIO()
        result_image.save(output_buffer, format='PNG')
        base64_image = base64.b64encode(output_buffer.getvalue()).decode()
        
        return APIResponse(
            success=True,
            message="Background removed successfully",
            data={
                "image": base64_image,
                "format": "PNG",
                "size": result_image.size
            }
        )
        
    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to download image: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "device": device
    }

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content=APIResponse(
            success=False,
            message="Endpoint not found"
        ).dict()
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content=APIResponse(
            success=False,
            message="Internal server error"
        ).dict()
    )

def main():
    """Run the API server"""
    # Check for environment variables
    hf_token = get_hf_token()
    if hf_token:
        logger.info("🔑 Found Hugging Face token in environment variables")
    else:
        logger.info("ℹ️ No HF token found. Set HF_TOKEN environment variable if model download fails.")
    
    logger.info(f"🚀 Starting Background Removal API Server")
    logger.info(f"📱 Device: {device.upper()}")
    logger.info(f"🌐 API Documentation will be available at: http://localhost:8000/docs")
    
    # Configuration
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    workers = int(os.getenv("WORKERS", "1"))
    
    # Get current file name without extension
    current_file = Path(__file__).stem
    
    # Run server
    uvicorn.run(
        f"{current_file}:app",
        host=host,
        port=port,
        workers=workers,
        reload=os.getenv("RELOAD", "false").lower() == "true"
    )

if __name__ == "__main__":
    main()