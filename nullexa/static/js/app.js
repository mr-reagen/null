// Global variables
let socket;
let userId;
let username;
let activeUsers = {};
let activeRooms = {};
let peerConnections = {};
let dataChannels = {};
let currentDirectChatUser = null;
let currentRoom = null;
let notificationSound;
let messageSound;

// WebRTC configuration
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Maximum file size (1GB)
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize notification sounds
    notificationSound = document.getElementById('notification-tone');
    messageSound = document.getElementById('message-notification');
    
    initializeSocketConnection();
    setupEventListeners();
    setupFileUploadListeners();
});

// Initialize Socket.IO connection
function initializeSocketConnection() {
    socket = io();
    
    // Socket event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus('Connected', true);
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus('Disconnected', false);
        // Clear all peer connections
        Object.keys(peerConnections).forEach(peerId => {
            if (peerConnections[peerId]) {
                peerConnections[peerId].close();
                delete peerConnections[peerId];
            }
            if (dataChannels[peerId]) {
                delete dataChannels[peerId];
            }
        });
    });
    
    socket.on('connected', (data) => {
        userId = data.userId;
        username = data.username;
        document.getElementById('username-input').value = username;
        console.log(`Assigned ID: ${userId}, Username: ${username}`);
    });
    
    socket.on('user_list', (data) => {
        updateUsersList(data.users);
    });
    
    socket.on('user_connected', (data) => {
        console.log(`User connected: ${data.username}`);
        // Add user to the list if not already there
        if (!activeUsers[data.userId]) {
            activeUsers[data.userId] = data.username;
            updateUsersListUI();
        }
    });
    
    socket.on('user_disconnected', (data) => {
        console.log(`User disconnected: ${data.userId}`);
        // Remove user from the list
        if (activeUsers[data.userId]) {
            delete activeUsers[data.userId];
            updateUsersListUI();
        }
        
        // Close peer connection if exists
        if (peerConnections[data.userId]) {
            peerConnections[data.userId].close();
            delete peerConnections[data.userId];
        }
        if (dataChannels[data.userId]) {
            delete dataChannels[data.userId];
        }
        
        // If we were chatting with this user, show welcome screen
        if (currentDirectChatUser === data.userId) {
            showWelcomeScreen();
            currentDirectChatUser = null;
        }
    });
    
    // Direct file message (via Socket.IO fallback)
    socket.on('file_message', (data) => {
        console.log(`Received file message from ${data.username}`);
        if (data.to === userId) {
            addDirectFileMessage(data.from, data.username, data.fileInfo, data.timestamp);
            // Play notification sound
            if (notificationSound) {
                notificationSound.play().catch(err => console.error('Error playing sound:', err));
            }
        }
    });
    
    socket.on('username_updated', (data) => {
        console.log(`Username updated: ${data.userId} -> ${data.username}`);
        if (activeUsers[data.userId]) {
            activeUsers[data.userId] = data.username;
            updateUsersListUI();
            
            // Update chat title if we're chatting with this user
            if (currentDirectChatUser === data.userId) {
                document.getElementById('direct-chat-title').textContent = `Chat with ${data.username}`;
            }
        }
    });
    
    // WebRTC Signaling
    socket.on('offer', (data) => {
        console.log('Received offer from:', data.from);
        handleOffer(data.from, data.offer);
    });
    
    socket.on('answer', (data) => {
        console.log('Received answer from:', data.from);
        handleAnswer(data.from, data.answer);
    });
    
    socket.on('ice_candidate', (data) => {
        console.log('Received ICE candidate from:', data.from);
        handleIceCandidate(data.from, data.candidate);
    });
    
    // Room events
    socket.on('room_created', (data) => {
        console.log(`Room created: ${data.name} (${data.roomId})`);
        activeRooms[data.roomId] = {
            id: data.roomId,
            name: data.name,
            participants: data.participants,
            is_protected: data.is_protected,
            isAdmin: data.isAdmin,
            creator: data.creator,
            joinLink: `/join/${data.roomId}`
        };
        updateRoomsListUI();
        // Automatically join the room we just created
        joinRoom(data.roomId);
    });
    
    socket.on('room_available', (data) => {
        console.log(`Room available: ${data.name} (${data.roomId})`);
        activeRooms[data.roomId] = {
            id: data.roomId,
            name: data.name,
            creator: data.creator,
            participants: [],
            is_protected: data.is_protected,
            joinLink: data.joinLink || `/join/${data.roomId}`
        };
        updateRoomsListUI();
    });
    
    socket.on('room_joined', (data) => {
        console.log(`Joined room: ${data.name} (${data.roomId})`);
        activeRooms[data.roomId].participants = data.participants;
        activeRooms[data.roomId].is_protected = data.is_protected;
        activeRooms[data.roomId].isAdmin = data.isAdmin;
        activeRooms[data.roomId].creator = data.creator;
        activeRooms[data.roomId].joinLink = data.joinLink;
        currentRoom = data.roomId;
        
        // Show room chat UI
        document.getElementById('welcome-screen').style.display = 'none';
        document.getElementById('direct-chat-container').style.display = 'none';
        document.getElementById('room-chat-container').style.display = 'flex';
        document.getElementById('room-chat-title').textContent = `Room: ${data.name}${data.is_protected ? ' 🔒' : ''}`;
        document.getElementById('room-messages').innerHTML = '';
        document.getElementById('room-message-input').focus();
        
        // Show admin controls if user is admin
        const adminControls = document.getElementById('admin-controls');
        if (adminControls) {
            adminControls.style.display = data.isAdmin ? 'block' : 'none';
        }
        
        // Show share link button
        const shareLinkBtn = document.getElementById('share-room-link');
        if (shareLinkBtn) {
            shareLinkBtn.style.display = 'block';
        }
    });
    
    socket.on('user_joined_room', (data) => {
        console.log(`User joined room: ${data.username} (${data.userId})`);
        if (activeRooms[data.roomId] && !activeRooms[data.roomId].participants.includes(data.userId)) {
            activeRooms[data.roomId].participants.push(data.userId);
        }
        
        // Add system message
        if (currentRoom === data.roomId) {
            addRoomSystemMessage(`${data.username} joined the room`);
        }
    });
    
    socket.on('user_left_room', (data) => {
        console.log(`User left room: ${data.userId}`);
        if (activeRooms[data.roomId]) {
            activeRooms[data.roomId].participants = activeRooms[data.roomId].participants.filter(id => id !== data.userId);
            
            // Add system message
            if (currentRoom === data.roomId) {
                const username = activeUsers[data.userId] || 'User';
                addRoomSystemMessage(`${username} left the room`);
            }
        }
    });
    
    socket.on('room_left', (data) => {
        console.log(`Left room: ${data.roomId}`);
        if (currentRoom === data.roomId) {
            currentRoom = null;
            showWelcomeScreen();
        }
    });
    
    socket.on('room_join_error', (data) => {
        console.log(`Error joining room: ${data.message}`);
        alert(`Failed to join room: ${data.message}`);
    });
    
    socket.on('room_message', (data) => {
        console.log(`Room message in ${data.roomId} from ${data.username}: ${data.message}`);
        // Only add the message to UI if it's not from the current user
        // This prevents duplicate messages
        if (currentRoom === data.roomId && data.from !== userId) {
            addRoomMessage(data.from, data.username, data.message, data.timestamp);
            // Play message notification sound
            if (messageSound) {
                messageSound.play().catch(err => console.error('Error playing sound:', err));
            }
        }
    });
    
    // File message in room
    socket.on('room_file_message', (data) => {
        console.log(`Room file message in ${data.roomId} from ${data.username}`);
        // Only add the message to UI if it's not from the current user
        if (currentRoom === data.roomId && data.from !== userId) {
            addRoomFileMessage(data.from, data.username, data.fileInfo, data.timestamp);
            // Play notification sound
            if (notificationSound) {
                notificationSound.play().catch(err => console.error('Error playing sound:', err));
            }
        }
    });
}

// Set up event listeners for UI elements
function setupEventListeners() {
    // Function to update username with visual feedback
    function updateUsername() {
        const newUsername = document.getElementById('username-input').value.trim();
        if (newUsername && newUsername !== username) {
            socket.emit('update_username', { username: newUsername });
            username = newUsername;
            
            // Visual feedback
            const button = document.getElementById('update-username');
            const originalText = button.textContent;
            button.textContent = 'Updated!';
            button.classList.add('btn-success');
            button.classList.remove('btn-outline-secondary');
            
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('btn-success');
                button.classList.add('btn-outline-secondary');
            }, 1500);
            
            return true;
        }
        return false;
    }
    
    // Update username on button click
    document.getElementById('update-username').addEventListener('click', () => {
        updateUsername();
    });
    
    // Allow Enter key to update username
    document.getElementById('username-input').addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            updateUsername();
        }
    });
    
    // Refresh users list
    document.getElementById('refresh-users').addEventListener('click', () => {
        socket.emit('get_users');
    });
    
    // Create room button
    document.getElementById('create-room').addEventListener('click', () => {
        const modal = new bootstrap.Modal(document.getElementById('create-room-modal'));
        modal.show();
    });
    
    // Confirm create room
    document.getElementById('confirm-create-room').addEventListener('click', () => {
        const roomName = document.getElementById('room-name-input').value.trim();
        const roomPassword = document.getElementById('room-password-input').value.trim();
        if (roomName) {
            socket.emit('create_room', { 
                name: roomName,
                password: roomPassword // Will be empty string if no password is provided
            });
            const modal = bootstrap.Modal.getInstance(document.getElementById('create-room-modal'));
            modal.hide();
            document.getElementById('room-name-input').value = '';
        }
    });
    
    // Leave room
    document.getElementById('leave-room').addEventListener('click', () => {
        if (currentRoom) {
            socket.emit('leave_room', { roomId: currentRoom });
        }
    });
    
    // Share room link
    document.getElementById('share-room-link').addEventListener('click', () => {
        if (currentRoom && activeRooms[currentRoom]) {
            const roomLink = window.location.origin + activeRooms[currentRoom].joinLink;
            
            // Try to use the clipboard API
            if (navigator.clipboard) {
                navigator.clipboard.writeText(roomLink)
                    .then(() => {
                        alert('Room link copied to clipboard!');
                    })
                    .catch(err => {
                        console.error('Could not copy text: ', err);
                        promptForCopy(roomLink);
                    });
            } else {
                promptForCopy(roomLink);
            }
        }
    });
    
    // Helper function to prompt user to copy manually
    function promptForCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            alert('Room link copied to clipboard!');
        } catch (err) {
            console.error('Could not copy text: ', err);
            alert('Copy this link: ' + text);
        }
        
        document.body.removeChild(textArea);
    }
    
    // Send direct message
    document.getElementById('send-direct-message').addEventListener('click', sendDirectMessage);
    document.getElementById('direct-message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendDirectMessage();
        }
    });
    
    // Send room message
    document.getElementById('send-room-message').addEventListener('click', sendRoomMessage);
    document.getElementById('room-message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendRoomMessage();
        }
    });
}

// Update the connection status UI
function updateConnectionStatus(status, connected) {
    const statusElement = document.getElementById('connection-status');
    statusElement.textContent = status;
    
    if (connected) {
        statusElement.classList.remove('alert-warning', 'alert-danger');
        statusElement.classList.add('alert-success');
    } else {
        statusElement.classList.remove('alert-warning', 'alert-success');
        statusElement.classList.add('alert-danger');
    }
}

// Update the users list with data from the server
function updateUsersList(users) {
    activeUsers = {};
    users.forEach(user => {
        if (user.id !== userId) { // Don't include ourselves
            activeUsers[user.id] = user.username;
        }
    });
    updateUsersListUI();
}

// Update the users list in the UI
function updateUsersListUI() {
    const usersListElement = document.getElementById('users-list');
    usersListElement.innerHTML = '';
    
    if (Object.keys(activeUsers).length === 0) {
        const noUsersElement = document.createElement('div');
        noUsersElement.className = 'list-group-item';
        noUsersElement.textContent = 'No other users online';
        usersListElement.appendChild(noUsersElement);
        return;
    }
    
    Object.entries(activeUsers).forEach(([id, name]) => {
        const userElement = document.createElement('div');
        userElement.className = 'list-group-item';
        if (currentDirectChatUser === id) {
            userElement.classList.add('active');
        }
        userElement.textContent = name;
        userElement.dataset.userId = id;
        
        userElement.addEventListener('click', () => {
            startDirectChat(id, name);
        });
        
        usersListElement.appendChild(userElement);
    });
}

// Update the rooms list in the UI
function updateRoomsListUI() {
    const roomsListElement = document.getElementById('rooms-list');
    roomsListElement.innerHTML = '';
    
    if (Object.keys(activeRooms).length === 0) {
        const noRoomsElement = document.createElement('div');
        noRoomsElement.className = 'list-group-item';
        noRoomsElement.textContent = 'No rooms available';
        roomsListElement.appendChild(noRoomsElement);
        return;
    }
    
    Object.values(activeRooms).forEach(room => {
        const roomElement = document.createElement('div');
        roomElement.className = 'list-group-item d-flex justify-content-between align-items-center';
        if (currentRoom === room.id) {
            roomElement.classList.add('active');
        }
        
        const roomInfo = document.createElement('div');
        roomInfo.innerHTML = `
            <div>
                ${room.name} 
                ${room.is_protected ? '<i class="bi bi-lock-fill text-warning" title="Password protected"></i>' : ''}
            </div>
            <small>${room.participants ? room.participants.length : 0} participants</small>
        `;
        
        const joinButton = document.createElement('button');
        joinButton.className = 'btn btn-sm btn-outline-light';
        joinButton.textContent = 'Join';
        joinButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (room.is_protected) {
                // Prompt for password
                const password = prompt('This room is password protected. Please enter the password:');
                if (password !== null) { // Only if user didn't cancel
                    joinRoom(room.id, password);
                }
            } else {
                joinRoom(room.id);
            }
        });
        
        roomElement.appendChild(roomInfo);
        roomElement.appendChild(joinButton);
        roomsListElement.appendChild(roomElement);
    });
}

// Start a direct chat with another user
function startDirectChat(targetUserId, targetUsername) {
    // If we're already chatting with this user, just focus the input
    if (currentDirectChatUser === targetUserId) {
        document.getElementById('direct-message-input').focus();
        return;
    }
    
    // Update UI
    currentDirectChatUser = targetUserId;
    currentRoom = null;
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('room-chat-container').style.display = 'none';
    document.getElementById('direct-chat-container').style.display = 'flex';
    document.getElementById('direct-chat-title').textContent = `Chat with ${targetUsername}`;
    document.getElementById('direct-messages').innerHTML = '';
    updateUsersListUI(); // Update active state
    
    // Update connection status
    const peerStatusElement = document.getElementById('peer-connection-status');
    peerStatusElement.textContent = 'Connecting...';
    peerStatusElement.className = 'badge bg-warning';
    
    // Create WebRTC connection if it doesn't exist
    if (!peerConnections[targetUserId]) {
        createPeerConnection(targetUserId);
    } else {
        // Connection exists, update status
        updatePeerConnectionStatus(targetUserId);
    }
    
    document.getElementById('direct-message-input').focus();
}

// Join a room
function joinRoom(roomId, password = null) {
    const roomData = { roomId };
    
    if (password) {
        roomData.password = password;
    }
    
    socket.emit('join_room', roomData);
}

// Send a direct message via WebRTC data channel
function sendDirectMessage() {
    const messageInput = document.getElementById('direct-message-input');
    const message = messageInput.value.trim();
    
    if (message && currentDirectChatUser) {
        const dataChannel = dataChannels[currentDirectChatUser];
        
        if (dataChannel && dataChannel.readyState === 'open') {
            // Send via WebRTC
            const messageData = {
                type: 'message',
                from: userId,
                username: username,
                message: message,
                timestamp: new Date().toISOString()
            };
            
            dataChannel.send(JSON.stringify(messageData));
            addDirectMessage(userId, username, message, messageData.timestamp, true);
            messageInput.value = '';
        } else {
            // WebRTC not available, show error
            addDirectSystemMessage('Cannot send message: Peer connection not established');
        }
    }
    
    messageInput.focus();
}

// Send a direct file message via WebRTC data channel
function sendDirectFileMessage(fileInfo) {
    if (!currentDirectChatUser) {
        console.error('No active chat selected');
        addDirectSystemMessage('Cannot send file: No chat selected');
        return;
    }
    
    const dataChannel = dataChannels[currentDirectChatUser];
    
    if (dataChannel && dataChannel.readyState === 'open') {
        // Send via WebRTC
        const messageData = {
            type: 'file',
            from: userId,
            username: username,
            fileInfo: fileInfo,
            timestamp: new Date().toISOString()
        };
        
        try {
            dataChannel.send(JSON.stringify(messageData));
            addDirectFileMessage(userId, username, fileInfo, messageData.timestamp, true);
        } catch (error) {
            console.error('Error sending file message:', error);
            addDirectSystemMessage('Failed to send file');
        }
    } else {
        // WebRTC not available, show error
        addDirectSystemMessage('Cannot send file: Peer connection not established');
    }
}

// Send a room message via Socket.IO
function sendRoomMessage() {
    const messageInput = document.getElementById('room-message-input');
    const message = messageInput.value.trim();
    
    if (message && currentRoom) {
        const timestamp = new Date().toISOString();
        socket.emit('room_message', {
            roomId: currentRoom,
            message: message,
            timestamp: timestamp
        });
        
        // Add to UI immediately (server will broadcast to others)
        addRoomMessage(userId, username, message, timestamp);
        messageInput.value = '';
    }
    
    messageInput.focus();
}

// Send a room file message via Socket.IO
function sendRoomFileMessage(fileInfo) {
    if (!currentRoom) {
        console.error('No active room selected');
        addRoomSystemMessage('Cannot send file: No room selected');
        return;
    }
    
    try {
        const timestamp = new Date().toISOString();
        socket.emit('room_file_message', {
            roomId: currentRoom,
            fileInfo: fileInfo,
            timestamp: timestamp
        });
        
        // Add to UI immediately (server will broadcast to others)
        addRoomFileMessage(userId, username, fileInfo, timestamp);
    } catch (error) {
        console.error('Error sending room file message:', error);
        addRoomSystemMessage('Failed to send file');
    }
}

// Add a direct message to the UI
function addDirectMessage(senderId, senderName, message, timestamp, isSent = false) {
    const messagesContainer = document.getElementById('direct-messages');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isSent ? 'message-sent' : 'message-received'}`;
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = message;
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    
    // Format timestamp
    const date = new Date(timestamp);
    const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageInfo.textContent = isSent ? `You, ${formattedTime}` : `${senderName}, ${formattedTime}`;
    
    messageElement.appendChild(messageText);
    messageElement.appendChild(messageInfo);
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add a direct file message to the UI
function addDirectFileMessage(senderId, senderName, fileInfo, timestamp, isSent = false) {
    const messagesContainer = document.getElementById('direct-messages');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isSent ? 'message-sent' : 'message-received'}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-text file-message';
    
    // Create file icon and info
    const fileIcon = document.createElement('i');
    fileIcon.className = 'fas fa-file me-2';
    
    const fileName = document.createElement('span');
    fileName.textContent = fileInfo.name;
    
    const fileSize = document.createElement('small');
    fileSize.className = 'd-block text-muted';
    fileSize.textContent = formatFileSize(fileInfo.size);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = fileInfo.url;
    downloadLink.className = 'btn btn-sm btn-primary mt-2';
    downloadLink.target = '_blank';
    downloadLink.textContent = 'Download';
    
    // Assemble file message
    messageContent.appendChild(fileIcon);
    messageContent.appendChild(fileName);
    messageContent.appendChild(document.createElement('br'));
    messageContent.appendChild(fileSize);
    messageContent.appendChild(document.createElement('br'));
    messageContent.appendChild(downloadLink);
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    
    // Format timestamp
    const date = new Date(timestamp);
    const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageInfo.textContent = isSent ? `You, ${formattedTime}` : `${senderName}, ${formattedTime}`;
    
    messageElement.appendChild(messageContent);
    messageElement.appendChild(messageInfo);
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add a system message to direct chat
function addDirectSystemMessage(message) {
    const messagesContainer = document.getElementById('direct-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'text-center my-3';
    
    const messageText = document.createElement('span');
    messageText.className = 'badge bg-secondary';
    messageText.textContent = message;
    
    messageElement.appendChild(messageText);
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add a room message to the UI
function addRoomMessage(senderId, senderName, message, timestamp) {
    const messagesContainer = document.getElementById('room-messages');
    const messageElement = document.createElement('div');
    const isSent = senderId === userId;
    messageElement.className = `message ${isSent ? 'message-sent' : 'message-received'}`;
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = message;
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    
    // Format timestamp
    let formattedTime = '';
    if (timestamp) {
        const date = new Date(timestamp);
        formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    messageInfo.textContent = isSent ? `You, ${formattedTime}` : `${senderName}, ${formattedTime}`;
    
    messageElement.appendChild(messageText);
    messageElement.appendChild(messageInfo);
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add a room file message to the UI
function addRoomFileMessage(senderId, senderName, fileInfo, timestamp) {
    const messagesContainer = document.getElementById('room-messages');
    const messageElement = document.createElement('div');
    const isSent = senderId === userId;
    messageElement.className = `message ${isSent ? 'message-sent' : 'message-received'}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-text file-message';
    
    // Create file icon and info
    const fileIcon = document.createElement('i');
    fileIcon.className = 'fas fa-file me-2';
    
    const fileName = document.createElement('span');
    fileName.textContent = fileInfo.name;
    
    const fileSize = document.createElement('small');
    fileSize.className = 'd-block text-muted';
    fileSize.textContent = formatFileSize(fileInfo.size);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = fileInfo.url;
    downloadLink.className = 'btn btn-sm btn-primary mt-2';
    downloadLink.target = '_blank';
    downloadLink.textContent = 'Download';
    
    // Assemble file message
    messageContent.appendChild(fileIcon);
    messageContent.appendChild(fileName);
    messageContent.appendChild(document.createElement('br'));
    messageContent.appendChild(fileSize);
    messageContent.appendChild(document.createElement('br'));
    messageContent.appendChild(downloadLink);
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    
    // Format timestamp
    let formattedTime = '';
    if (timestamp) {
        const date = new Date(timestamp);
        formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    messageInfo.textContent = isSent ? `You, ${formattedTime}` : `${senderName}, ${formattedTime}`;
    
    messageElement.appendChild(messageContent);
    messageElement.appendChild(messageInfo);
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add a system message to room chat
function addRoomSystemMessage(message) {
    const messagesContainer = document.getElementById('room-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'text-center my-3';
    
    const messageText = document.createElement('span');
    messageText.className = 'badge bg-secondary';
    messageText.textContent = message;
    
    messageElement.appendChild(messageText);
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show the welcome screen
function showWelcomeScreen() {
    document.getElementById('welcome-screen').style.display = 'block';
    document.getElementById('direct-chat-container').style.display = 'none';
    document.getElementById('room-chat-container').style.display = 'none';
    currentDirectChatUser = null;
    currentRoom = null;
    updateUsersListUI(); // Clear active state
}

// WebRTC Functions

// Create a new peer connection
function createPeerConnection(targetUserId) {
    console.log(`Creating peer connection to ${targetUserId}`);
    
    // Close existing connection if any
    if (peerConnections[targetUserId]) {
        peerConnections[targetUserId].close();
    }
    
    // Create new connection
    const peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnections[targetUserId] = peerConnection;
    
    // Create data channel
    const dataChannel = peerConnection.createDataChannel('chat', {
        ordered: true
    });
    
    setupDataChannel(targetUserId, dataChannel);
    
    // ICE candidate event
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice_candidate', {
                target: targetUserId,
                candidate: event.candidate
            });
        }
    };
    
    // ICE connection state change
    peerConnection.oniceconnectionstatechange = () => {
        updatePeerConnectionStatus(targetUserId);
    };
    
    // Data channel event
    peerConnection.ondatachannel = (event) => {
        setupDataChannel(targetUserId, event.channel);
    };
    
    // Create and send offer
    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
            socket.emit('offer', {
                target: targetUserId,
                offer: peerConnection.localDescription
            });
        })
        .catch(error => {
            console.error('Error creating offer:', error);
            addDirectSystemMessage('Failed to create connection offer');
        });
    
    return peerConnection;
}

// Set up a data channel
function setupDataChannel(targetUserId, channel) {
    dataChannels[targetUserId] = channel;
    
    channel.onopen = () => {
        console.log(`Data channel to ${targetUserId} opened`);
        updatePeerConnectionStatus(targetUserId);
        addDirectSystemMessage('Peer connection established');
    };
    
    channel.onclose = () => {
        console.log(`Data channel to ${targetUserId} closed`);
        updatePeerConnectionStatus(targetUserId);
        addDirectSystemMessage('Peer connection closed');
    };
    
    channel.onerror = (error) => {
        console.error(`Data channel error with ${targetUserId}:`, error);
        addDirectSystemMessage('Connection error occurred');
    };
    
    channel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'message') {
                console.log(`Received message from ${data.username}:`, data.message);
                addDirectMessage(data.from, data.username, data.message, data.timestamp);
                // Play message notification sound
                if (messageSound && data.from !== userId) {
                    messageSound.play().catch(err => console.error('Error playing sound:', err));
                }
            } else if (data.type === 'file') {
                console.log(`Received file from ${data.username}:`, data.fileInfo);
                addDirectFileMessage(data.from, data.username, data.fileInfo, data.timestamp);
                // Play notification sound
                if (notificationSound && data.from !== userId) {
                    notificationSound.play().catch(err => console.error('Error playing sound:', err));
                }
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
}

// Handle an incoming WebRTC offer
function handleOffer(fromUserId, offer) {
    // Create peer connection if it doesn't exist
    if (!peerConnections[fromUserId]) {
        const peerConnection = new RTCPeerConnection(rtcConfig);
        peerConnections[fromUserId] = peerConnection;
        
        // ICE candidate event
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice_candidate', {
                    target: fromUserId,
                    candidate: event.candidate
                });
            }
        };
        
        // ICE connection state change
        peerConnection.oniceconnectionstatechange = () => {
            updatePeerConnectionStatus(fromUserId);
        };
        
        // Data channel event
        peerConnection.ondatachannel = (event) => {
            setupDataChannel(fromUserId, event.channel);
        };
    }
    
    const peerConnection = peerConnections[fromUserId];
    
    // Set remote description and create answer
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
            socket.emit('answer', {
                target: fromUserId,
                answer: peerConnection.localDescription
            });
        })
        .catch(error => {
            console.error('Error handling offer:', error);
            if (currentDirectChatUser === fromUserId) {
                addDirectSystemMessage('Failed to establish connection');
            }
        });
}

// Handle an incoming WebRTC answer
function handleAnswer(fromUserId, answer) {
    const peerConnection = peerConnections[fromUserId];
    if (peerConnection) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
            .catch(error => {
                console.error('Error handling answer:', error);
                if (currentDirectChatUser === fromUserId) {
                    addDirectSystemMessage('Failed to complete connection setup');
                }
            });
    }
}

// Handle an incoming ICE candidate
function handleIceCandidate(fromUserId, candidate) {
    const peerConnection = peerConnections[fromUserId];
    if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => {
                console.error('Error adding ICE candidate:', error);
            });
    }
}

// Update the peer connection status in the UI
function updatePeerConnectionStatus(targetUserId) {
    if (currentDirectChatUser !== targetUserId) return;
    
    const peerConnection = peerConnections[targetUserId];
    const statusElement = document.getElementById('peer-connection-status');
    
    if (!peerConnection) {
        statusElement.textContent = 'Not Connected';
        statusElement.className = 'badge bg-danger';
        return;
    }
    
    const dataChannel = dataChannels[targetUserId];
    const iceState = peerConnection.iceConnectionState;
    
    switch (iceState) {
        case 'new':
        case 'checking':
            statusElement.textContent = 'Connecting...';
            statusElement.className = 'badge bg-warning';
            break;
        case 'connected':
        case 'completed':
            if (dataChannel && dataChannel.readyState === 'open') {
                statusElement.textContent = 'Connected';
                statusElement.className = 'badge bg-success';
            } else {
                statusElement.textContent = 'Connected (No Data Channel)';
                statusElement.className = 'badge bg-warning';
            }
            break;
        case 'disconnected':
            statusElement.textContent = 'Disconnected';
            statusElement.className = 'badge bg-warning';
            break;
        case 'failed':
            statusElement.textContent = 'Connection Failed';
            statusElement.className = 'badge bg-danger';
            break;
        case 'closed':
            statusElement.textContent = 'Connection Closed';
            statusElement.className = 'badge bg-secondary';
            break;
        default:
            statusElement.textContent = iceState;
            statusElement.className = 'badge bg-secondary';
    }
}

// Setup file upload listeners
function setupFileUploadListeners() {
    // Direct chat file upload
    const directFileInput = document.getElementById('direct-file-input');
    const directFileButton = document.getElementById('direct-file-button');
    const directProgressBar = document.getElementById('direct-upload-progress-bar');
    
    let directSelectedFile = null;
    
    // Show file input when button is clicked
    directFileButton.addEventListener('click', () => {
        directFileInput.click();
        document.getElementById('direct-file-container').style.display = 'block';
    });
    
    // Handle file selection
    directFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            if (file.size > MAX_FILE_SIZE) {
                alert('File size exceeds the maximum limit of 1GB');
                directFileInput.value = '';
                return;
            }
            
            directSelectedFile = file;
            
            // Automatically upload the file when selected
            if (directSelectedFile && currentDirectChatUser) {
                uploadFile(directSelectedFile, (fileUrl) => {
                    // Send file message via WebRTC
                    const dataChannel = dataChannels[currentDirectChatUser];
                    
                    if (dataChannel && dataChannel.readyState === 'open') {
                        const fileInfo = {
                            name: directSelectedFile.name,
                            size: directSelectedFile.size,
                            type: directSelectedFile.type,
                            url: fileUrl
                        };
                        
                        const messageData = {
                            type: 'file',
                            from: userId,
                            username: username,
                            fileInfo: fileInfo,
                            timestamp: new Date().toISOString()
                        };
                        
                        dataChannel.send(JSON.stringify(messageData));
                        addDirectFileMessage(userId, username, fileInfo, messageData.timestamp, true);
                        
                        // Reset file input
                        directSelectedFile = null;
                        directFileInput.value = '';
                        document.getElementById('direct-file-container').style.display = 'none';
                        directProgressBar.style.width = '0%';
                        directProgressBar.parentElement.style.display = 'none';
                    } else {
                        // WebRTC not available, show error
                        addDirectSystemMessage('Cannot send file: Peer connection not established');
                    }
                });
            }
        }
    });
    
    // Room chat file upload
    const roomFileInput = document.getElementById('room-file-input');
    const roomFileButton = document.getElementById('room-file-button');
    const roomProgressBar = document.getElementById('room-upload-progress-bar');
    
    let roomSelectedFile = null;
    
    // Show file input when button is clicked
    roomFileButton.addEventListener('click', () => {
        roomFileInput.click();
        document.getElementById('room-file-container').style.display = 'block';
    });
    
    // Handle file selection
    roomFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            if (file.size > MAX_FILE_SIZE) {
                alert('File size exceeds the maximum limit of 1GB');
                roomFileInput.value = '';
                return;
            }
            
            roomSelectedFile = file;
            
            // Automatically upload the file when selected
            if (roomSelectedFile && currentRoom) {
                uploadFile(roomSelectedFile, (fileUrl) => {
                    // Send file message via Socket.IO
                    const fileInfo = {
                        name: roomSelectedFile.name,
                        size: roomSelectedFile.size,
                        type: roomSelectedFile.type,
                        url: fileUrl
                    };
                    
                    const timestamp = new Date().toISOString();
                    socket.emit('room_file_message', {
                        roomId: currentRoom,
                        fileInfo: fileInfo,
                        timestamp: timestamp
                    });
                    
                    // Add to UI immediately (server will broadcast to others)
                    addRoomFileMessage(userId, username, fileInfo, timestamp);
                    
                    // Reset file input
                    roomSelectedFile = null;
                    roomFileInput.value = '';
                    document.getElementById('room-file-container').style.display = 'none';
                    roomProgressBar.style.width = '0%';
                    roomProgressBar.parentElement.style.display = 'none';
                });
            }
        }
    });
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Upload file to server
function uploadFile(file, callback) {
    const formData = new FormData();
    formData.append('file', file);
    
    const xhr = new XMLHttpRequest();
    
    // Update progress bar
    const progressBar = currentRoom ? 
        document.getElementById('room-upload-progress-bar') : 
        document.getElementById('direct-upload-progress-bar');
    
    const progressContainer = progressBar.parentElement;
    progressContainer.style.display = 'block';
    
    xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            progressBar.style.width = percentComplete + '%';
        }
    });
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            if (response.success && response.url) {
                callback(response.url);
            } else {
                alert('File upload failed: ' + (response.error || 'Unknown error'));
            }
        } else {
            alert('File upload failed: ' + xhr.statusText);
        }
    };
    
    xhr.onerror = function() {
        alert('File upload failed: Network error');
    };
    
    xhr.open('POST', '/upload', true);
    xhr.send(formData);
}