import {ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import Swal from 'sweetalert2';
import {AudioPlayerComponent} from '../audio-player/audio-player.component';
import {FormsModule} from '@angular/forms';
import {NgClass} from '@angular/common';
import { MessageInterface, UserInterface } from '../interfaces';
import {AppwriteService} from '../services/appwrite.service';
import { HeaderComponent } from "../header/header.component";

@Component({
  selector: 'app-chat',
  imports: [AudioPlayerComponent, FormsModule, NgClass, HeaderComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})

export class ChatComponent implements OnInit, OnDestroy{

  mediaRecorder!: MediaRecorder;
  audioChunks: Blob[] = [];
  audioUrl: string = '';
  isRecording = false;

  message: string = '';
  messages: MessageInterface[] = [];

  searchTerm: string = '';
  users: UserInterface[] = [];
  private stopPresence?: () => void;
  private unsubscribePresence?: () => void;

  get filteredUsers(): UserInterface[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.users;
    return this.users.filter(u =>
      u.name.toLowerCase().includes(term) ||
      u.lastMessage.toLowerCase().includes(term)
    );
  }

  selectedUserId: string | null = null;

  get selectedUser(): UserInterface | null {
    return this.users.find(u => u.id === this.selectedUserId) ?? null;
  }

  ngOnDestroy() {
    if (this.unsubscribeRealtime) this.unsubscribeRealtime();
    if (this.unsubscribePresence) this.unsubscribePresence();
    if (this.stopPresence) this.stopPresence();
  }

  selectUser(user: UserInterface) {
    this.selectedUserId = user.id;
    this.loadMessagesForSelectedUser();
  }

  private unsubscribeRealtime?: () => void;

  constructor(private cdr: ChangeDetectorRef, private appWrite: AppwriteService) {
  }

  ngOnInit() {
    this.appWrite.getUser().then(async (user) => {
      // Ensure user has a name before connecting to realtime/presence
      let displayName = (user as any).name;
      if (!displayName || displayName.trim().length === 0) {
        const result = await Swal.fire({
          title: 'Set your name',
          input: 'text',
          inputLabel: 'Please enter a display name',
          inputPlaceholder: 'Your name',
          allowOutsideClick: false,
          allowEscapeKey: false,
          inputValidator: (value: string) => {
            if (!value || value.trim().length < 2) {
              return 'Please enter at least 2 characters';
            }
            return undefined;
          },
          confirmButtonText: 'Save'
        });
        if (result.isConfirmed && result.value) {
          const updated = await this.appWrite.ensureUserName(result.value.trim());
          displayName = (updated as any).name;
        }
      }
      // Start presence heartbeat and initial load (no-op if not configured)
      this.stopPresence = await this.appWrite.startPresenceHeartbeat();
      await this.loadOnlineUsers();
      // Subscribe to presence updates (no-op if not configured)
      this.unsubscribePresence = this.appWrite.subscribeToPresence(() => {
        this.loadOnlineUsers();
      });
    })
  }

  async startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.mediaRecorder = new MediaRecorder(stream);
    this.audioChunks = [];
    this.isRecording = true;

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.audioChunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.audioUrl = URL.createObjectURL(audioBlob);
      this.sendAudioMsg(this.audioUrl)
    };

    this.mediaRecorder.start();
  }

  async stopRecording() {
    this.mediaRecorder?.stop();
    this.isRecording = false;

    // Stop all microphone streams
    this.mediaRecorder?.stream?.getTracks().forEach((track) => track.stop());
  }

  private async loadOnlineUsers() {
    try {
      const [docs, me] = await Promise.all([
        this.appWrite.listOnlineUsers(60),
        this.appWrite.getUser().catch(() => null)
      ]);
      const myId = me?.$id ?? null;
      this.users = docs
        .filter((d: any) => (myId ? d.userId !== myId : true))
        .map((d: any) => ({
        id: d.userId,
        name: d.name || 'User',
        avatarUrl: d.avatarUrl || 'assets/images/profile.jpeg',
        lastMessage: '',
        lastActiveTime: new Date(d.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Failed to load online users', e);
    }
  }

  async sendTextMessage() {
    const text = this.message.trim();
    if (!text) return;
    if (!this.selectedUserId) {
      console.warn('No user selected. Select a user to start chatting.');
      return;
    }

    const now = new Date();
    const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Optimistic UI update
    const tempId = 'temp-' + now.getTime();
    const currentUser = await this.appWrite.getUser().catch(() => null);
    const myId = currentUser?.$id ?? 'anonymous';
    this.messages.push({
      id: tempId,
      type: 'text',
      data: text,
      dateTime: localTime,
      isSentByMe: true,
      senderId: myId
    });
    this.message = '';

    try {
      const created = await this.appWrite.createTextMessage({
        chatId: this.selectedUserId ?? 'default',
        senderId: myId,
        text,
        sentAt: now.toISOString()
      });

      // Replace temp message id with real document id
      const idx = this.messages.findIndex(m => m.id === tempId);
      if (idx !== -1) {
        this.messages[idx].id = created.$id;
      }
      // Realtime delivery handled by Appwrite subscription
    } catch (err) {
      console.error('Failed to persist message to Appwrite', err);
      // Optionally revert optimistic update
    }
  }

  private async loadMessagesForSelectedUser() {
    if (!this.selectedUserId) return;
    try {
      // Setup realtime subscription for current chat
      if (this.unsubscribeRealtime) {
        this.unsubscribeRealtime();
        this.unsubscribeRealtime = undefined;
      }
      const [currentUser] = await Promise.all([
        this.appWrite.getUser().catch(() => null)
      ]);

      const myId = currentUser?.$id ?? null;

      // Load both directions: messages where chatId is either me or selected user
      const docs = await this.appWrite.listMessages(this.selectedUserId, myId || undefined);
      this.messages = docs.map((d: any) => {
        const isAudio = d.type === 'audio';
        return {
          id: d.$id,
          type: isAudio ? 'audio' : 'text',
          data: isAudio ? d.url : d.text,
          dateTime: new Date(d.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSentByMe: myId ? d.senderId === myId : false,
          senderId: d.senderId
        } as MessageInterface;
      });
      this.cdr.detectChanges();

      // subscribe after initial load to avoid duplicating loaded docs
      if (myId) {
        this.unsubscribeRealtime = this.appWrite.subscribeToConversation(this.selectedUserId, myId, async (doc: any) => {
          // Ignore duplicates for messages we just optimistically added: if exists by id, skip
          if (this.messages.some(m => m.id === doc.$id)) return;
          const me = await this.appWrite.getUser().catch(() => null);
          const myId2 = me?.$id ?? null;
          const isAudio = doc.type === 'audio';
          const payload = isAudio ? doc.url : doc.text;
          this.messages.push({
            id: doc.$id,
            type: isAudio ? 'audio' : 'text',
            data: payload,
            dateTime: new Date(doc.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSentByMe: myId2 ? doc.senderId === myId2 : false,
            senderId: doc.senderId
          });
          this.cdr.detectChanges();
        });
      }
    } catch (e) {
      console.error('Failed to load messages', e);
    }
  }

  onComposerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendTextMessage();
    }
  }

  async sendAudioMsg(audioDataUrl: string) {
    const now = new Date();
    const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const currentUser = await this.appWrite.getUser().catch(() => null);
    const myId = currentUser?.$id ?? 'anonymous';

    // Optimistic UI: show local blob URL
    const tempId = 'temp-audio-' + now.getTime();
    this.messages.push({
      id: tempId,
      type: 'audio',
      data: audioDataUrl,
      dateTime: localTime,
      isSentByMe: true,
      senderId: myId
    });
    this.cdr.detectChanges();

    try {
      // Convert local blob URL to Blob
      const audioBlob = await (await fetch(audioDataUrl)).blob();
      const created = await this.appWrite.uploadAudioAndCreateMessage({
        chatId: this.selectedUserId ?? 'default',
        senderId: myId,
        audioBlob,
        sentAt: now.toISOString()
      });

      // Replace temp message with remote URL
      const idx = this.messages.findIndex(m => m.id === tempId);
      if (idx !== -1) {
        this.messages[idx].id = created.doc.$id;
        this.messages[idx].data = created.url;
      }
    } catch (e) {
      console.error('Failed to upload audio message', e);
    }
  }
}
