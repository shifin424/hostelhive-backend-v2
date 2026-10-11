import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
    {
        hostelId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HostelInfo',
            required: true,
            index: true,
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        senderRole: {
            type: String,
            enum: ['student', 'hostelAdmin'],
            required: true,
        },
        senderName: {
            type: String,
            required: true,
        },
        text: {
            type: String,
            required: true,
            maxlength: 1000,
        },
    },
    { timestamps: true }
);

chatMessageSchema.index({ hostelId: 1, createdAt: -1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;
