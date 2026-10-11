import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Student from '../models/studentAuth.js';
import HostelAdmin from '../models/hostelAdmin.js';
import ChatMessage from '../models/chatMessage.js';

const HISTORY_LIMIT = 100;
const MAX_TEXT_LENGTH = 1000;

// Stored tokens look like "Bearer <jwt>"; accept either form.
const verify = (token, secret) => {
    try {
        return jwt.verify(String(token).replace(/^Bearer\s+/i, ''), secret);
    } catch (err) {
        console.warn(`[socket] token rejected: ${err.message}`);
        return null;
    }
};

// The client says which role it is logging in as; the token must verify against that role's secret.
const authenticate = (token, role) => {
    if (role === 'student') {
        const decoded = verify(token, process.env.USER_SECRET_KEY);
        return decoded && { id: decoded.id, name: decoded.name || decoded.fullName, role: 'student' };
    }
    if (role === 'hostelAdmin') {
        const decoded = verify(token, process.env.JWT_SECRET);
        return decoded && { id: decoded.id, name: decoded.fullName, role: 'hostelAdmin' };
    }
    return null;
};

// Returns true if the user may chat in this hostel's room.
const canAccessHostel = async (user, hostelId) => {
    if (!hostelId) return false;
    if (user.role === 'student') {
        const student = await Student.findById(user.id).select('hostelId isBlocked role');
        return Boolean(
            student && !student.isBlocked && student.role === 'resident' && String(student.hostelId) === String(hostelId)
        );
    }
    const admin = await HostelAdmin.findById(user.id).select('hosteldata isBlocked');
    return Boolean(
        admin && !admin.isBlocked && admin.hosteldata.some((h) => String(h.hostelId) === String(hostelId))
    );
};

const roomOf = (hostelId) => `hostel:${hostelId}`;

const toClient = (m) => ({
    _id: m._id,
    hostelId: m.hostelId,
    senderId: m.senderId,
    senderRole: m.senderRole,
    senderName: m.senderName,
    text: m.text,
    createdAt: m.createdAt,
});

export default function initSocket(httpServer, corsOrigins) {
    const io = new Server(httpServer, {
        cors: { origin: corsOrigins, credentials: true },
    });

    io.use((socket, next) => {
        const { token, role } = socket.handshake.auth || {};
        if (!token) {
            console.warn(`[socket] rejected: no token sent (role=${role})`);
            return next(new Error('No token - please log in again'));
        }
        const user = authenticate(token, role);
        if (!user) return next(new Error('Invalid or expired token - please log in again'));
        socket.data.user = user;
        next();
    });

    io.on('connection', (socket) => {
        const { user } = socket.data;

        socket.on('chat:join', async ({ hostelId: requestedId } = {}, ack = () => {}) => {
            try {
                // Students always join their own hostel's room; only wardens choose which hostel to open.
                let hostelId = requestedId;
                if (user.role === 'student') {
                    const student = await Student.findById(user.id).select('hostelId');
                    hostelId = student?.hostelId;
                }
                if (!(await canAccessHostel(user, hostelId))) return ack({ ok: false, error: 'Not allowed in this chat' });

                [...socket.rooms].filter((r) => r.startsWith('hostel:')).forEach((r) => socket.leave(r));
                socket.join(roomOf(hostelId));
                socket.data.hostelId = String(hostelId);

                const history = await ChatMessage.find({ hostelId }).sort({ createdAt: -1 }).limit(HISTORY_LIMIT);
                ack({ ok: true, selfId: user.id, messages: history.reverse().map(toClient) });
            } catch (err) {
                console.error('chat:join failed', err);
                ack({ ok: false, error: 'Could not join chat' });
            }
        });

        socket.on('chat:send', async ({ text } = {}, ack = () => {}) => {
            try {
                const hostelId = socket.data.hostelId;
                const trimmed = typeof text === 'string' ? text.trim() : '';
                if (!hostelId) return ack({ ok: false, error: 'Join a chat first' });
                if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return ack({ ok: false, error: 'Invalid message' });
                // Re-check on every send so blocked/removed users can't keep talking on an old connection.
                if (!(await canAccessHostel(user, hostelId))) return ack({ ok: false, error: 'Not allowed in this chat' });

                const message = await ChatMessage.create({
                    hostelId,
                    senderId: user.id,
                    senderRole: user.role,
                    senderName: user.name || (user.role === 'hostelAdmin' ? 'Warden' : 'Student'),
                    text: trimmed,
                });
                const payload = toClient(message);
                io.to(roomOf(hostelId)).emit('chat:message', payload);
                ack({ ok: true });
            } catch (err) {
                console.error('chat:send failed', err);
                ack({ ok: false, error: 'Could not send message' });
            }
        });
    });

    return io;
}
