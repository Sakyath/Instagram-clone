export interface User {
    id: string;
    username: string;
    email: string;
    password: string;
    fullName: string | null;
    avatar: string | null;
    bio: string;
    isVerified: boolean;
    isPrivate: boolean;
    followersCount: number;
    followingCount: number;
    postsCount: number;
    createdAt: string;
    updatedAt: string;
}
export interface SafeUser {
    id: string;
    username: string;
    email: string;
    fullName: string | null;
    avatar: string | null;
    bio: string;
    isVerified: boolean;
    isPrivate: boolean;
    followersCount: number;
    followingCount: number;
    postsCount: number;
    createdAt: string;
}
export interface Post {
    id: string;
    userId: string;
    caption: string;
    location: string | null;
    createdAt: string;
    updatedAt: string;
    likesCount: number;
    commentsCount: number;
    user?: SafeUser;
    images?: PostImage[];
    isLiked?: boolean;
    isSaved?: boolean;
}
export interface PostImage {
    id: string;
    postId: string;
    imageUrl: string;
    orderIndex: number;
}
export interface Comment {
    id: string;
    userId: string;
    postId: string;
    text: string;
    likesCount: number;
    createdAt: string;
    user?: SafeUser;
}
export interface Like {
    id: string;
    userId: string;
    postId: string;
    createdAt: string;
}
export interface Follow {
    id: string;
    followerId: string;
    followingId: string;
    createdAt: string;
}
export interface Story {
    id: string;
    userId: string;
    imageUrl: string;
    createdAt: string;
    expiresAt: string;
    user?: SafeUser;
    isViewed?: boolean;
}
export interface Conversation {
    id: string;
    createdAt: string;
    updatedAt: string;
    participants?: SafeUser[];
    lastMessage?: Message;
    unreadCount?: number;
}
export interface Message {
    id: string;
    conversationId: string;
    senderId: string;
    text: string;
    imageUrl: string | null;
    isRead: boolean;
    createdAt: string;
    sender?: SafeUser;
}
export interface Notification {
    id: string;
    userId: string;
    type: 'like' | 'comment' | 'follow' | 'mention';
    actorId: string;
    postId: string | null;
    commentId: string | null;
    isRead: boolean;
    createdAt: string;
    actor?: SafeUser;
    post?: Post;
}
export interface JwtPayload {
    userId: string;
    username: string;
}
//# sourceMappingURL=index.d.ts.map