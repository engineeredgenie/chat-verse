import {ChangeDetectorRef, Component, OnInit} from '@angular/core';
import {AudioPlayerComponent} from '../audio-player/audio-player.component';
import {FormsModule} from '@angular/forms';
import {NgClass} from '@angular/common';
import { MessageInterface } from '../interfaces';
import {AppwriteService} from '../services/appwrite.service';

@Component({
  selector: 'app-chat',
  imports: [AudioPlayerComponent, FormsModule, NgClass],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})

export class ChatComponent implements OnInit{

  mediaRecorder!: MediaRecorder;
  audioChunks: Blob[] = [];
  audioUrl: string = '';
  isRecording = false;

  message: string = '';
  messages: MessageInterface[] = [];

  constructor(private cdr: ChangeDetectorRef, private appWrite: AppwriteService) {
  }

  ngOnInit() {
    this.appWrite.getUser().then((user) => {
      console.log(user)
      //TODO: get name from the user if name is already not set
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

  sendTextMessage() {
    this.messages.push({
      id: '1',
      type: 'text',
      data: this.message,
      dateTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSentByMe: true
    });
    this.message = '';
  }

  sendAudioMsg(audioData: any) {
    this.messages.push({
      id: '2',
      type: 'audio',
      data: audioData,
      dateTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSentByMe: true
    })
    this.cdr.detectChanges();
    console.log(this.messages)
  }
}
