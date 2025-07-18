class ChatApp {
  constructor() {
    this.chatMessages = document.getElementById("chatMessages")
    this.messageInput = document.getElementById("messageInput")
    this.chatForm = document.getElementById("chatForm")
    this.sendButton = document.getElementById("sendButton")
    this.loadingIndicator = document.getElementById("loadingIndicator")
    this.socket = null
    this.userId = this.generateUserId()
    this.username = ""
    this.isConnected = false

    this.initializeElements()
    this.initializeEventListeners()
    this.showUsernameModal()
  }

  generateUserId() {
    return "user_" + Math.random().toString(36).substr(2, 9)
  }

  initializeElements() {
    // Modal elements
    this.usernameModal = document.getElementById("usernameModal")
    this.usernameInput = document.getElementById("usernameInput")
    this.joinChatBtn = document.getElementById("joinChatBtn")

    // Chat elements
    this.chatContainer = document.getElementById("chatContainer")
    this.typingIndicator = document.getElementById("typingIndicator")
    this.connectionStatus = document.getElementById("connectionStatus")
    this.currentUsername = document.getElementById("currentUsername")
    this.onlineUsers = document.getElementById("onlineUsers")
    this.charCounter = document.getElementById("charCounter")

    // Image elements
    this.imageUploadBtn = document.getElementById("imageUploadBtn")
    this.imageInput = document.getElementById("imageInput")
    this.imageModal = document.getElementById("imageModal")
    this.modalImage = document.getElementById("modalImage")
    this.closeImageModal = document.getElementById("closeImageModal")
  }

  initializeEventListeners() {
    // Username modal
    this.joinChatBtn.addEventListener("click", () => this.joinChat())
    this.usernameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.joinChat()
    })

    // Chat form
    this.chatForm.addEventListener("submit", (e) => this.handleSubmit(e))
    this.messageInput.addEventListener("input", () => this.updateCharCounter())
    this.messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        this.handleSubmit(e)
      }
    })

    // Image upload
    this.imageUploadBtn.addEventListener("click", () => this.imageInput.click())
    this.imageInput.addEventListener("change", (e) => this.handleImageUpload(e))

    // Image modal
    this.closeImageModal.addEventListener("click", () => this.closeImageModalHandler())
    this.imageModal.addEventListener("click", (e) => {
      if (e.target === this.imageModal) this.closeImageModalHandler()
    })

    // Window events
    window.addEventListener("beforeunload", () => {
      if (this.socket) this.socket.close()
    })
  }

  showUsernameModal() {
    this.usernameModal.style.display = "flex"
    this.usernameInput.focus()
  }

  joinChat() {
    const username = this.usernameInput.value.trim()
    if (!username) {
      alert("Please enter a username")
      return
    }

    this.username = username
    this.currentUsername.textContent = username
    this.usernameModal.style.display = "none"
    this.chatContainer.style.display = "flex"

    this.connectWebSocket()
    this.updateOnlineUsers()
  }

  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const wsUrl = `${protocol}//${window.location.host}/ws/${this.userId}?username=${encodeURIComponent(this.username)}`

    this.socket = new WebSocket(wsUrl)

    this.socket.onopen = () => {
      this.isConnected = true
      this.updateConnectionStatus("connected", "Connected")
      console.log("WebSocket connected")
    }

    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      this.handleIncomingMessage(message)
    }

    this.socket.onclose = () => {
      this.isConnected = false
      this.updateConnectionStatus("disconnected", "Disconnected")
      console.log("WebSocket disconnected")

      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (!this.isConnected) {
          this.connectWebSocket()
        }
      }, 3000)
    }

    this.socket.onerror = (error) => {
      console.error("WebSocket error:", error)
      this.updateConnectionStatus("disconnected", "Connection Error")
    }
  }

  updateConnectionStatus(status, text) {
    const statusDot = this.connectionStatus.querySelector(".status-dot")
    const statusText = this.connectionStatus.querySelector(".status-text")

    statusDot.className = `status-dot ${status}`
    statusText.textContent = text
  }

  async updateOnlineUsers() {
    try {
      const response = await fetch("/api/users")
      const data = await response.json()
      this.onlineUsers.textContent = `${data.count} user${data.count !== 1 ? "s" : ""} online`
    } catch (error) {
      console.error("Error fetching users:", error)
    }
  }

  handleIncomingMessage(message) {
    if (message.type === "ai") {
      this.hideTypingIndicator()
    }

    this.addMessage(message)
    this.updateOnlineUsers()
  }

  async handleSubmit(e) {
    e.preventDefault()

    const message = this.messageInput.value.trim()
    if (!message || !this.isConnected) return

    // Add user message to chat
    this.addMessage({ content: message, type: "user", user_id: this.userId })

    // Clear input and disable form
    this.messageInput.value = ""
    this.setLoading(true)
    this.showTypingIndicator()

    try {
      // Send request to backend
      const response = await fetch("/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: message }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      // Add bot response to chat
      this.addMessage({ content: data.answer, type: "ai", context: data.context })
    } catch (error) {
      console.error("Error:", error)
      this.addMessage({
        content: "Sorry, I encountered an error while processing your request. Please try again.",
        type: "system",
      })
    } finally {
      this.setLoading(false)
      this.messageInput.focus()
    }
  }

  async handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
      alert("Image size must be less than 5MB")
      return
    }

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/upload-image", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Upload failed")
      }

      const result = await response.json()

      this.sendMessage({
        type: "user_message",
        content: `Shared an image: ${file.name}`,
        message_type: "image",
        image_url: result.url,
      })
    } catch (error) {
      console.error("Error uploading image:", error)
      alert("Failed to upload image. Please try again.")
    }

    // Clear the input
    e.target.value = ""
  }

  sendMessage(messageData) {
    if (this.socket && this.isConnected) {
      this.socket.send(JSON.stringify(messageData))
    }
  }

  addMessage(message) {
    const messageDiv = document.createElement("div")

    // Determine message class based on type and user
    let messageClass = "message"
    if (message.type === "user") {
      messageClass += message.user_id === this.userId ? " user-message" : " other-user-message"
    } else if (message.type === "ai") {
      messageClass += " ai-message"
    } else if (message.type === "system") {
      messageClass += " system-message"
    }

    messageDiv.className = messageClass

    const contentDiv = document.createElement("div")
    contentDiv.className = "message-content"

    // Add message header (username and timestamp) for non-system messages
    if (message.type !== "system") {
      const headerDiv = document.createElement("div")
      headerDiv.className = "message-header"

      const usernameSpan = document.createElement("span")
      usernameSpan.className = "message-username"
      usernameSpan.textContent = message.username

      const timestampSpan = document.createElement("span")
      timestampSpan.className = "message-timestamp"
      timestampSpan.textContent = this.formatTimestamp(message.timestamp)

      headerDiv.appendChild(usernameSpan)
      headerDiv.appendChild(timestampSpan)
      contentDiv.appendChild(headerDiv)
    }

    // Add message content
    const textDiv = document.createElement("div")
    textDiv.className = "message-text"
    textDiv.textContent = message.content

    contentDiv.appendChild(textDiv)

    // Add image if present
    if (message.message_type === "image" && message.image_url) {
      const imageDiv = document.createElement("div")
      const img = document.createElement("img")
      img.src = message.image_url
      img.className = "message-image"
      img.alt = "Shared image"
      img.addEventListener("click", () => this.showImageModal(message.image_url))
      imageDiv.appendChild(img)
      contentDiv.appendChild(imageDiv)
    }

    // Add context for AI messages
    if (message.context && message.context.length > 0) {
      const contextSection = document.createElement("div")
      contextSection.className = "context-section"

      const contextTitle = document.createElement("div")
      contextTitle.className = "context-title"
      contextTitle.textContent = "Sources:"
      contextSection.appendChild(contextTitle)

      message.context.forEach((item) => {
        const contextItem = document.createElement("div")
        contextItem.className = "context-item"
        contextItem.textContent = item
        contextSection.appendChild(contextItem)
      })

      contentDiv.appendChild(contextSection)
    }

    messageDiv.appendChild(contentDiv)
    this.chatMessages.appendChild(messageDiv)

    this.scrollToBottom()
  }

  showImageModal(imageUrl) {
    this.modalImage.src = imageUrl
    this.imageModal.style.display = "flex"
  }

  closeImageModalHandler() {
    this.imageModal.style.display = "none"
  }

  showTypingIndicator() {
    this.typingIndicator.style.display = "flex"
    this.scrollToBottom()
  }

  hideTypingIndicator() {
    this.typingIndicator.style.display = "none"
  }

  updateCharCounter() {
    const length = this.messageInput.value.length
    this.charCounter.textContent = `${length}/1000`

    if (length > 900) {
      this.charCounter.style.color = "#dc3545"
    } else if (length > 800) {
      this.charCounter.style.color = "#ffc107"
    } else {
      this.charCounter.style.color = "#6c757d"
    }
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString()
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.loadingIndicator.style.display = "flex"
      this.sendButton.disabled = true
      this.messageInput.disabled = true
    } else {
      this.loadingIndicator.style.display = "none"
      this.sendButton.disabled = false
      this.messageInput.disabled = false
    }
  }

  scrollToBottom() {
    setTimeout(() => {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight
    }, 100)
  }
}

// Initialize the chat app when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new ChatApp()
})
