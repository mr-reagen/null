import uuid
import os
from flask import Flask, render_template, request, session, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.utils import secure_filename
import base64
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', os.urandom(24).hex())
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_CONTENT_LENGTH', 1024 * 1024 * 1024))  # Default: 1GB
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Create upload directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Store active users and their rooms
users = {}
rooms = {}

# Health check endpoint for Docker/monitoring
@app.route('/health')
def health_check():
    return jsonify({'status': 'ok'})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/join/<room_id>')
def join_room_by_link(room_id):
    # Check if room exists
    if room_id in rooms:
        # Pass the room ID and password protection status to the template
        is_protected = rooms[room_id]['is_protected']
        return render_template('index.html', room_id=room_id, is_protected=is_protected)
    else:
        return render_template('index.html', error="Room not found")

@socketio.on('connect')
def handle_connect():
    user_id = str(uuid.uuid4())
    users[request.sid] = {
        'id': user_id,
        'username': f'User-{user_id[:6]}',
        'rooms': []
    }
    emit('connected', {'userId': user_id, 'username': users[request.sid]['username']})
    emit('user_list', {'users': [{'id': u['id'], 'username': u['username']} for u in users.values()]})
    emit('user_connected', {'userId': user_id, 'username': users[request.sid]['username']}, broadcast=True, include_self=False)

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in users:
        user = users[request.sid]
        # Leave all rooms
        for room_id in user['rooms']:
            if room_id in rooms and request.sid in rooms[room_id]['participants']:
                rooms[room_id]['participants'].remove(request.sid)
                # If room is empty, delete it
                if not rooms[room_id]['participants']:
                    del rooms[room_id]
        
        # Notify others about disconnection
        emit('user_disconnected', {'userId': user['id']}, broadcast=True)
        del users[request.sid]

@socketio.on('update_username')
def handle_update_username(data):
    if request.sid in users and 'username' in data:
        users[request.sid]['username'] = data['username']
        emit('username_updated', {
            'userId': users[request.sid]['id'],
            'username': data['username']
        }, broadcast=True)

@socketio.on('get_users')
def handle_get_users():
    emit('user_list', {'users': [{'id': u['id'], 'username': u['username']} for u in users.values()]})

# WebRTC Signaling
@socketio.on('offer')
def handle_offer(data):
    if 'target' in data and 'offer' in data:
        target_sid = None
        for sid, user in users.items():
            if user['id'] == data['target']:
                target_sid = sid
                break
        
        if target_sid:
            emit('offer', {
                'offer': data['offer'],
                'from': users[request.sid]['id']
            }, room=target_sid)

@socketio.on('answer')
def handle_answer(data):
    if 'target' in data and 'answer' in data:
        target_sid = None
        for sid, user in users.items():
            if user['id'] == data['target']:
                target_sid = sid
                break
        
        if target_sid:
            emit('answer', {
                'answer': data['answer'],
                'from': users[request.sid]['id']
            }, room=target_sid)

@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    if 'target' in data and 'candidate' in data:
        target_sid = None
        for sid, user in users.items():
            if user['id'] == data['target']:
                target_sid = sid
                break
        
        if target_sid:
            emit('ice_candidate', {
                'candidate': data['candidate'],
                'from': users[request.sid]['id']
            }, room=target_sid)

# Create or join room for group messaging
@socketio.on('create_room')
def handle_create_room(data):
    room_id = str(uuid.uuid4())
    room_name = data.get('name', f'Room-{room_id[:6]}')
    room_password = data.get('password', '')
    
    rooms[room_id] = {
        'id': room_id,
        'name': room_name,
        'creator': request.sid,
        'participants': [request.sid],
        'password': room_password,
        'is_protected': bool(room_password),
        'admins': [request.sid]  # Add creator as admin
    }
    
    users[request.sid]['rooms'].append(room_id)
    join_room(room_id)
    
    emit('room_created', {
        'roomId': room_id,
        'name': room_name,
        'participants': [users[request.sid]['id']],
        'is_protected': rooms[room_id]['is_protected'],
        'isAdmin': True,
        'creator': users[request.sid]['id']
    })
    
    # Broadcast to all users that a new room is available
    emit('room_available', {
        'roomId': room_id,
        'name': room_name,
        'creator': users[request.sid]['id'],
        'is_protected': rooms[room_id]['is_protected'],
        'joinLink': f'/join/{room_id}'
    }, broadcast=True, include_self=False)

@socketio.on('join_room')
def handle_join_room(data):
    if 'roomId' in data and data['roomId'] in rooms:
        room_id = data['roomId']
        
        # Check if room is password protected
        if rooms[room_id]['is_protected']:
            # If no password provided or password is incorrect
            if 'password' not in data or data['password'] != rooms[room_id]['password']:
                emit('room_join_error', {
                    'roomId': room_id,
                    'message': 'Incorrect password'
                })
                return
        
        join_room(room_id)
        
        if request.sid not in rooms[room_id]['participants']:
            rooms[room_id]['participants'].append(request.sid)
            users[request.sid]['rooms'].append(room_id)
        
        # Notify everyone in the room that a new user joined
        emit('user_joined_room', {
            'roomId': room_id,
            'userId': users[request.sid]['id'],
            'username': users[request.sid]['username']
        }, room=room_id)
        
        # Send room info to the user who joined
        participant_ids = [users[sid]['id'] for sid in rooms[room_id]['participants']]
        is_admin = request.sid in rooms[room_id]['admins']
        creator_id = users[rooms[room_id]['creator']]['id'] if rooms[room_id]['creator'] in users else None
        
        emit('room_joined', {
            'roomId': room_id,
            'name': rooms[room_id]['name'],
            'participants': participant_ids,
            'is_protected': rooms[room_id]['is_protected'],
            'isAdmin': is_admin,
            'creator': creator_id,
            'joinLink': f'/join/{room_id}'
        })

@socketio.on('leave_room')
def handle_leave_room(data):
    if 'roomId' in data and data['roomId'] in rooms:
        room_id = data['roomId']
        
        if request.sid in rooms[room_id]['participants']:
            rooms[room_id]['participants'].remove(request.sid)
            users[request.sid]['rooms'].remove(room_id)
            
            # If room is empty, delete it
            if not rooms[room_id]['participants']:
                del rooms[room_id]
            else:
                # Notify everyone in the room that a user left
                emit('user_left_room', {
                    'roomId': room_id,
                    'userId': users[request.sid]['id']
                }, room=room_id)
            
            leave_room(room_id)
            emit('room_left', {'roomId': room_id})

@socketio.on('room_message')
def handle_room_message(data):
    if 'roomId' in data and 'message' in data and data['roomId'] in rooms:
        room_id = data['roomId']
        
        if request.sid in rooms[room_id]['participants']:
            emit('room_message', {
                'roomId': room_id,
                'from': users[request.sid]['id'],
                'username': users[request.sid]['username'],
                'message': data['message'],
                'timestamp': data.get('timestamp', None)
            }, room=room_id)

# File handling routes and events
@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    filename = secure_filename(file.filename)
    # Add unique identifier to prevent filename collisions
    unique_filename = f"{uuid.uuid4()}_{filename}"
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
    
    try:
        file.save(file_path)
        file_url = f"/static/uploads/{unique_filename}"
        return jsonify({
            'success': True,
            'filename': filename,
            'url': file_url
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@socketio.on('file_message')
def handle_file_message(data):
    if 'target' in data and 'fileInfo' in data:
        target_sid = None
        for sid, user in users.items():
            if user['id'] == data['target']:
                target_sid = sid
                break
        
        if target_sid:
            emit('file_message', {
                'from': users[request.sid]['id'],
                'username': users[request.sid]['username'],
                'fileInfo': data['fileInfo'],
                'timestamp': data.get('timestamp', None)
            }, room=target_sid)

@socketio.on('room_file_message')
def handle_room_file_message(data):
    if 'roomId' in data and 'fileInfo' in data and data['roomId'] in rooms:
        room_id = data['roomId']
        
        if request.sid in rooms[room_id]['participants']:
            emit('room_file_message', {
                'roomId': room_id,
                'from': users[request.sid]['id'],
                'username': users[request.sid]['username'],
                'fileInfo': data['fileInfo'],
                'timestamp': data.get('timestamp', None)
            }, room=room_id)

if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', 3000))
    
    socketio.run(app, debug=debug_mode, host=host, port=port)