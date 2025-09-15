import { Injectable } from '@angular/core';
import { Client, Account, ID, Databases, Query, Storage, Permission, Role } from 'appwrite';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AppwriteService {
  client: Client;
  account: Account;
  databases: Databases;
  storage: Storage;
  // Keep reference to active realtime subscriptions if needed later
  private activeUnsubscribes: Array<() => void> = [];

  constructor() {
    this.client = new Client();
    this.client
      .setEndpoint(environment.appwriteEndpoint || 'https://cloud.appwrite.io/v1')
      .setProject(environment.appwriteProjectId || '');

    this.account = new Account(this.client);
    this.databases = new Databases(this.client);
    this.storage = new Storage(this.client);
  }

  async createMagicLink(email: string, redirectUrl: string) {
    return await this.account.createMagicURLToken(ID.unique(), email, redirectUrl);
  }

  async createSession(userId: string, secret: string) {
    return await this.account.createSession(userId, secret);
  }

  async getUser() {
    return await this.account.get();
  }

  async logout() {
    return await this.account.deleteSession('current');
  }

  async ensureUserName(name: string) {
    const me = await this.account.get();
    if ((me as any).name === name) return me;
    await this.account.updateName(name);
    return await this.account.get();
  }

  async ensureUserNameAndId(name: string, userId: string) {
    const me = await this.account.get();
    const currentPrefs = (me as any).prefs || {};
    
    // Check if userId is already taken by another user
    const existingUser = await this.findUserByCustomId(userId);
    if (existingUser) {
      throw new Error('User ID is already taken. Please choose a different one.');
    }
    
    const updatedPrefs = { ...currentPrefs, userId };
    
    // Update both name and prefs
    await this.account.updateName(name);
    await this.account.updatePrefs(updatedPrefs);
    
    // Immediately upsert presence with the new custom userId so downstream queries work
    try {
      await this.upsertPresenceDocument({
        appwriteUserId: me.$id,
        userId,
        name,
        avatarUrl: (currentPrefs as any)?.avatarUrl || ''
      });
    } catch {}

    return await this.account.get();
  }

  async findUserByCustomId(userId: string) {
    if (!environment.appwritePresenceCollectionId) return null;
    try {
      // Prefer direct get by document id == userId for uniqueness
      const doc = await (this.databases as any).getDocument(
        environment.appwriteDatabaseId,
        environment.appwritePresenceCollectionId,
        userId
      );
      return doc || null;
    } catch {
      // fallback to query by field if doc id lookup fails
      try {
        const result = await this.databases.listDocuments(
          environment.appwriteDatabaseId,
          environment.appwritePresenceCollectionId,
          [Query.equal('userId', userId)]
        );
        return result.documents[0] || null;
      } catch (e) {
        console.error('Failed to find user by custom ID', e);
        return null;
      }
    }
  }

  private async upsertPresenceDocument(payload: { appwriteUserId: string; userId: string; name: string; avatarUrl?: string }) {
    if (!environment.appwritePresenceCollectionId) return;
    const body = {
      userId: payload.userId,
      name: payload.name || 'User',
      avatarUrl: payload.avatarUrl || '',
      status: 'online',
      lastSeen: new Date().toISOString()
    } as any;
    try {
      // Check existence first to avoid update-only 404
      let exists = false;
      try {
        await (this.databases as any).getDocument(
          environment.appwriteDatabaseId,
          environment.appwritePresenceCollectionId,
          payload.userId
        );
        exists = true;
      } catch {}

      if (exists) {
        await this.databases.updateDocument(
          environment.appwriteDatabaseId,
          environment.appwritePresenceCollectionId,
          payload.userId,
          body
        );
      } else {
        await this.databases.createDocument(
          environment.appwriteDatabaseId,
          environment.appwritePresenceCollectionId,
          payload.userId,
          body,
          [
            Permission.read(Role.any()),
            Permission.update(Role.user(payload.appwriteUserId)),
            Permission.delete(Role.user(payload.appwriteUserId))
          ]
        );
      }
    } catch {}
  }

  async createTextMessage(params: {
    chatId: string;
    senderId: string;
    text: string;
    sentAt: string; // ISO string or formatted time
  }) {
    const me = await this.account.get();
    console.log(me);
    const { chatId, senderId, text, sentAt } = params;
    return await this.databases.createDocument(
      environment.appwriteDatabaseId,
      environment.appwriteMessagesCollectionId,
      ID.unique(),
      {
        chatId,
        senderId,
        type: 'text',
        text,
        sentAt
      }
    );
  }

  async uploadAudioAndCreateMessage(params: {
    chatId: string;
    senderId: string;
    audioBlob: Blob;
    sentAt: string;
  }) {
    const { chatId, senderId, audioBlob, sentAt } = params;
    // Ensure we upload a File (Appwrite SDK expects File in browser environments)
    const fileToUpload: File = (audioBlob as any).name
      ? (audioBlob as unknown as File)
      : new File([audioBlob], `voice-${Date.now()}.webm`, { type: audioBlob.type || 'audio/webm' });
    const file = await this.storage.createFile(
      environment.appwriteBucketId,
      ID.unique(),
      fileToUpload,
      [
        // Make the audio accessible for playback. Change to Role.users() if you prefer auth-only.
        Permission.read(Role.any())
      ]
    );
    const previewUrl = this.storage.getFileView(environment.appwriteBucketId, file.$id).toString();
    const doc = await this.databases.createDocument(
      environment.appwriteDatabaseId,
      environment.appwriteMessagesCollectionId,
      ID.unique(),
      {
        chatId,
        senderId,
        type: 'audio',
        text: '',
        url: previewUrl,
        sentAt
      }
    );
    return { file, doc, url: previewUrl };
  }

  async listMessages(chatIdA: string, chatIdB?: string, limit: number = 50) {
    // chatId represents the recipient's userId; we now store senderId as sender's userId
    const chatIds = chatIdB ? [chatIdA, chatIdB] : [chatIdA];
    const result = await this.databases.listDocuments(
      environment.appwriteDatabaseId,
      environment.appwriteMessagesCollectionId,
      [
        Query.equal('chatId', chatIds),
        Query.orderAsc('sentAt'),
        Query.limit(limit)
      ]
    );
    return result.documents;
  }

  async listAllMessages(userId: string, limit: number = 1000) {
    const result = await this.databases.listDocuments(
      environment.appwriteDatabaseId,
      environment.appwriteMessagesCollectionId,
      [
        Query.or([
          Query.equal('chatId', userId),
          Query.equal('senderId', userId)
        ]),
        Query.orderDesc('sentAt'),
        Query.limit(limit)
      ]
    );
    return result.documents;
  }

  /**
   * Delete all messages in a conversation between two custom userIds.
   * This clears the chat for both users since messages are shared.
   */
  async deleteConversation(userIdA: string, userIdB: string) {
    const result = await this.databases.listDocuments(
      environment.appwriteDatabaseId,
      environment.appwriteMessagesCollectionId,
      [
        Query.or([
          Query.and([Query.equal('chatId', userIdA), Query.equal('senderId', userIdB)]),
          Query.and([Query.equal('chatId', userIdB), Query.equal('senderId', userIdA)])
        ]),
        Query.limit(1000)
      ]
    );
    const docs = result.documents || [];
    for (const doc of docs) {
      try {
        await this.databases.deleteDocument(
          environment.appwriteDatabaseId,
          environment.appwriteMessagesCollectionId,
          doc.$id
        );
      } catch (e) {
        console.error('Failed to delete message', doc.$id, e);
      }
    }
    return docs.length;
  }

  /**
   * Subscribe to realtime changes for the messages collection and invoke handler
   * when a message for the provided chatId is created.
   * Returns a function to unsubscribe.
   */
  subscribeToConversation(userIdA: string, userIdB: string, handler: (doc: any) => void): () => void {
    const channel = `databases.${environment.appwriteDatabaseId}.collections.${environment.appwriteMessagesCollectionId}.documents`;
    const unsubscribe = this.client.subscribe(channel, (event: any) => {
      const isCreate = Array.isArray(event.events)
        ? event.events.some((e: string) => e.endsWith('.create'))
        : false;
      const document = event?.payload;
      if (!document || !isCreate) return;
      const chatMatch = document.chatId === userIdA || document.chatId === userIdB;
      const senderMatch = document.senderId === userIdA || document.senderId === userIdB;
      if (chatMatch && senderMatch) {
        handler(document);
      }
    });

    // Track to optionally clear later
    this.activeUnsubscribes.push(unsubscribe);
    return () => {
      try { unsubscribe(); } catch {}
    };
  }

  /** Presence: create/update my presence document and send heartbeats. */
  async startPresenceHeartbeat(intervalMs: number = 20000): Promise<() => void> {
    if (!environment.appwritePresenceCollectionId) {
      return () => {};
    }
    const me = await this.account.get();
    const appwriteUserId = me.$id;
    const customUserId = (me as any).prefs?.userId;

    if (!customUserId) {
      console.warn('Custom userId not found. Presence heartbeat skipped.');
      return () => {};
    }

    const ensureDoc = async () => {
      await this.upsertPresenceDocument({
        appwriteUserId,
        userId: customUserId,
        name: (me as any).name || 'User',
        avatarUrl: (me as any).prefs?.avatarUrl || ''
      });
    };

    try { await ensureDoc(); } catch {}
    const timer = setInterval(() => { try { ensureDoc(); } catch {} }, intervalMs);
    const stop = () => { try { clearInterval(timer); } catch {} };
    this.activeUnsubscribes.push(stop);
    return stop;
  }

  async setOffline() {
    if (!environment.appwritePresenceCollectionId) return;
    try {
      const me = await this.account.get();
      const customUserId = (me as any).prefs?.userId;
      
      if (!customUserId) return;
      
      await this.databases.updateDocument(
        environment.appwriteDatabaseId,
        environment.appwritePresenceCollectionId,
        customUserId,
        { status: 'offline', lastSeen: new Date().toISOString() }
      );
    } catch {}
  }

  async listOnlineUsers(windowSeconds: number = 60) {
    if (!environment.appwritePresenceCollectionId) return [] as any[];
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const res = await this.databases.listDocuments(
      environment.appwriteDatabaseId,
      environment.appwritePresenceCollectionId,
      [
        Query.equal('status', ['online']),
        Query.greaterThan('lastSeen', since)
      ]
    );
    return res.documents;
  }

  subscribeToPresence(handler: (doc: any, events: string[]) => void): () => void {
    if (!environment.appwritePresenceCollectionId) {
      return () => {};
    }
    const channel = `databases.${environment.appwriteDatabaseId}.collections.${environment.appwritePresenceCollectionId}.documents`;
    const unsubscribe = this.client.subscribe(channel, (event: any) => {
      handler(event?.payload, event?.events || []);
    });
    this.activeUnsubscribes.push(unsubscribe);
    return () => { try { unsubscribe(); } catch {} };
  }

  /**
   * Global messages subscription: notify on any new message created.
   */
  subscribeToAllMessages(handler: (doc: any) => void): () => void {
    const channel = `databases.${environment.appwriteDatabaseId}.collections.${environment.appwriteMessagesCollectionId}.documents`;
    const unsubscribe = this.client.subscribe(channel, (event: any) => {
      const isCreate = Array.isArray(event.events)
        ? event.events.some((e: string) => e.endsWith('.create'))
        : false;
      const document = event?.payload;
      if (!document || !isCreate) return;
      handler(document);
    });
    this.activeUnsubscribes.push(unsubscribe);
    return () => { try { unsubscribe(); } catch {} };
  }
  // Friend System Methods
  async sendFriendRequest(addresseeUserId: string) {
    if (!environment.appwriteFriendsCollectionId) {
      throw new Error('Friends collection not configured');
    }
    
    const me = await this.account.get();
    const myUserId = (me as any).prefs?.userId;
    
    if (!myUserId) {
      throw new Error('User ID not found. Please complete your profile first.');
    }
    
    if (addresseeUserId === myUserId) {
      throw new Error('You cannot send a friend request to yourself');
    }

    // Validate target exists in presence/users
    const target = await this.findUserByCustomId(addresseeUserId);
    if (!target) {
      throw new Error('No user found with that User ID');
    }

    // Check if friendship already exists
    const existingFriendship = await this.getFriendship(myUserId, addresseeUserId);
    if (existingFriendship) {
      throw new Error('Friendship request already exists or users are already friends');
    }
    
    return await this.databases.createDocument(
      environment.appwriteDatabaseId,
      environment.appwriteFriendsCollectionId,
      ID.unique(),
      {
        requesterId: myUserId,
        addresseeId: addresseeUserId,
        status: 'pending',
        requestedAt: new Date().toISOString()
      }
    );
  }

  async acceptFriendRequest(friendshipId: string) {
    if (!environment.appwriteFriendsCollectionId) {
      throw new Error('Friends collection not configured');
    }
    
    return await this.databases.updateDocument(
      environment.appwriteDatabaseId,
      environment.appwriteFriendsCollectionId,
      friendshipId,
      {
        status: 'accepted',
        acceptedAt: new Date().toISOString()
      }
    );
  }

  async declineFriendRequest(friendshipId: string) {
    if (!environment.appwriteFriendsCollectionId) {
      throw new Error('Friends collection not configured');
    }
    
    return await this.databases.updateDocument(
      environment.appwriteDatabaseId,
      environment.appwriteFriendsCollectionId,
      friendshipId,
      {
        status: 'declined'
      }
    );
  }

  async getFriendship(requesterId: string, addresseeId: string) {
    if (!environment.appwriteFriendsCollectionId) return null;
    
    try {
      const result = await this.databases.listDocuments(
        environment.appwriteDatabaseId,
        environment.appwriteFriendsCollectionId,
        [
          Query.or([
            Query.and([
              Query.equal('requesterId', requesterId),
              Query.equal('addresseeId', addresseeId)
            ]),
            Query.and([
              Query.equal('requesterId', addresseeId),
              Query.equal('addresseeId', requesterId)
            ])
          ])
        ]
      );
      return result.documents[0] || null;
    } catch (e) {
      console.error('Failed to get friendship', e);
      return null;
    }
  }

  async getFriends(userId: string) {
    if (!environment.appwriteFriendsCollectionId) return [];
    
    try {
      const result = await this.databases.listDocuments(
        environment.appwriteDatabaseId,
        environment.appwriteFriendsCollectionId,
        [
          Query.or([
            Query.and([
              Query.equal('requesterId', userId),
              Query.equal('status', 'accepted')
            ]),
            Query.and([
              Query.equal('addresseeId', userId),
              Query.equal('status', 'accepted')
            ])
          ])
        ]
      );
      
      // Extract friend user IDs
      const friendUserIds = result.documents.map((doc: any) => 
        doc.requesterId === userId ? doc.addresseeId : doc.requesterId
      );
      
      return friendUserIds;
    } catch (e) {
      console.error('Failed to get friends', e);
      return [];
    }
  }

  async getPendingFriendRequests(userId: string) {
    if (!environment.appwriteFriendsCollectionId) return [];
    
    try {
      const result = await this.databases.listDocuments(
        environment.appwriteDatabaseId,
        environment.appwriteFriendsCollectionId,
        [
          Query.and([
            Query.equal('addresseeId', userId),
            Query.equal('status', 'pending')
          ])
        ]
      );
      
      return result.documents;
    } catch (e) {
      console.error('Failed to get pending friend requests', e);
      return [];
    }
  }

  async removeFriend(friendshipId: string) {
    if (!environment.appwriteFriendsCollectionId) {
      throw new Error('Friends collection not configured');
    }
    
    return await this.databases.deleteDocument(
      environment.appwriteDatabaseId,
      environment.appwriteFriendsCollectionId,
      friendshipId
    );
  }
}
