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
    const userId = me.$id;

    const ensureDoc = async () => {
      const payload = {
        userId,
        name: (me as any).name || 'User',
        avatarUrl: (me as any).prefs?.avatarUrl || '',
        status: 'online',
        lastSeen: new Date().toISOString()
      };
      try {
        try {
          // Try update (assuming doc id == userId)
          await this.databases.updateDocument(
            environment.appwriteDatabaseId,
            environment.appwritePresenceCollectionId,
            userId,
            payload
          );
        } catch {
          // Create if not exists
          await this.databases.createDocument(
            environment.appwriteDatabaseId,
            environment.appwritePresenceCollectionId,
            userId,
            payload
          );
        }
      } catch (e) {
        // Swallow errors (e.g., 404 when collection not created yet)
        // Optional: console.debug('Presence upsert skipped:', e);
      }
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
      await this.databases.updateDocument(
        environment.appwriteDatabaseId,
        environment.appwritePresenceCollectionId,
        me.$id,
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
}
