from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from langfloww import rag_chain
import json
import uuid
import os
from datetime import datetime
from typing import List, Dict, Optional
import base64

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# In-memory storage for messages and connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.messages: List[Dict] = []
        self.users: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, user_id: str, username: str):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.users[user_id] = {
            "username": username,
            "websocket": websocket,
            "connected_at": datetime.now().isoformat()
        }
        
        # Send recent messages to new user
        recent_messages = self.messages[-50:]  # Last 50 messages
        for message in recent_messages:
            await websocket.send_text(json.dumps(message))

    def disconnect(self, websocket: WebSocket, user_id: str):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if user_id in self.users:
            del self.users[user_id]

    async def broadcast(self, message: Dict):
        self.messages.append(message)
        # Keep only last 1000 messages in memory
        if len(self.messages) > 1000:
            self.messages = self.messages[-1000:]
            
        message_json = json.dumps(message)
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message_json)
            except:
                disconnected.append(connection)
        
        # Remove disconnected connections
        for connection in disconnected:
            if connection in self.active_connections:
                self.active_connections.remove(connection)

manager = ConnectionManager()

class QueryRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    answer: str
    context: list[str]

@app.get("/")
async def read_root():
    return FileResponse('static/index.html')

@app.post("/chat", response_model=QueryResponse)
async def ask_question(req: QueryRequest):
    answer, context = rag_chain(req.query)
    return {"answer": answer, "context": context}

@app.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Create uploads directory if it doesn't exist
    os.makedirs("static/uploads", exist_ok=True)
    
    # Generate unique filename
    file_extension = file.filename.split('.')[-1]
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = f"static/uploads/{unique_filename}"
    
    # Save file
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    return {"filename": unique_filename, "url": f"/static/uploads/{unique_filename}"}

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    # Get username from query params
    username = websocket.query_params.get("username", f"User_{user_id[:8]}")
    
    await manager.connect(websocket, user_id, username)
    
    # Broadcast user joined message
    join_message = {
        "id": str(uuid.uuid4()),
        "type": "system",
        "content": f"{username} joined the chat",
        "timestamp": datetime.now().isoformat(),
        "user_id": "system",
        "username": "System"
    }
    await manager.broadcast(join_message)
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if message_data["type"] == "user_message":
                # Handle user message
                user_message = {
                    "id": str(uuid.uuid4()),
                    "type": "user",
                    "content": message_data["content"],
                    "message_type": message_data.get("message_type", "text"),
                    "timestamp": datetime.now().isoformat(),
                    "user_id": user_id,
                    "username": username,
                    "image_url": message_data.get("image_url")
                }
                await manager.broadcast(user_message)
                
                # If it's a text message, get AI response
                if message_data.get("message_type", "text") == "text":
                    try:
                        answer, context = rag_chain(message_data["content"])
                        
                        ai_message = {
                            "id": str(uuid.uuid4()),
                            "type": "ai",
                            "content": answer,
                            "message_type": "text",
                            "timestamp": datetime.now().isoformat(),
                            "user_id": "ai",
                            "username": "AI Assistant",
                            "context": context
                        }
                        await manager.broadcast(ai_message)
                    except Exception as e:
                        error_message = {
                            "id": str(uuid.uuid4()),
                            "type": "ai",
                            "content": "Sorry, I encountered an error processing your request.",
                            "message_type": "text",
                            "timestamp": datetime.now().isoformat(),
                            "user_id": "ai",
                            "username": "AI Assistant"
                        }
                        await manager.broadcast(error_message)
                        
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
        # Broadcast user left message
        leave_message = {
            "id": str(uuid.uuid4()),
            "type": "system",
            "content": f"{username} left the chat",
            "timestamp": datetime.now().isoformat(),
            "user_id": "system",
            "username": "System"
        }
        await manager.broadcast(leave_message)

@app.get("/api/users")
async def get_active_users():
    return {
        "users": [
            {"user_id": uid, "username": user["username"], "connected_at": user["connected_at"]}
            for uid, user in manager.users.items()
        ],
        "count": len(manager.users)
    }
